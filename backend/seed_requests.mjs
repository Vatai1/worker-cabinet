import { query, getClient } from './src/config/database.js';

const client = await getClient();

try {
  // Clean existing requests first
  await client.query('DELETE FROM vacation_request_status_history');
  await client.query('DELETE FROM vacation_requests');
  console.log('Cleaned existing requests');

  // Ivanov (user=2) requests
  const ivanovRequests = [
    // Approved annual: 14-25 Jan
    {user_id: 2, start: '2026-01-14', end: '2026-01-25', duration: 12, type: 1, status: 2, comment: 'Новый год отметил, пора и отдохнуть'},
    // On approval pending: 11-22 Aug  
    {user_id: 2, start: '2026-08-11', end: '2026-08-22', duration: 12, type: 1, status: 1, comment: 'Плановый отпуск на август'},
    // On approval pending: 25-28 Mar
    {user_id: 2, start: '2026-03-25', end: '2026-03-28', duration: 4, type: 1, status: 1, comment: 'Короткий отпуск'},
    // Rejected: 5-9 May
    {user_id: 2, start: '2026-05-05', end: '2026-05-09', duration: 5, type: 1, status: 3, rejection: 'В эти даты критический релиз, перенесите на июнь'},
    // Unpaid: 15-16 Feb
    {user_id: 2, start: '2026-02-15', end: '2026-02-16', duration: 2, type: 2, status: 2, comment: 'По семейным обстоятельствам'},
    // Cancelled by employee: 1-3 Apr
    {user_id: 2, start: '2026-04-01', end: '2026-04-03', duration: 3, type: 1, status: 4},
    // Another pending: 7-11 Sep
    {user_id: 2, start: '2026-09-07', end: '2026-09-11', duration: 5, type: 2, status: 1, comment: 'Нужно съездить по делам'},
  ];

  // Yaroslav (user=14) requests 
  const yaroslavRequests = [
    // Rejected
    {user_id: 14, start: '2026-06-01', end: '2026-06-14', duration: 14, type: 1, status: 3, rejection: 'Совпадает с отпуском Иванова'},
    // Pending
    {user_id: 14, start: '2026-08-14', end: '2026-08-25', duration: 12, type: 1, status: 1, comment: 'Хочу в отпуск с Ивановым'},
    // Approved
    {user_id: 14, start: '2026-02-10', end: '2026-02-21', duration: 12, type: 1, status: 2},
    // Pending (for more variety)
    {user_id: 14, start: '2026-09-20', end: '2026-09-30', duration: 11, type: 1, status: 1, comment: 'На сентябрь'},
  ];

  // Also add some requests for other dev dept users (ids 7-9 ish, let me check)
  // IDs after 3: we saw 14, let me add a few more from dev dept
  const otherRequest = [
    {user_id: 1, start: '2026-07-01', end: '2026-07-21', duration: 21, type: 1, status: 2}, // admin
    {user_id: 1, start: '2026-10-01', end: '2026-10-05', duration: 5, type: 2, status: 1, comment: 'Отпуск за свой счёт'},
    {user_id: 3, start: '2026-09-01', end: '2026-09-12', duration: 12, type: 1, status: 2, comment: 'Личный отпуск Петрова'}, // petrov himself
    {user_id: 3, start: '2026-12-15', end: '2026-12-26', duration: 12, type: 1, status: 1, comment: 'Новогодний отпуск'},
    {user_id: 3, start: '2026-04-20', end: '2026-04-24', duration: 5, type: 2, status: 1, comment: 'По личным делам'},
  ];

  const allRequests = [...ivanovRequests, ...yaroslavRequests, ...otherRequest];

  for (const r of allRequests) {
    const result = await client.query(
      `INSERT INTO vacation_requests (user_id, start_date, end_date, duration, vacation_type_id, status_id, comment, rejection_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [r.user_id, r.start, r.end, r.duration, r.type, r.status, r.comment || null, r.rejection || null]
    );

    // Also add to status history
    await client.query(
      `INSERT INTO vacation_request_status_history (request_id, status_id, changed_by, comment)
       VALUES ($1, $2, $3, $4)`,
      [result.rows[0].id, r.status, r.user_id, r.comment || null]
    );

    // If approved/rejected, also add the change by manager
    if (r.status === 2) {
      await client.query(
        `INSERT INTO vacation_request_status_history (request_id, status_id, changed_by)
         VALUES ($1, $2, $3)`,
        [result.rows[0].id, r.status, 3]
      );
    }
    if (r.status === 3) {
      await client.query(
        `INSERT INTO vacation_request_status_history (request_id, status_id, changed_by, comment)
         VALUES ($1, $2, $3, $4)`,
        [result.rows[0].id, r.status, 3, r.rejection]
      );
    }
  }
  console.log(`Inserted ${allRequests.length} vacation requests`);
} catch (e) {
  console.error('Error:', e.message);
} finally {
  client.release();
}

// Update vacation balances to reflect used days properly
await query(`UPDATE vacation_balances SET used_days = (
  SELECT COALESCE(SUM(duration), 0) FROM vacation_requests 
  WHERE user_id = vacation_balances.user_id AND status_id = 2
), available_days = total_days - (
  SELECT COALESCE(SUM(duration), 0) FROM vacation_requests 
  WHERE user_id = vacation_balances.user_id AND status_id = 2
)`);
console.log('Updated vacation balances');

import { query } from './src/config/database.js';

// Check users and departments
const users = await query(`SELECT id, email, department_id FROM users WHERE 
  email IN ('ivanov@example.com', 'petrov@example.com', 'ярослав.григорьев@example.com') ORDER BY email`);
console.log('Users:', JSON.stringify(users.rows, null, 2));

// Check pending requests
const pending = await query('SELECT id, user_id, status_id, start_date, end_date FROM vacation_requests WHERE status_id = 1 ORDER BY user_id');
console.log('Pending requests:', JSON.stringify(pending.rows, null, 2));

// Check total requests per status
const stats = await query('SELECT status_id, COUNT(*) as cnt FROM vacation_requests GROUP BY status_id ORDER BY status_id');
console.log('Stats:', JSON.stringify(stats.rows, null, 2));

// Check count of requests where user is in petrov's dept and status is pending
const deptPending = await query(`SELECT COUNT(*) as cnt FROM vacation_requests vr 
  JOIN users u ON vr.user_id = u.id 
  WHERE u.department_id = (SELECT department_id FROM users WHERE id = 3) 
  AND vr.status_id = 1`);
console.log('Pending in Petrov dept:', JSON.stringify(deptPending.rows, null, 2));

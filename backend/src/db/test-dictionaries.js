import { query } from '../config/database.js'

async function testDictionaries() {
  try {
    console.log('Testing dictionaries...')

    const requestStatuses = await query('SELECT * FROM request_statuses ORDER BY sort_order')
    console.log('\nRequest Statuses:')
    console.table(requestStatuses.rows)

    const vacationTypes = await query('SELECT * FROM vacation_types ORDER BY sort_order')
    console.log('\nVacation Types:')
    console.table(vacationTypes.rows)

    const vacationRequests = await query(`
      SELECT vr.id, rs.code as status_code, rs.name as status_name, vt.code as vacation_type_code, vt.name as vacation_type_name
      FROM vacation_requests vr
      JOIN request_statuses rs ON vr.status_id = rs.id
      JOIN vacation_types vt ON vr.vacation_type_id = vt.id
      LIMIT 5
    `)
    console.log('\nSample Vacation Requests:')
    console.table(vacationRequests.rows)

    const statusHistory = await query(`
      SELECT vrsh.id, rs.code as status_code, rs.name as status_name
      FROM vacation_request_status_history vrsh
      JOIN request_statuses rs ON vrsh.status_id = rs.id
      LIMIT 5
    `)
    console.log('\nSample Status History:')
    console.table(statusHistory.rows)

    console.log('\n✅ All dictionary tests passed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

testDictionaries()

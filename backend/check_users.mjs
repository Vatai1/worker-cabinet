import { query } from './src/config/database.js';

const users = await query('SELECT id, email, last_name, first_name, role FROM users WHERE email IN ($1, $2, $3, $4) ORDER BY email', ['ivanov@example.com', 'petrov@example.com', 'admin@example.com', 'elena@example.com']);
console.log('USERS:', JSON.stringify(users.rows, null, 2));

const statuses = await query('SELECT id, code, name FROM request_statuses ORDER BY id');
console.log('STATUSES:', JSON.stringify(statuses.rows, null, 2));

const types = await query('SELECT id, code, name FROM vacation_types ORDER BY id');
console.log('TYPES:', JSON.stringify(types.rows, null, 2));

const balances = await query('SELECT * FROM vacation_balances ORDER BY user_id');
console.log('BALANCES:', JSON.stringify(balances.rows, null, 2));

const depts = await query('SELECT id, name, head_id FROM departments ORDER BY id');
console.log('DEPARTMENTS:', JSON.stringify(depts.rows, null, 2));

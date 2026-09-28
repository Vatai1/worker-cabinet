import { query } from '../config/database.js'

export async function syncMembershipDepartment(db, userId, oldDeptId, newDeptId) {
  const run = db?.query ? (text, values) => db.query(text, values) : query
  if (newDeptId != null) {
    await run(
      `UPDATE user_organizations uo SET department_id = d.id
       FROM departments d
       WHERE d.id = $2 AND uo.user_id = $1 AND uo.org_id = d.organization_id AND uo.department_id IS DISTINCT FROM d.id`,
      [userId, newDeptId]
    )
  }
  if (oldDeptId != null && Number(oldDeptId) !== Number(newDeptId)) {
    await run('UPDATE user_organizations SET department_id = NULL WHERE user_id = $1 AND department_id = $2', [userId, oldDeptId])
  }
}

export async function moveUsersToDepartment(db, userIds, targetDeptId) {
  if (userIds.length === 0) return
  const old = await db.query('SELECT id, department_id FROM users WHERE id = ANY($1)', [userIds])
  await db.query('UPDATE users SET department_id = $1 WHERE id = ANY($2)', [targetDeptId, userIds])
  for (const u of old.rows) {
    await syncMembershipDepartment(db, u.id, u.department_id, targetDeptId)
  }
}

export async function departmentMembers(db, deptId) {
  const run = db?.query ? (text, values) => db.query(text, values) : query
  const result = await run(
    `SELECT u.id, u.first_name, u.last_name, u.middle_name, u.position, u.email, u.status,
            COALESCE(u.is_test, false) AS is_test
     FROM users u
     WHERE u.department_id = $1 AND u.status <> 'inactive'
     ORDER BY u.last_name, u.first_name`,
    [deptId]
  )
  return result.rows
}

import { query } from '../config/database.js'

export async function getVisibleColleagueIds(userId) {
  const result = await query(
    `WITH me AS (
       SELECT id, department_id, manager_id, emp_child_sees_parent FROM users WHERE id = $1
     ),
     my_dept AS (
       SELECT d.id, d.parent_id, d.parent_user_id, d.emp_child_sees_parent FROM departments d JOIN me ON d.id = me.department_id
     ),
     visible_depts AS (
       SELECT department_id AS id FROM me WHERE department_id IS NOT NULL
       UNION SELECT c.id FROM departments c JOIN me ON c.parent_id = me.department_id WHERE c.emp_parent_sees_child
       UNION SELECT parent_id FROM my_dept WHERE parent_id IS NOT NULL AND emp_child_sees_parent
       UNION SELECT c.id FROM departments c WHERE c.parent_user_id = $1 AND c.emp_parent_sees_child
     ),
     visible_users AS (
       SELECT parent_user_id AS id FROM my_dept WHERE parent_user_id IS NOT NULL AND emp_child_sees_parent
       UNION SELECT s.id FROM users s WHERE s.manager_id = $1 AND s.emp_parent_sees_child
       UNION SELECT manager_id FROM me WHERE manager_id IS NOT NULL AND emp_child_sees_parent
     )
     SELECT u.id FROM users u
     WHERE u.department_id IN (SELECT id FROM visible_depts) OR u.id IN (SELECT id FROM visible_users)`,
    [userId]
  )
  return result.rows.map((r) => r.id)
}

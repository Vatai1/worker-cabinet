import { toLocalDateStr } from './dateUtils.js'
import { query } from '../config/database.js'

export async function timesheetDepartments(userId, orgId, db = { query }) {
  const { rows } = await db.query(
    `SELECT d.id, d.name FROM departments d
     JOIN user_organizations membership ON membership.user_id = $1 AND membership.org_id = d.organization_id AND membership.is_active
     JOIN users viewer ON viewer.id = membership.user_id AND viewer.status <> 'inactive'
     WHERE d.organization_id = $2 AND (
       d.manager_id = $1 OR EXISTS (SELECT 1 FROM timesheet_managers tm WHERE tm.department_id = d.id AND tm.user_id = $1)
       OR EXISTS (
         SELECT 1 FROM vacation_substitutions vs
         JOIN vacation_requests vr ON vr.id = vs.vacation_request_id AND vr.organization_id = d.organization_id
         JOIN request_statuses rs ON rs.id = vr.status_id AND rs.code = 'approved'
         JOIN user_organizations owner ON owner.user_id = vr.user_id AND owner.org_id = d.organization_id AND owner.is_active
         JOIN users owner_user ON owner_user.id = owner.user_id AND owner_user.status <> 'inactive'
         WHERE vs.substitute_user_id = $1 AND vs.organization_id = d.organization_id
           AND $3::date BETWEEN vr.start_date AND vr.end_date
           AND (d.manager_id = vr.user_id OR EXISTS (
             SELECT 1 FROM timesheet_managers tm WHERE tm.department_id = d.id AND tm.user_id = vr.user_id)))
     ) ORDER BY d.name`, [userId, orgId, toLocalDateStr(new Date())]
  )
  return rows
}

export async function auditTimesheet(db, sheet, actorId, action, data = {}) {
  await db.query(
    'INSERT INTO timesheet_audit (department_id, timesheet_id, actor_id, action, data) VALUES ($1,$2,$3,$4,$5)',
    [sheet.department_id, sheet.id ?? null, actorId, action, JSON.stringify(data)]
  )
}

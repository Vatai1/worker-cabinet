import { ConflictError, ForbiddenError, ValidationError } from '../middleware/errors.js'
import { currentOrgId } from './orgQuery.js'
import { testScopeAware } from '../utils/testScope.js'
import { auditTimesheet } from './timesheetAccess.js'

export async function saveTimesheetEmployeeSettings(db, req, changes, sheet = null) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 1000) throw new ValidationError('Укажите от 1 до 1000 сотрудников')
  const ids = new Set()
  for (const item of changes) {
    if (!item || !Number.isInteger(item.employee_id) || item.employee_id < 1 || item.employee_id > 2147483647 || ids.has(item.employee_id)) throw new ValidationError('Укажите неповторяющийся список сотрудников')
    if (Object.keys(item).some(key => !['employee_id', 'staff_number', 'hourly'].includes(key)) || (!Object.hasOwn(item, 'staff_number') && !Object.hasOwn(item, 'hourly'))) throw new ValidationError('Укажите табельный номер или режим учёта')
    if (Object.hasOwn(item, 'hourly') && typeof item.hourly !== 'boolean') throw new ValidationError('Некорректный режим учёта')
    if (Object.hasOwn(item, 'staff_number') && item.staff_number !== null && (typeof item.staff_number !== 'string' || item.staff_number.trim().length > 64)) throw new ValidationError('Табельный номер должен содержать не более 64 символов')
    ids.add(item.employee_id)
  }
  const orgId = currentOrgId(req)
  if (!orgId) throw new ValidationError('Выберите учреждение')
  await db.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [orgId])
  const { rows } = await db.query(
    `SELECT u.id, d.id AS department_id, settings.staff_number, COALESCE(settings.hourly, false) AS hourly
     FROM user_organizations uo JOIN users u ON u.id = uo.user_id
     LEFT JOIN departments d ON d.id = COALESCE(uo.department_id, u.department_id) AND d.organization_id = uo.org_id
     LEFT JOIN timesheet_employee_settings settings ON settings.user_id = u.id AND settings.organization_id = uo.org_id
     WHERE u.id = ANY($1::int[]) AND uo.org_id = $2 AND uo.is_active AND u.status <> 'inactive' AND ($3 OR NOT u.is_test)`,
    [[...ids], orgId, testScopeAware(req)])
  if (rows.length !== changes.length || (sheet && rows.some(row => row.department_id !== sheet.department_id))) throw new ForbiddenError('Сотрудники должны быть действующими участниками выбранного учреждения и отдела')
  const byId = new Map(rows.map(row => [row.id, row]))
  const next = changes.map(item => {
    const before = byId.get(item.employee_id)
    return { employee_id: item.employee_id, staff_number: Object.hasOwn(item, 'staff_number') ? item.staff_number?.trim() || null : before.staff_number, hourly: item.hourly ?? before.hourly }
  })
  const numbers = next.map(item => item.staff_number).filter(Boolean)
  if (new Set(numbers).size !== numbers.length) throw new ConflictError('Табельные номера сотрудников должны быть уникальными в учреждении')
  const used = await db.query('SELECT staff_number FROM timesheet_employee_settings WHERE organization_id = $1 AND NOT (user_id = ANY($2::int[])) AND staff_number = ANY($3::text[]) LIMIT 1', [orgId, [...ids], numbers])
  if (used.rowCount) throw new ConflictError(`Табельный номер «${used.rows[0].staff_number}» уже занят`)
  await db.query('UPDATE timesheet_employee_settings SET staff_number = NULL WHERE organization_id = $1 AND user_id = ANY($2::int[])', [orgId, [...ids]])
  const result = await db.query(
    `INSERT INTO timesheet_employee_settings (user_id, organization_id, staff_number, hourly)
     SELECT user_id, $1, staff_number, hourly FROM unnest($2::int[], $3::text[], $4::boolean[]) AS settings(user_id, staff_number, hourly)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET staff_number = EXCLUDED.staff_number, hourly = EXCLUDED.hourly
     RETURNING user_id AS employee_id, staff_number, hourly`,
    [orgId, next.map(item => item.employee_id), next.map(item => item.staff_number), next.map(item => item.hourly)])
  for (const after of next) {
    const before = byId.get(after.employee_id)
    if (before.staff_number === after.staff_number && before.hourly === after.hourly) continue
    if (before.department_id) await auditTimesheet(db, sheet ?? { department_id: before.department_id }, req.user.id, 'Настройки работника', { employee_id: after.employee_id, before: { staff_number: before.staff_number, hourly: before.hourly }, after: { staff_number: after.staff_number, hourly: after.hourly } })
  }
  await db.query(
    `INSERT INTO audit_log (user_id, user_name, action, entity_type, details, real_user_id)
     SELECT id, CONCAT_WS(' ', last_name, first_name, middle_name), 'Настройки сотрудников табеля', 'timesheet', $2, $3 FROM users WHERE id = $1`,
    [req.user.id, JSON.stringify({ organization_id: orgId, changes: next }), req.realUser?.id ?? null])
  return result.rows
}

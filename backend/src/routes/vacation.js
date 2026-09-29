import express from 'express'
import { randomUUID } from 'node:crypto'
import { query, getClient } from '../config/database.js'
import { authenticateToken, authorizeRoles } from '../middleware/auth.js'
import { getFromS3 } from '../config/s3.js'
import { notify } from '../config/notifications.js'
import { broadcastToOrg } from '../config/ws.js'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import { orgScopedQuery, currentOrgId } from '../lib/orgQuery.js'
import { excludeTest } from '../utils/testScope.js'
import { resolveVacationDays, applyRuleToExistingBalances } from '../lib/vacationDays.js'
import { getVisibleColleagueIds } from '../lib/colleagues.js'

const router = express.Router()

const VALID_VACATION_TYPES = ['annual_paid', 'unpaid', 'educational', 'maternity', 'child_care', 'additional', 'veteran']
const MAX_HOLIDAYS_PER_VACATION = 5

class VacationValidationError extends Error {}

function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function formatISODate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function addDaysISO(dateStr, days) {
  const d = parseISODate(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return formatISODate(d)
}

function daysBetweenInclusive(startStr, endStr) {
  return Math.round((parseISODate(endStr) - parseISODate(startStr)) / 86400000) + 1
}

function todayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

async function computeVacationDates(startDate, endDate) {
  if (startDate < todayISO()) {
    return { startDate, endDate, countedDays: daysBetweenInclusive(startDate, endDate), holidaysCount: 0 }
  }

  const holidaysResult = await query('SELECT day FROM calendar_holidays WHERE day BETWEEN $1 AND $2', [startDate, endDate])
  const holidaysCount = holidaysResult.rows.length

  if (holidaysCount === 0) {
    return { startDate, endDate, countedDays: daysBetweenInclusive(startDate, endDate), holidaysCount: 0 }
  }

  if (holidaysCount > MAX_HOLIDAYS_PER_VACATION) {
    throw new VacationValidationError(`Отпуск содержит слишком много праздничных дней (${holidaysCount}). Максимум — ${MAX_HOLIDAYS_PER_VACATION}`)
  }

  const countedDays = daysBetweenInclusive(startDate, endDate) - holidaysCount

  return { startDate, endDate, countedDays, holidaysCount }
}

function fmtDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`
}

async function getEmpName(userId) {
  const r = await query('SELECT first_name, last_name FROM users WHERE id = $1', [userId])
  const row = r.rows[0]
  return row ? `${row.last_name} ${row.first_name}` : ''
}

async function resolveApproverId(userId, orgId, req) {
  const userResult = await query('SELECT department_id FROM users WHERE id = $1', [userId])
  const ownDeptId = userResult.rows[0]?.department_id || null
  const visitedDepts = new Set()

  if (ownDeptId && !visitedDepts.has(ownDeptId)) {
    visitedDepts.add(ownDeptId)
    const dRes = await query('SELECT manager_id, parent_id, parent_user_id, vac_parent_approves FROM departments WHERE id = $1', [ownDeptId])
    const d = dRes.rows[0]
    if (d) {
      if (d.manager_id !== null && d.manager_id !== userId) return d.manager_id
      const parentsAllowed = d.vac_parent_approves !== false
      if (parentsAllowed && d.parent_user_id !== null && d.parent_user_id !== userId) return d.parent_user_id
      if (parentsAllowed) {
        let pId = d.parent_id
        while (pId && !visitedDepts.has(pId)) {
          visitedDepts.add(pId)
          const pRes = await query('SELECT manager_id, parent_id, parent_user_id, vac_parent_approves FROM departments WHERE id = $1', [pId])
          const p = pRes.rows[0]
          if (!p) break
          if (p.manager_id !== null && p.manager_id !== userId) return p.manager_id
          if (p.vac_parent_approves !== false && p.parent_user_id !== null && p.parent_user_id !== userId) return p.parent_user_id
          pId = p.parent_id
        }
      }
    }
  }

  const visitedOrgs = new Set()
  let currentOrgId = orgId
  while (currentOrgId && !visitedOrgs.has(currentOrgId)) {
    visitedOrgs.add(currentOrgId)
    const orgResult = await query('SELECT head_id, parent_id FROM organizations WHERE id = $1', [currentOrgId])
    const org = orgResult.rows[0]
    if (!org) break
    if (org.head_id !== null && org.head_id !== userId) return org.head_id
    currentOrgId = org.parent_id
  }

  return null
}

async function getApproverIds(approverId, req) {
  if (!approverId) return []
  const orgClause = req.org ? ' AND vs.organization_id = $2' : ''
  const r = await query(
    `SELECT vs.substitute_user_id
     FROM vacation_substitutions vs
     JOIN vacation_requests vr ON vs.vacation_request_id = vr.id
     JOIN request_statuses rs ON vr.status_id = rs.id
     WHERE vr.user_id = $1 AND rs.code = 'approved'
       AND vr.start_date <= CURRENT_DATE AND vr.end_date >= CURRENT_DATE${orgClause}`,
    req.org ? [approverId, req.org.org_id] : [approverId]
  )
  if (r.rows.length > 0) return [approverId, ...r.rows.map((row) => row.substitute_user_id)]
  return [approverId]
}

async function canReviewVacation(vacationRequest, req) {
  if (['hr', 'admin', 'superadmin'].includes(req.user.role)) return true
  if (!vacationRequest.approver_id) return false
  if (vacationRequest.approver_id === req.user.id) return true
  const approverIds = await getApproverIds(vacationRequest.approver_id, req)
  return approverIds.includes(req.user.id)
}

const childSeesParentVacations = (n) => `EXISTS (
  SELECT 1 FROM departments vd
  WHERE vd.id = (SELECT department_id FROM users WHERE id = $${n})
    AND vd.vac_child_sees_parent
    AND rs.code = 'approved'
    AND (
      (vd.parent_user_id IS NOT NULL AND vr.user_id = vd.parent_user_id)
      OR (vd.parent_id IS NOT NULL AND vr.user_id IN (SELECT pu.id FROM users pu WHERE pu.department_id = vd.parent_id))
    )
)`

const userParentSeesChildVacations = (n) => `vr.user_id IN (SELECT id FROM users WHERE manager_id = $${n} AND vac_parent_sees_child)`

const userChildSeesParentVacations = (n) => `(vr.user_id = (SELECT manager_id FROM users WHERE id = $${n}) AND (SELECT vac_child_sees_parent FROM users WHERE id = $${n}) AND rs.code = 'approved')`

const substExistsClause = (n) => `EXISTS (
  SELECT 1
  FROM vacation_substitutions vs
  JOIN vacation_requests mvr ON vs.vacation_request_id = mvr.id
  JOIN request_statuses mrs ON mvr.status_id = mrs.id
  WHERE vr.approver_id = mvr.user_id
    AND vs.substitute_user_id = $${n}
    AND mrs.code = 'approved'
    AND mvr.start_date <= CURRENT_DATE AND mvr.end_date >= CURRENT_DATE
)`

async function notifyVacationCreated(request, employeeId, req) {
  const empName = await getEmpName(employeeId)
  const payload = {
    requestId: request.id,
    employeeId,
    employeeName: empName,
    startDate: fmtDate(request.start_date),
    endDate: fmtDate(request.end_date),
    days: request.duration,
    link: '/leader'
  }
  if (request.approver_id) {
    const approverIds = await getApproverIds(request.approver_id, req)
    for (const mid of approverIds) {
      notify({ userId: mid, type: 'vacation_created', data: payload })
        .catch((err) => console.warn(`[NOTIFY] vacation create #${request.id}: ${err.message}`))
    }
    return
  }
  const orgClause = req.org ? ' AND uo.org_id = $1' : ''
  const hrResult = await query(
    `SELECT u.id FROM users u
     JOIN user_organizations uo ON uo.user_id = u.id
     WHERE u.role = 'hr' AND u.status <> 'inactive' AND uo.is_active = true${orgClause}`,
    req.org ? [req.org.org_id] : []
  )
  for (const row of hrResult.rows) {
    notify({ userId: row.id, type: 'vacation_created', data: payload })
      .catch((err) => console.warn(`[NOTIFY] vacation create #${request.id} hr: ${err.message}`))
  }
}

function notifyVacationChanged(req, requestId, action) {
  const orgId = currentOrgId(req)
  if (!orgId) return
  broadcastToOrg(orgId, 'vacation_changed', { requestId, action, actorId: req.user.id, organizationId: orgId })
}

async function vacationDatesByMonth(startDate, endDate) {
  const byMonth = {}
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const endMs = new Date(ey, em - 1, ed).getTime()
  for (let d = new Date(sy, sm - 1, sd); d.getTime() <= endMs; d.setDate(d.getDate() + 1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const key = ds.slice(0, 7)
    if (!byMonth[key]) byMonth[key] = { year: Number(ds.slice(0, 4)), month: Number(ds.slice(5, 7)), dates: [] }
    byMonth[key].dates.push(ds)
  }
  return byMonth
}

async function fillVacationTimesheetEntries(client, userId, startDate, endDate, req) {
  const deptResult = await client.query(`SELECT department_id FROM users WHERE id = $1`, [userId])
  const deptId = deptResult.rows[0]?.department_id
  if (!deptId) return
  const holidaysResult = await client.query('SELECT day FROM calendar_holidays WHERE day BETWEEN $1 AND $2', [startDate, endDate])
  const holidaySet = new Set(holidaysResult.rows.map((r) => r.day))
  const byMonth = await vacationDatesByMonth(startDate, endDate)
  for (const { year, month, dates: allDates } of Object.values(byMonth)) {
    const dates = allDates.filter((d) => !holidaySet.has(d))
    if (dates.length === 0) continue
    const tsOrgClause = req.org ? ' AND organization_id = $4' : ''
    const tsResult = await client.query(
      `SELECT id FROM timesheets WHERE department_id = $1 AND year = $2 AND month = $3 AND status != 'approved'${tsOrgClause}`,
      req.org ? [deptId, year, month, req.org.org_id] : [deptId, year, month]
    )
    if (tsResult.rows.length === 0) continue
    const tsId = tsResult.rows[0].id
    const orgCol = req.org ? ', organization_id' : ''
    const orgParam = req.org ? `, $${dates.length + 3}` : ''
    const placeholders = dates.map((_, i) => `($1, $2, $${i + 3}, 'ОТ'${orgParam})`).join(', ')
    await client.query(
      `INSERT INTO timesheet_entries (timesheet_id, employee_id, date, code${orgCol})
       VALUES ${placeholders}
       ON CONFLICT (timesheet_id, employee_id, date) DO UPDATE SET code = 'ОТ'`,
      req.org ? [tsId, userId, ...dates, req.org.org_id] : [tsId, userId, ...dates]
    )
  }
}

async function clearVacationTimesheetEntries(client, userId, startDate, endDate, req) {
  const deptResult = await client.query(`SELECT department_id FROM users WHERE id = $1`, [userId])
  const deptId = deptResult.rows[0]?.department_id
  if (!deptId) return
  const byMonth = await vacationDatesByMonth(startDate, endDate)
  for (const { year, month, dates } of Object.values(byMonth)) {
    const tsOrgClause = req.org ? ' AND organization_id = $4' : ''
    const tsResult = await client.query(
      `SELECT id FROM timesheets WHERE department_id = $1 AND year = $2 AND month = $3 AND status != 'approved'${tsOrgClause}`,
      req.org ? [deptId, year, month, req.org.org_id] : [deptId, year, month]
    )
    if (tsResult.rows.length === 0) continue
    const tsId = tsResult.rows[0].id
    const delOrgClause = req.org ? ' AND organization_id = $4' : ''
    await client.query(
      `DELETE FROM timesheet_entries
       WHERE timesheet_id = $1 AND employee_id = $2 AND date = ANY($3) AND code = 'ОТ'${delOrgClause}`,
      req.org ? [tsId, userId, dates, req.org.org_id] : [tsId, userId, dates]
    )
  }
}

function extractYear(date) {
  if (!date) return new Date().getFullYear()
  if (typeof date === 'string') return parseInt(date.substring(0, 4))
  if (date instanceof Date) return date.getFullYear()
  return new Date(date).getFullYear()
}

async function institutionHeadData(req) {
  const orgId = req.org?.org_id
  const empty = { head_full_name: '', head_short_name: '', head_initials_name: '', head_position: '' }
  if (!orgId) return empty
  const h = (await query(
    `SELECT u.first_name, u.last_name, u.middle_name, u.position
     FROM organizations o JOIN users u ON u.id = o.head_id WHERE o.id = $1`,
    [orgId]
  )).rows[0]
  if (!h) return empty
  const initials = [h.first_name?.[0], h.middle_name?.[0]].filter(Boolean).map((c) => `${c}.`).join('')
  return {
    head_full_name: [h.last_name, h.first_name, h.middle_name].filter(Boolean).join(' '),
    head_short_name: [h.last_name, initials].filter(Boolean).join(' '),
    head_initials_name: [initials, h.last_name].filter(Boolean).join(' '),
    head_position: h.position || '',
  }
}

function applyYearPlaceholders(zip, year) {
  const yearStr = String(year)
  for (const fileName of Object.keys(zip.files)) {
    const file = zip.files[fileName]
    if (file.dir) continue
    const content = file.asText()
    if (!content.includes('{{selected_year}}') && !content.includes('{{year}}')) continue
    zip.file(fileName, content.replaceAll('{{selected_year}}', yearStr).replaceAll('{{year}}', yearStr))
  }
}

/**
 * @swagger
 * /vacation/requests:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить список заявок на отпуск
 *     description: 'Работник видит свои заявки, approved-заявки всей организации и заявки по связям иерархии (кураторства, родители, подчинённые); руководитель — также заявки, которые согласовывает'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [on_approval, approved, rejected, cancelled_by_employee, cancelled_by_manager] }
 *       - in: query
 *         name: departmentId
 *         schema: { type: integer }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [connections] }
 *         description: 'connections — только заявки по связям иерархии (подчинённые, курируемые отделы, родители)'
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: vacationType
 *         schema: { type: string }
 *         description: 'Код типа отпуска (annual_paid, unpaid, ...)'
 *       - in: query
 *         name: tagId
 *         schema: { type: integer }
 *         description: 'Тег (справочник skills): только заявки работников с этим тегом'
 *     responses:
 *       200:
 *         description: Список заявок
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/VacationRequest' }
 */
router.get('/requests', authenticateToken, async (req, res) => {
  try {
    const { userId, status, departmentId, year, scope, vacationType, tagId } = req.query
    const user = req.user

    let whereClause = 'WHERE 1=1'
    const params = []
    if (req.org) {
      whereClause += ' AND vr.organization_id = $' + (params.length + 1)
      params.push(req.org.org_id)
    }
    whereClause += ' ' + excludeTest(req, 'u')
    if (!userId) whereClause += " AND u.status <> 'inactive'"

    if (scope === 'connections') {
      whereClause += ` AND (${userParentSeesChildVacations(params.length + 1)} OR u.department_id IN (SELECT id FROM departments WHERE parent_user_id = $${params.length + 1} AND vac_parent_sees_child) OR ${userChildSeesParentVacations(params.length + 1)} OR ${childSeesParentVacations(params.length + 1)})`
      params.push(user.id)
    } else if (userId) {
      if (parseInt(userId) !== user.id) {
        if (user.role === 'employee') {
          return res.status(403).json({ error: 'Доступ запрещён' })
        }
        const hasAccess = await query(
          'SELECT 1 FROM users WHERE id = $1 AND manager_id = $2',
          [userId, user.id]
        )
        if (hasAccess.rows.length === 0) {
          return res.status(403).json({ error: 'Доступ запрещён' })
        }
      }
      whereClause += ' AND vr.user_id = $' + (params.length + 1)
      params.push(userId)
    } else if (departmentId) {
      if (user.role === 'employee') {
        whereClause += ` AND ((u.department_id = $${params.length + 1} AND rs.code = $${params.length + 2}) OR u.department_id IN (SELECT id FROM departments WHERE parent_user_id = $${params.length + 3} AND vac_parent_sees_child) OR ${childSeesParentVacations(params.length + 3)} OR ${userParentSeesChildVacations(params.length + 3)} OR ${userChildSeesParentVacations(params.length + 3)})`
        params.push(departmentId, 'approved', user.id)
      } else {
        whereClause += ' AND u.department_id = $' + (params.length + 1)
        params.push(departmentId)
      }
    } else {
      const substExists = ` OR ${substExistsClause(params.length + 1)}`
      if (user.role === 'employee') {
        whereClause += ` AND (vr.user_id = $${params.length + 1} OR rs.code = 'approved' OR u.department_id IN (SELECT id FROM departments WHERE parent_user_id = $${params.length + 1} AND vac_parent_sees_child) OR ${childSeesParentVacations(params.length + 1)} OR ${userParentSeesChildVacations(params.length + 1)} OR ${userChildSeesParentVacations(params.length + 1)}${substExists})`
        params.push(user.id)
      } else if (user.role === 'manager') {
        whereClause += ` AND (vr.user_id = $${params.length + 1} OR rs.code = 'approved' OR vr.approver_id = $${params.length + 1} OR u.department_id IN (SELECT id FROM departments WHERE parent_user_id = $${params.length + 1} AND vac_parent_sees_child) OR ${userParentSeesChildVacations(params.length + 1)}${substExists})`
        params.push(user.id)
      }
    }

    if (status) {
      whereClause += ' AND rs.code = $' + (params.length + 1)
      params.push(status)
    }

    if (year) {
      whereClause += ' AND EXTRACT(YEAR FROM vr.start_date) = $' + (params.length + 1)
      params.push(year)
    }

    if (vacationType) {
      whereClause += ' AND vt.code = $' + (params.length + 1)
      params.push(vacationType)
    }

    if (tagId) {
      const tagIdInt = parseInt(tagId)
      if (!Number.isNaN(tagIdInt)) {
        whereClause += ` AND vr.user_id IN (SELECT user_id FROM user_skills WHERE skill_id = $${params.length + 1})`
        params.push(tagIdInt)
      }
    }

    const sql = `
      SELECT
        vr.*,
        rs.code as status,
        rs.name as status_name,
        vt.code as vacation_type,
        vt.name as vacation_type_name,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.avatar,
        u.gender,
        u.department_id,
        d.name as department_name,
        d.manager_id as department_manager_id,
        COALESCE(
          json_agg(
            json_build_object(
              'id', vrsh.id,
              'status', vrsh_rs.code,
              'statusName', vrsh_rs.name,
              'changedAt', vrsh.changed_at,
              'changedBy', vrsh.changed_by,
              'changedByName', hu.last_name || ' ' || hu.first_name || COALESCE(' ' || NULLIF(hu.middle_name, ''), ''),
              'comment', vrsh.comment
            ) ORDER BY vrsh.changed_at
          ) FILTER (WHERE vrsh.id IS NOT NULL),
          '[]'
        ) as status_history
      FROM vacation_requests vr
      JOIN users u ON vr.user_id = u.id
      JOIN request_statuses rs ON vr.status_id = rs.id
      LEFT JOIN vacation_types vt ON vr.vacation_type_id = vt.id
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN vacation_request_status_history vrsh ON vr.id = vrsh.request_id
      LEFT JOIN request_statuses vrsh_rs ON vrsh.status_id = vrsh_rs.id
      LEFT JOIN users hu ON vrsh.changed_by = hu.id
      ${whereClause}
      GROUP BY vr.id, u.id, d.id, rs.id, vt.id
      ORDER BY vr.created_at DESC
    `

    const result = await query(sql, params)

    const requestIds = result.rows.map((r) => r.id)
    let subsByRequest = {}
    let delegatedByUser = {}
    if (requestIds.length > 0) {
      const subsResult = await query(
        `SELECT vs.vacation_request_id, u.id, u.first_name, u.last_name, u.middle_name, u.position, u.avatar
         FROM vacation_substitutions vs
         JOIN users u ON vs.substitute_user_id = u.id
         WHERE vs.vacation_request_id = ANY($1)`,
        [requestIds]
      )
      for (const row of subsResult.rows) {
        if (!subsByRequest[row.vacation_request_id]) subsByRequest[row.vacation_request_id] = []
        subsByRequest[row.vacation_request_id].push({
          id: row.id, first_name: row.first_name, last_name: row.last_name, middle_name: row.middle_name,
          position: row.position, avatar: row.avatar
        })
      }

      const onApprovalUserIds = result.rows
        .filter((r) => r.status === 'on_approval')
        .map((r) => r.user_id)
      if (onApprovalUserIds.length > 0) {
        const delegationResult = await query(
          `SELECT DISTINCT u.id as user_id, sub.id as delegate_id,
                  sub.first_name, sub.last_name, sub.middle_name, sub.position, sub.avatar
           FROM users u
           JOIN departments d ON u.department_id = d.id
           JOIN vacation_requests mvr ON mvr.user_id = d.manager_id
           JOIN request_statuses mrs ON mvr.status_id = mrs.id
           JOIN vacation_substitutions mvs ON mvs.vacation_request_id = mvr.id
           JOIN users sub ON mvs.substitute_user_id = sub.id
           WHERE u.id = ANY($1)
             AND mrs.code = 'approved'
             AND mvr.start_date <= CURRENT_DATE AND mvr.end_date >= CURRENT_DATE`,
          [onApprovalUserIds]
        )
        for (const row of delegationResult.rows) {
          delegatedByUser[row.user_id] = {
            id: row.delegate_id, first_name: row.first_name, last_name: row.last_name, middle_name: row.middle_name,
            position: row.position, avatar: row.avatar
          }
        }
      }
    }

    const requests = result.rows.map((request) => ({
      ...request,
      status_code: request.status,
      vacation_type_code: request.vacation_type,
      statusHistory: request.status_history,
      departmentManagerId: request.department_manager_id,
      substitutes: subsByRequest[request.id] || [],
      delegated_to: delegatedByUser[request.user_id] || null,
    }))

    res.json(requests)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось загрузить заявки на отпуск' })
  }
})

/**
 * @swagger
 * /vacation/upcoming/{userId}:
 *   get:
 *     tags: [Vacation]
 *     summary: Запланированные отпуска работника
 *     description: 'Предстоящие заявки (approved и on_approval, start_date >= сегодня) и текущие approved-отпуска (start_date <= сегодня <= end_date), отсортированы по start_date ASC. Доступно: сам работник, его руководитель (users.manager_id), роли hr, admin, superadmin'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Список запланированных отпусков
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   start_date: { type: string, format: date }
 *                   end_date: { type: string, format: date }
 *                   duration: { type: integer }
 *                   status: { type: string, enum: [approved, on_approval] }
 *                   vacation_type: { type: string, nullable: true }
 *                   vacation_type_name: { type: string, nullable: true }
 *                   created_at: { type: string, format: date-time }
 *                   substitutes:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id: { type: integer }
 *                         last_name: { type: string }
 *                         first_name: { type: string }
 *                         middle_name: { type: string, nullable: true }
 *       400:
 *         description: Некорректный идентификатор
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Нет доступа к отпускам работника
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/upcoming/:userId', authenticateToken, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId)
    if (isNaN(targetUserId)) {
      return res.status(400).json({ error: 'Некорректный идентификатор пользователя' })
    }
    if (targetUserId !== req.user.id && !['hr', 'admin', 'superadmin'].includes(req.user.role)) {
      const managerCheck = await query('SELECT 1 FROM users WHERE id = $1 AND manager_id = $2', [targetUserId, req.user.id])
      if (managerCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Нет доступа к отпускам работника' })
      }
    }
    const params = [targetUserId]
    let orgClause = ''
    if (req.org) {
      orgClause = ' AND vr.organization_id = $2'
      params.push(req.org.org_id)
    }
    const result = await query(
      `SELECT vr.id, vr.start_date, vr.end_date, vr.duration, vr.created_at, rs.code as status, vt.code as vacation_type, vt.name as vacation_type_name
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       LEFT JOIN vacation_types vt ON vr.vacation_type_id = vt.id
       WHERE vr.user_id = $1
         AND rs.code IN ('approved', 'on_approval')
         AND (vr.start_date >= CURRENT_DATE OR (vr.end_date >= CURRENT_DATE AND rs.code = 'approved'))${orgClause}
       ORDER BY vr.start_date ASC
       LIMIT 10`,
      params
    )

    const requestIds = result.rows.map((r) => r.id)
    let subsByRequest = {}
    if (requestIds.length > 0) {
      const subsResult = await query(
        `SELECT vs.vacation_request_id, u.id, u.last_name, u.first_name, u.middle_name
         FROM vacation_substitutions vs
         JOIN users u ON vs.substitute_user_id = u.id
         WHERE vs.vacation_request_id = ANY($1)`,
        [requestIds]
      )
      for (const row of subsResult.rows) {
        if (!subsByRequest[row.vacation_request_id]) subsByRequest[row.vacation_request_id] = []
        subsByRequest[row.vacation_request_id].push({
          id: row.id, last_name: row.last_name, first_name: row.first_name, middle_name: row.middle_name
        })
      }
    }

    res.json(result.rows.map((r) => ({ ...r, substitutes: subsByRequest[r.id] || [] })))
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось загрузить запланированные отпуска' })
  }
})

/**
 * @swagger
 * /vacation/department-head-requests:
 *   get:
 *     tags: [Vacation]
 *     summary: Отпуска начальника отдела текущего работника
 *     description: 'Заявки руководителя отдела работника (все статусы кроме rejected и cancelled_by_employee)'
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список заявок начальника отдела
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/VacationRequest' }
 */
router.get('/department-head-requests', authenticateToken, async (req, res) => {
  try {
    const userResult = await query('SELECT department_id FROM users WHERE id = $1', [req.user.id])
    const deptId = userResult.rows[0]?.department_id
    if (!deptId) return res.json([])

    const deptResult = await query('SELECT manager_id FROM departments WHERE id = $1', [deptId])
    const managerId = deptResult.rows[0]?.manager_id
    if (!managerId || managerId === req.user.id) return res.json([])

    const params = [managerId]
    let orgClause = ''
    if (req.org) {
      orgClause = ' AND vr.organization_id = $2'
      params.push(req.org.org_id)
    }

    const result = await query(
      `SELECT
        vr.*,
        rs.code as status,
        rs.name as status_name,
        vt.code as vacation_type,
        vt.name as vacation_type_name,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.position,
        u.avatar,
        u.gender,
        u.department_id,
        d.name as department_name,
        d.manager_id as department_manager_id
      FROM vacation_requests vr
      JOIN users u ON vr.user_id = u.id
      JOIN request_statuses rs ON vr.status_id = rs.id
      LEFT JOIN vacation_types vt ON vr.vacation_type_id = vt.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE vr.user_id = $1 AND rs.code NOT IN ('rejected', 'cancelled_by_employee')${orgClause}
      ORDER BY vr.start_date ASC`,
      params
    )

    res.json(result.rows)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось загрузить заявки руководителей отделов' })
  }
})

/**
 * @swagger
 * /vacation/balance/{userId}:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить баланс отпусков
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Баланс отпусков
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VacationBalance' }
 */
router.get('/balance/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params
    const { year } = req.query
    const currentUser = req.user
    const targetYear = year ? parseInt(year) : new Date().getFullYear()

    if (currentUser.role === 'employee' && currentUser.id !== parseInt(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' })
    }

    const result = await query(
      `SELECT vb.*,
              u.hire_date,
              CASE WHEN vb.travel_next_available_date IS NULL THEN u.hire_date + INTERVAL '2 years'
                   ELSE vb.travel_next_available_date
              END as effective_travel_next
       FROM vacation_balances vb
       LEFT JOIN users u ON u.id = vb.user_id
       WHERE vb.user_id = $1 AND vb.year = $2${req.org ? ' AND vb.organization_id = $3' : ''}`,
      req.org ? [userId, targetYear, req.org.org_id] : [userId, targetYear]
    )

    if (result.rows.length === 0) {
      const resolvedDays = await resolveVacationDays(userId, currentOrgId(req))
      const newBalance = await query(
        `INSERT INTO vacation_balances (user_id, total_days, used_days, reserved_days, year, organization_id)
         VALUES ($1, $4, 0, 0, $2, $3)
         ON CONFLICT (user_id, organization_id, year) DO UPDATE SET organization_id = EXCLUDED.organization_id
         RETURNING *`,
        [userId, targetYear, currentOrgId(req), resolvedDays]
      ).catch(() => null)
      if (newBalance && newBalance.rows.length > 0) {
        const updtOrgClause = req.org ? ' AND vacation_balances.organization_id = $2' : ''
        await query(
          `UPDATE vacation_balances SET travel_next_available_date = users.hire_date + INTERVAL '2 years'
           FROM users WHERE users.id = vacation_balances.user_id AND vacation_balances.user_id = $1${updtOrgClause}`,
          req.org ? [userId, req.org.org_id] : [userId]
        ).catch(() => {})
        return res.json(newBalance.rows[0])
      }
      const fallback = await query(
        `SELECT vb.*, u.hire_date,
                CASE WHEN vb.travel_next_available_date IS NULL THEN u.hire_date + INTERVAL '2 years'
                     ELSE vb.travel_next_available_date
                END as effective_travel_next
         FROM vacation_balances vb
         LEFT JOIN users u ON u.id = vb.user_id
         WHERE vb.user_id = $1 AND vb.year = $2${req.org ? ' AND vb.organization_id = $3' : ''}`,
        req.org ? [userId, targetYear, req.org.org_id] : [userId, targetYear]
      )
      if (fallback.rows.length > 0) {
        const row = fallback.rows[0]
        return res.json({
          ...row,
          travel_available: row.effective_travel_next ? new Date() >= new Date(row.effective_travel_next) : false,
          travel_next_available_date: row.effective_travel_next,
        })
      }
      return res.status(404).json({ error: 'Баланс отпуска не найден' })
    }

    const row = result.rows[0]
    const dateOk = row.effective_travel_next && new Date() >= new Date(row.effective_travel_next)

    const { text: ptText, values: ptValues } = orgScopedQuery(
      `SELECT 1 FROM vacation_requests vr
       JOIN request_statuses rs ON rs.id = vr.status_id
       WHERE vr.user_id = $1 AND vr.has_travel = true AND rs.code IN ('on_approval')
       LIMIT 1`,
      [userId], req
    )
    const pendingTravel = await query(ptText, ptValues)
    const travelAvailable = dateOk && pendingTravel.rows.length === 0
    const travelAvailableUntil = travelAvailable
      ? new Date(new Date(row.effective_travel_next).getTime() + 2 * 365 * 24 * 60 * 60 * 1000)
      : null
    const balance = {
      ...row,
      travel_available: travelAvailable,
      travel_next_available_date: row.effective_travel_next,
      travel_available_until: travelAvailableUntil ? travelAvailableUntil.toISOString().split('T')[0] : null,
    }
    res.json(balance)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось загрузить баланс отпуска' })
  }
})

router.get('/balances', authenticateToken, async (req, res) => {
  try {
    const { departmentId, year, tagId } = req.query
    const targetYear = year ? parseInt(year) : new Date().getFullYear()
    let deptId = departmentId ? parseInt(departmentId) : req.user.department_id

    if (req.user.role === 'employee' && deptId !== req.user.department_id) {
      deptId = req.user.department_id
    }

    if (!deptId) return res.json([])

    const params = [deptId, targetYear]
    let orgClause = ''
    if (req.org) {
      orgClause = ' AND vb.organization_id = $3'
      params.push(req.org.org_id)
    }
    let tagClause = ''
    const tagIds = String(tagId || '').split(',').map(v => parseInt(v)).filter(n => !Number.isNaN(n))
    if (tagIds.length > 0) {
      params.push(tagIds)
      tagClause = ` AND EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = u.id AND us.skill_id = ANY($${params.length}::int[]))`
    }

    const result = await query(
      `SELECT u.id as user_id, u.first_name, u.last_name, u.avatar, u.gender,
              COALESCE(vb.total_days, 47) as total_days,
              COALESCE(vb.used_days, 0) as used_days,
              COALESCE(vb.available_days, 47) as available_days
       FROM users u
       LEFT JOIN vacation_balances vb ON vb.user_id = u.id AND vb.year = $2${orgClause}
       WHERE u.department_id = $1 AND u.status = 'active'${tagClause}
       ORDER BY u.last_name, u.first_name`,
      params
    )
    res.json(result.rows)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось загрузить балансы отпусков' })
  }
})

/**
 * @swagger
 * /vacation/balances/{userId}:
 *   patch:
 *     tags: [Vacation]
 *     summary: Изменить количество дней отпуска работника с указанного года (hr/admin)
 *     description: 'Действует на указанный год и все следующие: upsert по (user_id, organization_id, year) с указанного года по следующий календарный, уже созданные более поздние года тоже обновляются; used_days/reserved_days не трогаются, available_days пересчитывается триггером БД'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [year, total_days]
 *             properties:
 *               year: { type: integer }
 *               total_days: { type: integer, minimum: 0 }
 *     responses:
 *       200:
 *         description: Баланс обновлён
 *       400:
 *         description: Некорректные параметры или организация не выбрана
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Доступ запрещён
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Работник не найден в организации
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.patch('/balances/:userId', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    const parsedYear = parseInt(req.body.year)
    const parsedDays = parseInt(req.body.total_days)
    if (Number.isNaN(userId) || Number.isNaN(parsedYear) || Number.isNaN(parsedDays) || parsedDays < 0) {
      return res.status(400).json({ error: 'Некорректные параметры' })
    }
    const orgId = currentOrgId(req)
    if (!orgId) return res.status(400).json({ error: 'Не выбрана организация' })

    const memberCheck = await query(
      'SELECT 1 FROM user_organizations WHERE user_id = $1 AND org_id = $2',
      [userId, orgId]
    )
    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Работник не найден в организации' })
    }

    const lastYear = Math.max(parsedYear, new Date().getFullYear() + 1)
    const result = await query(
      `INSERT INTO vacation_balances (user_id, organization_id, year, total_days)
       SELECT $1, $2, y, $4 FROM generate_series($3::int, $5::int) AS y
       ON CONFLICT (user_id, organization_id, year)
       DO UPDATE SET total_days = EXCLUDED.total_days, updated_at = NOW()
       RETURNING *`,
      [userId, orgId, parsedYear, parsedDays, lastYear]
    )
    await query(
      `UPDATE vacation_balances SET total_days = $1, updated_at = NOW()
       WHERE user_id = $2 AND organization_id = $3 AND year > $4`,
      [parsedDays, userId, orgId, lastYear]
    )
    res.json(result.rows.find((r) => r.year === parsedYear) ?? result.rows[0])
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось обновить баланс отпуска' })
  }
})

/**
 * @swagger
 * /vacation/requests:
 *   post:
 *     tags: [Vacation]
 *     summary: Создать заявку на отпуск
 *     description: Если в диапазоне дат есть праздники из производственного календаря (calendar_holidays), даты не меняются, а праздничные дни не входят в длительность и не списываются с баланса. Диапазон с более чем 5 праздниками отклоняется с 400.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startDate, endDate, vacationType]
 *             properties:
 *               startDate: { type: string, format: date, example: '2026-06-01' }
 *               endDate: { type: string, format: date, example: '2026-06-14' }
 *               vacationType: { $ref: '#/components/schemas/VacationType' }
 *               comment: { type: string }
 *               hasTravel: { type: boolean, default: false }
 *               travelDestination: { type: string }
 *               referenceDocument: { type: string }
 *     responses:
 *       201:
 *         description: Заявка создана (end_date уже продлён на праздники, если применимо)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VacationRequest' }
 *       400:
 *         description: Ошибка валидации, в т.ч. слишком много праздничных дней в диапазоне (максимум 5)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/requests', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { startDate, endDate, vacationType, comment, hasTravel, travelDestination, travelChildren, referenceDocument, substitute_ids } = req.body
    const userId = req.user.id

    const { text: blockText, values: blockValues } = orgScopedQuery(
      `SELECT d.vacation_requests_blocked FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = $1`,
      [userId], req
    )
    const blockCheck = await query(blockText, blockValues)
    if (blockCheck.rows.length > 0 && blockCheck.rows[0].vacation_requests_blocked) {
      return res.status(403).json({ error: 'Подача заявок на отпуск для вашего отдела временно заблокирована HR' })
    }

    await client.query('BEGIN')

    const parseLocalDate = (dateStr) => {
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    }

    const start = parseLocalDate(startDate)
    const end = parseLocalDate(endDate)

    const formatDate = (date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (start < today) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Нельзя создавать заявку на прошедшую дату' })
    }

    if (end < start) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Дата окончания не может быть раньше даты начала' })
    }

    if (!VALID_VACATION_TYPES.includes(vacationType)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Неверный тип отпуска' })
    }

    if (vacationType === 'educational' && !referenceDocument) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Для учебного отпуска необходимо приложить справку' })
    }

    let computedDates
    try {
      computedDates = await computeVacationDates(formatDate(start), formatDate(end))
    } catch (err) {
      res.locals.errorCause = err
      await client.query('ROLLBACK')
      if (err instanceof VacationValidationError) {
        return res.status(400).json({ error: err.message })
      }
      throw err
    }
    const finalDuration = computedDates.countedDays
    const computedEndDate = computedDates.endDate
    const requestYear = start.getFullYear()

    const { text: balText, values: balValues } = orgScopedQuery(
      'SELECT * FROM vacation_balances WHERE user_id = $1 AND year = $2',
      [userId, requestYear], req
    )
    const balanceResult = await client.query(balText, balValues)

    const balance = balanceResult.rows[0]
    if (!balance || balance.available_days < finalDuration) {
      await client.query('ROLLBACK')
      return res.status(400).json({
        error: 'Недостаточно дней на балансе',
        available: balance?.available_days || 0,
        required: finalDuration
      })
    }

    if (hasTravel) {
      const { text: ptText2, values: ptValues2 } = orgScopedQuery(
        `SELECT 1 FROM vacation_requests vr
         JOIN request_statuses rs ON rs.id = vr.status_id
         WHERE vr.user_id = $1 AND vr.has_travel = true AND rs.code IN ('on_approval')
         LIMIT 1`,
        [userId], req
      )
      const pendingTravel = await client.query(ptText2, ptValues2)
      if (pendingTravel.rows.length > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Уже есть заявка с проездом на согласовании' })
      }
      if (!travelDestination || !travelDestination.trim()) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Укажите город проезда' })
      }
      if (Array.isArray(travelChildren) && travelChildren.length > 0) {
        for (const child of travelChildren) {
          if (!child.fullName || !child.fullName.trim()) {
            await client.query('ROLLBACK')
            return res.status(400).json({ error: 'Укажите ФИО ребёнка' })
          }
          if (!child.birthDate) {
            await client.query('ROLLBACK')
            return res.status(400).json({ error: 'Укажите дату рождения ребёнка' })
          }
        }
      }
    }

    const { text: ovText, values: ovValues } = orgScopedQuery(
      `SELECT vr.id FROM vacation_requests vr
        JOIN request_statuses rs ON vr.status_id = rs.id
        WHERE vr.user_id = $1
        AND rs.code IN ('on_approval', 'approved')
        AND (
          (vr.start_date <= $2 AND vr.end_date >= $2)
          OR (vr.start_date <= $3 AND vr.end_date >= $3)
          OR (vr.start_date >= $2 AND vr.end_date <= $3)
        )`,
      [userId, formatDate(start), computedEndDate], req
    )
    const overlapResult = await client.query(ovText, ovValues)

    if (overlapResult.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Пересечение с существующей заявкой' })
    }

    const travelChildrenParsed = (hasTravel && Array.isArray(travelChildren)) ? travelChildren : []
    const travelChildrenJson = JSON.stringify(travelChildrenParsed)
    const travelChildrenCount = travelChildrenParsed.length

    const approverId = await resolveApproverId(userId, currentOrgId(req), req)

    const result = await client.query(
      `INSERT INTO vacation_requests
        (user_id, start_date, end_date, duration, vacation_type_id, comment, has_travel, travel_destination, travel_children, travel_children_count, reference_document, status_id, organization_id, approver_id)
        VALUES ($1, $2, $3, $4, (SELECT id FROM vacation_types WHERE code = $5 AND organization_id = $12), $6, $7, $8, $9, $10, $11, (SELECT id FROM request_statuses WHERE code = 'on_approval'), $12, $13)
        RETURNING *`,
      [
        userId,
        formatDate(start),
        computedEndDate,
        finalDuration,
        vacationType,
        comment,
        hasTravel || false,
        travelDestination || null,
        travelChildrenJson,
        travelChildrenCount,
        referenceDocument || null,
        currentOrgId(req),
        approverId
      ]
    )

    const request = result.rows[0]

    const { text: rbText, values: rbValues } = orgScopedQuery(
      `UPDATE vacation_balances
       SET reserved_days = reserved_days + $1
       WHERE user_id = $2 AND year = $3`,
      [finalDuration, userId, requestYear], req
    )
    await client.query(rbText, rbValues)

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, organization_id)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'on_approval'), $2, $3)`,
      [request.id, userId, currentOrgId(req)]
    )

    await fillVacationTimesheetEntries(client, userId, request.start_date, request.end_date, req)

    if (Array.isArray(substitute_ids) && substitute_ids.length > 0) {
      for (const subId of substitute_ids) {
        await client.query(
          `INSERT INTO vacation_substitutions (vacation_request_id, substitute_user_id, assigned_by, organization_id)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [request.id, subId, userId, currentOrgId(req)]
        )
      }
    }

    await client.query('COMMIT')

    await notifyVacationCreated(request, userId, req)

    if (Array.isArray(substitute_ids) && substitute_ids.length > 0) {
      const empName = await getEmpName(userId)
      for (const subId of substitute_ids) {
        notify({
          userId: subId,
          type: 'vacation_substitution',
          data: {
            requestId: request.id,
            employeeName: empName,
            startDate: fmtDate(request.start_date),
            endDate: fmtDate(request.end_date),
            link: '/vacation'
          }
        }).catch((err) => console.warn(`[NOTIFY] substitute ${subId}: ${err.message}`))
      }
    }

    res.status(201).json({
      ...request,
      returnDate: addDaysISO(request.end_date, 1),
      holidaysCount: computedDates.holidaysCount,
    })
    notifyVacationChanged(req, request.id, 'created')
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'Не удалось создать заявку на отпуск' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}:
 *   put:
 *     tags: [Vacation]
 *     summary: Редактировать заявку на отпуск
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               vacationType: { $ref: '#/components/schemas/VacationType' }
 *               comment: { type: string }
 *               hasTravel: { type: boolean }
 *               travelDestination: { type: string }
 *               travelChildren: { type: array, items: { type: object } }
 *               referenceDocument: { type: string }
 *               substitute_ids: { type: array, items: { type: integer }, description: 'Если передан — заменяет список замещающих' }
 *     description: 'Только автор и только в статусе «На согласовании». Длительность, дата окончания и праздники считаются так же, как при создании; резерв на балансе переносится, табель обновляется'
 *     responses:
 *       200:
 *         description: Заявка обновлена
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/VacationRequest' }
 */
router.put('/requests/:id', authenticateToken, async (req, res) => {
  const client = await getClient()
  try {
    const { id } = req.params
    const { startDate, endDate, vacationType, comment, hasTravel, travelDestination, travelChildren, referenceDocument, substitute_ids } = req.body
    const userId = req.user.id

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ''))) {
      return res.status(400).json({ error: 'Укажите даты отпуска' })
    }
    if (!VALID_VACATION_TYPES.includes(vacationType)) {
      return res.status(400).json({ error: 'Неверный тип отпуска' })
    }
    if (vacationType === 'educational' && !referenceDocument) {
      return res.status(400).json({ error: 'Для учебного отпуска необходимо приложить справку' })
    }
    if (startDate < todayISO()) {
      return res.status(400).json({ error: 'Нельзя перенести начало отпуска на прошедшую дату' })
    }
    if (endDate < startDate) {
      return res.status(400).json({ error: 'Дата окончания не может быть раньше даты начала' })
    }

    await client.query('BEGIN')

    const { text: rrText, values: rrValues } = orgScopedQuery(
      `SELECT vr.*, rs.code as status
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.id = $1`,
      [id], req
    )
    const requestResult = await client.query(rrText, rrValues)
    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Заявка не найдена' })
    }
    const request = requestResult.rows[0]

    if (request.user_id !== userId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Редактировать заявку может только её автор' })
    }
    if (request.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно редактировать только заявки на согласовании' })
    }

    let computedDates
    try {
      computedDates = await computeVacationDates(startDate, endDate)
    } catch (err) {
      res.locals.errorCause = err
      await client.query('ROLLBACK')
      if (err instanceof VacationValidationError) return res.status(400).json({ error: err.message })
      throw err
    }
    const newDuration = computedDates.countedDays
    const newEndDate = computedDates.endDate
    const oldYear = extractYear(request.start_date)
    const newYear = Number(startDate.slice(0, 4))

    const orgBal = req.org ? ' AND organization_id = $3' : ''
    const lockYears = [...new Set([oldYear, newYear])]
    for (const y of lockYears) {
      await client.query(`SELECT 1 FROM vacation_balances WHERE user_id = $1 AND year = $2${orgBal} FOR UPDATE`, req.org ? [userId, y, req.org.org_id] : [userId, y])
    }
    const { text: balText, values: balValues } = orgScopedQuery(
      'SELECT available_days FROM vacation_balances WHERE user_id = $1 AND year = $2',
      [userId, newYear], req
    )
    const balance = (await client.query(balText, balValues)).rows[0]
    const availableForEdit = (balance?.available_days ?? 0) + (newYear === oldYear ? request.duration : 0)
    if (!balance || availableForEdit < newDuration) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Недостаточно дней на балансе', available: availableForEdit, required: newDuration })
    }

    if (hasTravel) {
      const { text: ptText, values: ptValues } = orgScopedQuery(
        `SELECT 1 FROM vacation_requests vr
         JOIN request_statuses rs ON rs.id = vr.status_id
         WHERE vr.user_id = $1 AND vr.id <> $2 AND vr.has_travel = true AND rs.code IN ('on_approval')
         LIMIT 1`,
        [userId, id], req
      )
      if ((await client.query(ptText, ptValues)).rows.length > 0) {
        await client.query('ROLLBACK')
        return res.status(409).json({ error: 'Уже есть другая заявка с проездом на согласовании' })
      }
      if (!travelDestination || !String(travelDestination).trim()) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Укажите город проезда' })
      }
      for (const child of Array.isArray(travelChildren) ? travelChildren : []) {
        if (!child.fullName || !String(child.fullName).trim()) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: 'Укажите ФИО ребёнка' })
        }
        if (!child.birthDate) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: 'Укажите дату рождения ребёнка' })
        }
      }
    }

    const { text: ovText, values: ovValues } = orgScopedQuery(
      `SELECT vr.id FROM vacation_requests vr
        JOIN request_statuses rs ON vr.status_id = rs.id
        WHERE vr.user_id = $1 AND vr.id <> $4
        AND rs.code IN ('on_approval', 'approved')
        AND vr.start_date <= $3 AND vr.end_date >= $2`,
      [userId, startDate, newEndDate, id], req
    )
    if ((await client.query(ovText, ovValues)).rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Пересечение с существующей заявкой' })
    }

    const { text: relText, values: relValues } = orgScopedQuery(
      'UPDATE vacation_balances SET reserved_days = GREATEST(0, reserved_days - $1) WHERE user_id = $2 AND year = $3',
      [request.duration, userId, oldYear], req
    )
    await client.query(relText, relValues)
    const { text: resText, values: resValues } = orgScopedQuery(
      'UPDATE vacation_balances SET reserved_days = reserved_days + $1 WHERE user_id = $2 AND year = $3',
      [newDuration, userId, newYear], req
    )
    await client.query(resText, resValues)

    const children = hasTravel && Array.isArray(travelChildren) ? travelChildren : []
    const typeOrg = req.org ? ' AND organization_id = $13' : ''
    const result = await client.query(
      `UPDATE vacation_requests
       SET start_date = $1, end_date = $2, duration = $3,
           vacation_type_id = (SELECT id FROM vacation_types WHERE code = $4${typeOrg} LIMIT 1),
           comment = $5, has_travel = $6, travel_destination = $7, travel_children = $8, travel_children_count = $9,
           reference_document = $10, updated_at = NOW()
       WHERE id = $11 AND user_id = $12
       RETURNING *`,
      [
        startDate, newEndDate, newDuration, vacationType, comment ?? null, !!hasTravel,
        hasTravel ? String(travelDestination).trim() : null, JSON.stringify(children), children.length,
        referenceDocument || null, id, userId, ...(req.org ? [req.org.org_id] : []),
      ]
    )
    const updated = result.rows[0]

    await clearVacationTimesheetEntries(client, userId, request.start_date, request.end_date, req)
    await fillVacationTimesheetEntries(client, userId, updated.start_date, updated.end_date, req)

    let addedSubs = []
    let removedSubs = []
    if (Array.isArray(substitute_ids)) {
      const wanted = [...new Set(substitute_ids.map(Number).filter((n) => Number.isInteger(n) && n !== userId))]
      const current = (await client.query('SELECT substitute_user_id FROM vacation_substitutions WHERE vacation_request_id = $1', [id])).rows.map((r) => r.substitute_user_id)
      addedSubs = wanted.filter((s) => !current.includes(s))
      removedSubs = current.filter((s) => !wanted.includes(s))
      if (removedSubs.length > 0) {
        await client.query('DELETE FROM vacation_substitutions WHERE vacation_request_id = $1 AND substitute_user_id = ANY($2)', [id, removedSubs])
      }
      for (const subId of addedSubs) {
        await client.query(
          `INSERT INTO vacation_substitutions (vacation_request_id, substitute_user_id, assigned_by, organization_id)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [id, subId, userId, currentOrgId(req)]
        )
      }
    }

    await client.query('COMMIT')

    if (addedSubs.length > 0 || removedSubs.length > 0) {
      const empName = await getEmpName(userId)
      const payload = { requestId: Number(id), employeeName: empName, startDate: fmtDate(updated.start_date), endDate: fmtDate(updated.end_date), link: '/vacation' }
      for (const subId of addedSubs) {
        notify({ userId: subId, type: 'vacation_substitution', data: payload }).catch((err) => console.warn(`[NOTIFY] substitute ${subId}: ${err.message}`))
      }
      for (const subId of removedSubs) {
        notify({ userId: subId, type: 'vacation_substitution_removed', data: payload }).catch((err) => console.warn(`[NOTIFY] substitute removed ${subId}: ${err.message}`))
      }
    }

    const fullResult = await query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1`,
      [id]
    )
    res.json({ ...fullResult.rows[0], returnDate: addDaysISO(updated.end_date, 1), holidaysCount: computedDates.holidaysCount })
    notifyVacationChanged(req, id, 'updated')
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: 'Не удалось обновить заявку на отпуск' })
  } finally {
    client.release()
  }
})


router.post('/requests/:id/approve', authenticateToken, async (req, res) => {
  const { id } = req.params
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const request = await client.query(`SELECT vr.*, rs.code as status FROM vacation_requests vr JOIN request_statuses rs ON vr.status_id = rs.id WHERE vr.id = $1`, [id])
    if (request.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Заявка не найдена' }) }
    if (request.rows[0].status !== 'on_approval') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Заявка не на согласовании' }) }

    if (!(await canReviewVacation(request.rows[0], req))) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Нет прав на согласование этой заявки' })
    }

    const origYear = new Date(request.rows[0].start_date).getFullYear()
    const { text: appBalText, values: appBalValues } = orgScopedQuery('UPDATE vacation_balances SET reserved_days = GREATEST(0, reserved_days - $1), used_days = used_days + $1 WHERE user_id = $2 AND year = $3',
      [request.rows[0].duration, request.rows[0].user_id, origYear], req)
    await client.query(appBalText, appBalValues)

    if (request.rows[0].has_travel) {
      const { text: appTrvText, values: appTrvValues } = orgScopedQuery(
        `UPDATE vacation_balances
         SET travel_last_used_date = CURRENT_DATE,
             travel_next_available_date = CURRENT_DATE + INTERVAL '2 years',
             travel_available = false
         WHERE user_id = $1`,
        [request.rows[0].user_id], req
      )
      await client.query(appTrvText, appTrvValues)
    }

    await client.query(
      `INSERT INTO vacation_request_status_history (request_id, status_id, changed_by, organization_id) VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'approved'), $2, $3)`,
      [id, req.user.id, currentOrgId(req)])

    const { text: appUpdText, values: appUpdValues } = orgScopedQuery(
      `UPDATE vacation_requests SET status_id = (SELECT id FROM request_statuses WHERE code = 'approved'), reviewed_at = NOW(), reviewed_by = $1 WHERE id = $2 RETURNING *`,
      [req.user.id, id], req)
    const result = await client.query(appUpdText, appUpdValues)

    await client.query('COMMIT')

    notify({
      userId: request.rows[0].user_id,
      type: 'vacation_status_changed',
      data: {
        requestId: id,
        employeeName: await getEmpName(request.rows[0].user_id),
        status: 'approved',
        startDate: fmtDate(request.rows[0].start_date),
        endDate: fmtDate(request.rows[0].end_date),
        comment: null,
        link: '/vacation'
      }
    }).catch((err) => console.warn(`[NOTIFY] vacation approve #${id}: ${err.message}`))

    res.json({ ...result.rows[0], status: 'approved' })
    notifyVacationChanged(req, id, 'approved')
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'Ошибка согласования' })
  } finally {
    client.release()
  }
})

router.post('/requests/:id/reject', authenticateToken, async (req, res) => {
  const { id } = req.params
  const { reason } = req.body
  if (!reason?.trim()) return res.status(400).json({ error: 'Укажите причину отклонения' })

  const client = await getClient()
  try {
    await client.query('BEGIN')
    const request = await client.query(`SELECT vr.*, rs.code as status FROM vacation_requests vr JOIN request_statuses rs ON vr.status_id = rs.id WHERE vr.id = $1`, [id])
    if (request.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Заявка не найдена' }) }
    if (request.rows[0].status !== 'on_approval') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Заявка не на согласовании' }) }

    if (!(await canReviewVacation(request.rows[0], req))) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Нет прав на согласование этой заявки' })
    }

    const origYear = new Date(request.rows[0].start_date).getFullYear()
    const { text: rejBalText, values: rejBalValues } = orgScopedQuery('UPDATE vacation_balances SET reserved_days = GREATEST(0, reserved_days - $1) WHERE user_id = $2 AND year = $3',
      [request.rows[0].duration, request.rows[0].user_id, origYear], req)
    await client.query(rejBalText, rejBalValues)

    if (request.rows[0].has_travel) {
      const { text: rejTrvText, values: rejTrvValues } = orgScopedQuery(
        `UPDATE vacation_balances
         SET travel_available = true,
             travel_last_used_date = NULL,
             travel_next_available_date = (
               SELECT hire_date + INTERVAL '2 years' FROM users WHERE id = $1
             )
         WHERE user_id = $1`,
        [request.rows[0].user_id], req
      )
      await client.query(rejTrvText, rejTrvValues)
    }

    await client.query(
      `INSERT INTO vacation_request_status_history (request_id, status_id, changed_by, comment, organization_id) VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'rejected'), $2, $3, $4)`,
      [id, req.user.id, reason, currentOrgId(req)])

    const { text: rejUpdText, values: rejUpdValues } = orgScopedQuery(
      `UPDATE vacation_requests SET status_id = (SELECT id FROM request_statuses WHERE code = 'rejected'), rejection_reason = $1, reviewed_at = NOW(), reviewed_by = $2 WHERE id = $3 RETURNING *`,
      [reason, req.user.id, id], req)
    const result = await client.query(rejUpdText, rejUpdValues)

    await client.query('COMMIT')

    notify({
      userId: request.rows[0].user_id,
      type: 'vacation_status_changed',
      data: {
        requestId: id,
        employeeName: await getEmpName(request.rows[0].user_id),
        status: 'rejected',
        startDate: fmtDate(request.rows[0].start_date),
        endDate: fmtDate(request.rows[0].end_date),
        comment: reason,
        link: '/vacation'
      }
    }).catch((err) => console.warn(`[NOTIFY] vacation reject #${id}: ${err.message}`))

    res.json({ ...result.rows[0], status: 'rejected' })
    notifyVacationChanged(req, id, 'rejected')
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'Ошибка отклонения' })
  } finally {
    client.release()
  }
})

router.post('/requests/:id/cancel', authenticateToken, async (req, res) => {
  const { id } = req.params
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const { text: reqText, values: reqValues } = orgScopedQuery(`SELECT vr.*, rs.code as status FROM vacation_requests vr JOIN request_statuses rs ON vr.status_id = rs.id WHERE vr.id = $1`, [id], req)
    const request = await client.query(reqText, reqValues)
    if (request.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Заявка не найдена' }) }
    if (request.rows[0].user_id !== req.user.id && req.user.role === 'employee') { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Доступ запрещён' }) }
    if (!['on_approval', 'approved'].includes(request.rows[0].status)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Нельзя отменить эту заявку' }) }

    const origYear = new Date(request.rows[0].start_date).getFullYear()
    if (request.rows[0].status === 'approved') {
      const { text: cnlUseText, values: cnlUseValues } = orgScopedQuery('UPDATE vacation_balances SET used_days = GREATEST(0, used_days - $1) WHERE user_id = $2 AND year = $3',
        [request.rows[0].duration, request.rows[0].user_id, origYear], req)
      await client.query(cnlUseText, cnlUseValues)
    } else {
      const { text: cnlResText, values: cnlResValues } = orgScopedQuery('UPDATE vacation_balances SET reserved_days = GREATEST(0, reserved_days - $1) WHERE user_id = $2 AND year = $3',
        [request.rows[0].duration, request.rows[0].user_id, origYear], req)
      await client.query(cnlResText, cnlResValues)
    }

    if (request.rows[0].has_travel) {
      const { text: cnlTrvText, values: cnlTrvValues } = orgScopedQuery(
        `UPDATE vacation_balances
         SET travel_available = true,
             travel_last_used_date = NULL,
             travel_next_available_date = (
               SELECT hire_date + INTERVAL '2 years' FROM users WHERE id = $1
             )
         WHERE user_id = $1`,
        [request.rows[0].user_id], req
      )
      await client.query(cnlTrvText, cnlTrvValues)
    }

    await client.query(
      `INSERT INTO vacation_request_status_history (request_id, status_id, changed_by, organization_id) VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'cancelled_by_employee'), $2, $3)`,
      [id, req.user.id, currentOrgId(req)])

    const { text: cnlUpdText, values: cnlUpdValues } = orgScopedQuery(
      `UPDATE vacation_requests SET status_id = (SELECT id FROM request_statuses WHERE code = 'cancelled_by_employee'), reviewed_at = NOW(), reviewed_by = $1 WHERE id = $2 RETURNING *`,
      [req.user.id, id], req)
    const result = await client.query(cnlUpdText, cnlUpdValues)

    await client.query('COMMIT')
    res.json({ ...result.rows[0], status: 'cancelled_by_employee' })
    notifyVacationChanged(req, id, 'cancelled')
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'Ошибка отмены' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/transfer:
 *   post:
 *     tags: [Vacation]
 *     summary: Запросить перенос отпуска
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newStartDate, newEndDate]
 *             properties:
 *               newStartDate: { type: string, format: date }
 *               newEndDate: { type: string, format: date }
 *               reason: { type: string }
 *     responses:
 *       201:
 *         description: Заявка на перенос создана
 */
router.post('/requests/:id/transfer', authenticateToken, async (req, res) => {
  const client = await getClient()

  try {
    const { id } = req.params
    const { newStartDate, newEndDate, reason, note, hasTravel, travelDestination, travelChildren, substitute_ids } = req.body
    const userId = req.user.id

    if (!newStartDate || !newEndDate) {
      return res.status(400).json({ error: 'Укажите новые даты переноса' })
    }

    if (hasTravel) {
      if (!travelDestination || !travelDestination.trim()) {
        return res.status(400).json({ error: 'Укажите город проезда' })
      }
      if (Array.isArray(travelChildren) && travelChildren.length > 0) {
        for (const child of travelChildren) {
          if (!child.fullName || !child.fullName.trim()) {
            return res.status(400).json({ error: 'Укажите ФИО всех детей' })
          }
          if (!child.birthDate) {
            return res.status(400).json({ error: 'Укажите дату рождения всех детей' })
          }
        }
      }
    }

    if (newEndDate < newStartDate) {
      return res.status(400).json({ error: 'Дата окончания не может быть раньше даты начала' })
    }

    let computedTransferDates
    try {
      computedTransferDates = await computeVacationDates(newStartDate, newEndDate)
    } catch (err) {
      res.locals.errorCause = err
      if (err instanceof VacationValidationError) {
        return res.status(400).json({ error: err.message })
      }
      throw err
    }

    await client.query('BEGIN')

    const { text: trOrigText, values: trOrigValues } = orgScopedQuery(
      `SELECT vr.*, rs.code as status
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.id = $1 AND vr.user_id = $2`,
      [id, userId], req
    )
    const originalResult = await client.query(trOrigText, trOrigValues)

    if (originalResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Заявка не найдена' })
    }

    const original = originalResult.rows[0]

    if (original.status !== 'approved') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно переносить только согласованные заявки' })
    }

    const originalYear = Number(String(original.start_date).slice(0, 4))
    if (Number(newStartDate.slice(0, 4)) !== originalYear || Number(newEndDate.slice(0, 4)) !== originalYear) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Перенос возможен только в пределах того же года' })
    }

    const newDuration = computedTransferDates.countedDays
    const computedNewEndDate = computedTransferDates.endDate

    const extraDays = newDuration - original.duration
    if (extraDays > 0) {
      const balanceRow = (await client.query(
        `SELECT available_days FROM vacation_balances
         WHERE user_id = $1 AND year = $2${req.org ? ' AND organization_id = $3' : ''}
         FOR UPDATE`,
        req.org ? [original.user_id, originalYear, req.org.org_id] : [original.user_id, originalYear]
      )).rows[0]
      const available = balanceRow ? balanceRow.available_days : 0
      if (extraDays > available) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: `Не хватает дней в балансе: новый период длиннее текущего на ${extraDays} дн., а доступно ${available} дн.` })
      }
      const { text: trResText, values: trResValues } = orgScopedQuery(
        'UPDATE vacation_balances SET reserved_days = reserved_days + $1 WHERE user_id = $2 AND year = $3',
        [extraDays, original.user_id, originalYear], req
      )
      await client.query(trResText, trResValues)
    }

    const travelChildrenParsed = (hasTravel && Array.isArray(travelChildren)) ? travelChildren : []
    const travelChildrenJson = JSON.stringify(travelChildrenParsed)
    const travelChildrenCount = travelChildrenParsed.length

    const approverId = await resolveApproverId(original.user_id, currentOrgId(req), req)

    const insertResult = await client.query(
      `INSERT INTO vacation_requests
        (user_id, vacation_type_id, start_date, end_date, duration, status_id, transfer_reason, transferred_from_id, transfer_requested_at,
         has_travel, travel_destination, travel_children, travel_children_count, organization_id, approver_id, transfer_note)
       VALUES ($1, $2, $3::date, $4::date, $5, (SELECT id FROM request_statuses WHERE code = 'on_approval'), $6, $7, CURRENT_TIMESTAMP,
         $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [original.user_id, original.vacation_type_id, newStartDate, computedNewEndDate, newDuration, reason?.trim() || null, id,
       hasTravel || false, hasTravel ? (travelDestination || null) : null, travelChildrenJson, travelChildrenCount, currentOrgId(req), approverId,
       note?.trim() || null]
    )

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment, organization_id)
       VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'on_approval'), $2, $3, $4)`,
      [insertResult.rows[0].id, userId, `Запрос на перенос от заявки #${id}`, currentOrgId(req)]
    )

    if (Array.isArray(substitute_ids) && substitute_ids.length > 0) {
      for (const subId of substitute_ids) {
        await client.query(
          `INSERT INTO vacation_substitutions (vacation_request_id, substitute_user_id, assigned_by, organization_id)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [insertResult.rows[0].id, subId, userId, currentOrgId(req)]
        )
      }
    }

    await client.query('COMMIT')

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name, rs.code as status
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.id = $1${req.org ? ' AND vr.organization_id = $2' : ''}`,
      req.org ? [insertResult.rows[0].id, req.org.org_id] : [insertResult.rows[0].id]
    )

    const newReq = fullResult.rows[0]
    await notifyVacationCreated(newReq, userId, req)

    res.status(201).json({
      ...newReq,
      returnDate: addDaysISO(newReq.end_date, 1),
      holidaysCount: computedTransferDates.holidaysCount,
    })
    notifyVacationChanged(req, newReq.id, 'transferred')
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'Ошибка создания заявки на перенос' })
  } finally {
    client.release()
  }
})


/**
 * @swagger
 * /vacation/requests/{id}/transfer/approve:
 *   post:
 *     tags: [Vacation]
 *     summary: Одобрить перенос отпуска
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Перенос одобрен
 */
router.post('/requests/:id/transfer/approve', authenticateToken, async (req, res) => {
  const client = await getClient()

  try {
    const { id } = req.params
    const managerId = req.user.id

    await client.query('BEGIN')

    const newRequestResult = await client.query(
      `SELECT vr.*, rs.code as status, d.manager_id
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1 AND vr.transferred_from_id IS NOT NULL`,
      [id]
    )

    if (newRequestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Запрос на перенос не найден' })
    }

    const newRequest = newRequestResult.rows[0]

    if (newRequest.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно одобрить только заявку на согласовании' })
    }

    if (!(await canReviewVacation(newRequest, req))) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Нет прав на согласование этой заявки' })
    }

    const { text: tAppOrigText, values: tAppOrigValues } = orgScopedQuery(
      `SELECT * FROM vacation_requests WHERE id = $1`,
      [newRequest.transferred_from_id], req
    )
    const originalRequestResult = await client.query(tAppOrigText, tAppOrigValues)

    if (originalRequestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Исходная заявка не найдена' })
    }

    const originalRequest = originalRequestResult.rows[0]

    const { text: tAppCancelText, values: tAppCancelValues } = orgScopedQuery(
      `UPDATE vacation_requests
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'cancelled_by_employee'),
           cancellation_reason = 'Перенесён на другие даты (заявка #' || $1 || ')'
       WHERE id = $2`,
      [id, originalRequest.id], req
    )
    await client.query(tAppCancelText, tAppCancelValues)

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment, organization_id)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'cancelled_by_employee'), $2, $3, $4)`,
      [originalRequest.id, managerId, `Перенесён на другие даты (заявка #${id})`, currentOrgId(req)]
    )

    const { text: tAppApprText, values: tAppApprValues } = orgScopedQuery(
      `UPDATE vacation_requests vr
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'approved'),
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $1
       WHERE vr.id = $2`,
      [managerId, id], req
    )
    await client.query(tAppApprText, tAppApprValues)

    const { text: tAppBalText, values: tAppBalValues } = orgScopedQuery(
      `UPDATE vacation_balances
       SET reserved_days = reserved_days - GREATEST($1::int - $2::int, 0),
           used_days = used_days + ($1::int - $2::int)
       WHERE user_id = $3 AND year = EXTRACT(YEAR FROM $4::date)`,
      [newRequest.duration, originalRequest.duration, newRequest.user_id, originalRequest.start_date], req
    )
    await client.query(tAppBalText, tAppBalValues)

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment, organization_id)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'approved'), $2, 'Перенос одобрен', $3)`,
      [id, managerId, currentOrgId(req)]
    )

    await clearVacationTimesheetEntries(client, originalRequest.user_id, originalRequest.start_date, originalRequest.end_date, req)
    await fillVacationTimesheetEntries(client, newRequest.user_id, newRequest.start_date, newRequest.end_date, req)

    await client.query('COMMIT')

    notify({
      userId: newRequest.user_id,
      type: 'vacation_status_changed',
      data: {
        requestId: id,
        employeeName: await getEmpName(newRequest.user_id),
        status: 'approved',
        startDate: fmtDate(newRequest.start_date),
        endDate: fmtDate(newRequest.end_date),
        comment: 'Перенос одобрен',
        link: '/vacation'
      }
    }).catch((err) => console.warn(`[NOTIFY] vacation transfer approve #${id}: ${err.message}`))

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1${req.org ? ' AND vr.organization_id = $2' : ''}`,
      req.org ? [id, req.org.org_id] : [id]
    )

    res.json(fullResult.rows[0])
    notifyVacationChanged(req, id, 'approved')
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'Не удалось согласовать перенос отпуска' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/transfer/reject:
 *   post:
 *     tags: [Vacation]
 *     summary: Отклонить перенос отпуска
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Перенос отклонён
 */
router.post('/requests/:id/transfer/reject', authenticateToken, async (req, res) => {
  const client = await getClient()

  try {
    const { id } = req.params
    const { reason } = req.body
    const managerId = req.user.id

    if (!reason?.trim()) {
      return res.status(400).json({ error: 'Необходимо указать причину отклонения' })
    }

    await client.query('BEGIN')

    const newRequestResult = await client.query(
      `SELECT vr.*, rs.code as status, d.manager_id
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1 AND vr.transferred_from_id IS NOT NULL`,
      [id]
    )

    if (newRequestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Запрос на перенос не найден' })
    }

    const newRequest = newRequestResult.rows[0]

    if (newRequest.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно отклонить только заявку на согласовании' })
    }

    if (!(await canReviewVacation(newRequest, req))) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Нет прав на согласование этой заявки' })
    }

    const { text: tRejOrigText, values: tRejOrigValues } = orgScopedQuery(
      `SELECT * FROM vacation_requests WHERE id = $1`,
      [newRequest.transferred_from_id], req
    )
    const originalRequestResult = await client.query(tRejOrigText, tRejOrigValues)
    const originalRequest = originalRequestResult.rows[0]

    const { text: tRejUpdText, values: tRejUpdValues } = orgScopedQuery(
      `UPDATE vacation_requests vr
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'rejected'),
           rejection_reason = $1,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $2
       WHERE vr.id = $3`,
      [reason, managerId, id], req
    )
    await client.query(tRejUpdText, tRejUpdValues)

    const { text: tRejBalText, values: tRejBalValues } = orgScopedQuery(
      `UPDATE vacation_balances
        SET reserved_days = reserved_days - GREATEST($1::int - $2::int, 0)
        WHERE user_id = $3 AND year = EXTRACT(YEAR FROM $4::date)`,
      [newRequest.duration, originalRequest.duration, newRequest.user_id, originalRequest.start_date], req
    )
    await client.query(tRejBalText, tRejBalValues)

    const { text: tRejClrText, values: tRejClrValues } = orgScopedQuery(
      `UPDATE vacation_requests
        SET transfer_requested_at = NULL,
            transfer_reason = NULL
        WHERE id = $1`,
      [originalRequest.id], req
    )
    await client.query(tRejClrText, tRejClrValues)

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment, organization_id)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'rejected'), $2, $3, $4)`,
      [id, managerId, reason, currentOrgId(req)]
    )

    await client.query('COMMIT')

    notify({
      userId: newRequest.user_id,
      type: 'vacation_status_changed',
      data: {
        requestId: id,
        employeeName: await getEmpName(newRequest.user_id),
        status: 'rejected',
        startDate: fmtDate(newRequest.start_date),
        endDate: fmtDate(newRequest.end_date),
        comment: reason,
        link: '/vacation'
      }
    }).catch((err) => console.warn(`[NOTIFY] vacation transfer reject #${id}: ${err.message}`))

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1${req.org ? ' AND vr.organization_id = $2' : ''}`,
      req.org ? [id, req.org.org_id] : [id]
    )

    res.json(fullResult.rows[0])
    notifyVacationChanged(req, id, 'rejected')
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'Не удалось отклонить перенос отпуска' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/requests/{id}/transfer/cancel:
 *   post:
 *     tags: [Vacation]
 *     summary: Отменить запрос на перенос
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Запрос на перенос отменён
 */
router.post('/requests/:id/transfer/cancel', authenticateToken, async (req, res) => {
  const client = await getClient()
  
  try {
    const { id } = req.params
    const userId = req.user.id

    await client.query('BEGIN')

    const { text: tCnlNewText, values: tCnlNewValues } = orgScopedQuery(
      `SELECT vr.*, rs.code as status
       FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.id = $1 AND vr.transferred_from_id IS NOT NULL`,
      [id], req
    )
    const newRequestResult = await client.query(tCnlNewText, tCnlNewValues)

    if (newRequestResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Запрос на перенос не найден' })
    }

    const newRequest = newRequestResult.rows[0]

    if (newRequest.user_id !== userId) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Доступ запрещён' })
    }

    if (newRequest.status !== 'on_approval') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Можно отменить только заявку на согласовании' })
    }

    const { text: tCnlOrigText, values: tCnlOrigValues } = orgScopedQuery(
      `SELECT * FROM vacation_requests WHERE id = $1`,
      [newRequest.transferred_from_id], req
    )
    const originalRequestResult = await client.query(tCnlOrigText, tCnlOrigValues)
    const originalRequest = originalRequestResult.rows[0]

    const { text: tCnlUpdText, values: tCnlUpdValues } = orgScopedQuery(
      `UPDATE vacation_requests
       SET status_id = (SELECT id FROM request_statuses WHERE code = 'cancelled_by_employee')
       WHERE id = $1`,
      [id], req
    )
    await client.query(tCnlUpdText, tCnlUpdValues)

    const { text: tCnlBalText, values: tCnlBalValues } = orgScopedQuery(
      `UPDATE vacation_balances
        SET reserved_days = reserved_days - GREATEST($1::int - $2::int, 0)
        WHERE user_id = $3 AND year = EXTRACT(YEAR FROM $4::date)`,
      [newRequest.duration, originalRequest.duration, userId, originalRequest.start_date], req
    )
    await client.query(tCnlBalText, tCnlBalValues)

    const { text: tCnlClrText, values: tCnlClrValues } = orgScopedQuery(
      `UPDATE vacation_requests
       SET transfer_requested_at = NULL,
           transfer_reason = NULL
       WHERE id = $1`,
      [originalRequest.id], req
    )
    await client.query(tCnlClrText, tCnlClrValues)

    await client.query(
      `INSERT INTO vacation_request_status_history
        (request_id, status_id, changed_by, comment, organization_id)
        VALUES ($1, (SELECT id FROM request_statuses WHERE code = 'rejected'), $2, $3, $4)`,
      [id, userId, 'Отменено работником', currentOrgId(req)]
    )

    await clearVacationTimesheetEntries(client, newRequest.user_id, newRequest.start_date, newRequest.end_date, req)

    await client.query('COMMIT')

    const fullResult = await client.query(
      `SELECT vr.*, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name as department_name
       FROM vacation_requests vr
       JOIN users u ON vr.user_id = u.id
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE vr.id = $1${req.org ? ' AND vr.organization_id = $2' : ''}`,
      req.org ? [id, req.org.org_id] : [id]
    )

    res.json(fullResult.rows[0])
    notifyVacationChanged(req, id, 'cancelled')
  } catch (error) {
    res.locals.errorCause = error
    await client.query('ROLLBACK')
    res.status(500).json({ error: 'Не удалось отменить перенос отпуска' })
  } finally {
    client.release()
  }
})

/**
 * @swagger
 * /vacation/my-transferable:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить переносимые отпуска текущего пользователя
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список переносимых отпусков
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   start_date: { type: string, format: date }
 *                   end_date: { type: string, format: date }
 *                   duration: { type: integer }
 *                   vacation_type_name: { type: string }
 */
// GET /api/vacation/my-transferable — approved upcoming vacations that can be transferred
router.get('/my-transferable', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const result = await query(
      `SELECT vr.id, vr.start_date, vr.end_date, vr.duration, vt.name as vacation_type_name
       FROM vacation_requests vr
       LEFT JOIN vacation_types vt ON vr.vacation_type_id = vt.id
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.user_id = $1${req.org ? ' AND vr.organization_id = $2' : ''}
         AND rs.code = 'approved'
         AND vr.start_date >= CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1 FROM vacation_requests tr
           JOIN request_statuses trs ON tr.status_id = trs.id
           WHERE tr.transferred_from_id = vr.id
             AND trs.code NOT IN ('rejected', 'cancelled_by_employee', 'cancelled_by_manager')${req.org ? ' AND tr.organization_id = $2' : ''}
         )
       ORDER BY vr.start_date`,
      req.org ? [userId, req.org.org_id] : [userId]
    )
    res.json(result.rows)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Ошибка загрузки данных' })
  }
})

/**
 * @swagger
 * /vacation/my-transfer-requests:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить запросы на перенос текущего пользователя
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список запросов на перенос
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
// GET /api/vacation/my-transfer-requests — my transfer requests with original + new data
router.get('/my-transfer-requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const result = await query(
      `SELECT
         nr.id,
         nr.start_date as new_start,
         nr.end_date as new_end,
         nr.duration as new_days,
         nr.transfer_note as note,
         orig.id as original_id,
         orig.start_date as original_start,
         orig.end_date as original_end,
         orig.duration as original_days,
         rs.code as status
       FROM vacation_requests nr
       JOIN vacation_requests orig ON nr.transferred_from_id = orig.id
       JOIN request_statuses rs ON nr.status_id = rs.id
       WHERE nr.user_id = $1${req.org ? ' AND nr.organization_id = $2' : ''}
       ORDER BY nr.created_at DESC`,
      req.org ? [userId, req.org.org_id] : [userId]
    )
    res.json(result.rows)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Ошибка загрузки данных' })
  }
})

/**
 * @swagger
 * /vacation/generate-application:
 *   post:
 *     tags: [Vacation]
 *     summary: Сгенерировать заявление на отпуск (DOCX)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [year]
 *             properties:
 *               year: { type: integer }
 *               templateId: { type: integer }
 *     responses:
 *       200:
 *         description: DOCX файл
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema:
 *               type: string
 *               format: binary
 */
// POST /api/vacation/generate-application
// Body: { year, templateId }
router.post('/generate-application', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { year, templateId } = req.body

    if (!year || !templateId) {
      return res.status(400).json({ error: 'Необходимо указать год и шаблон' })
    }

    const { text: gaUserText, values: gaUserValues } = req.org
      ? { text: `SELECT u.first_name, u.last_name, u.middle_name, u.position, u.hire_date, d.name as department_name
         FROM users u LEFT JOIN departments d ON u.department_id = d.id AND d.organization_id = $2 WHERE u.id = $1`, values: [userId, req.org.org_id] }
      : { text: `SELECT u.first_name, u.last_name, u.middle_name, u.position, u.hire_date, d.name as department_name
         FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = $1`, values: [userId] }
    const { text: gaTmplText, values: gaTmplValues } = orgScopedQuery(
      `SELECT name, file_key, mime_type FROM document_templates WHERE id = $1 AND purpose = 'vacation_template'`,
      [templateId], req
    )
    const { text: gaVacText, values: gaVacValues } = req.org
      ? { text: `SELECT vr.start_date, vr.end_date, vr.duration, vt.name as vacation_type_name, rs.code as status,
                vr.has_travel, vr.travel_destination, vr.travel_children_count, vr.travel_children
         FROM vacation_requests vr
         LEFT JOIN vacation_types vt ON vr.vacation_type_id = vt.id
         JOIN request_statuses rs ON vr.status_id = rs.id
         WHERE vr.user_id = $1 AND vr.organization_id = $3 AND EXTRACT(YEAR FROM vr.start_date) = $2 AND rs.code = 'approved'
         ORDER BY vr.start_date`, values: [userId, year, req.org.org_id] }
      : { text: `SELECT vr.start_date, vr.end_date, vr.duration, vt.name as vacation_type_name, rs.code as status,
                vr.has_travel, vr.travel_destination, vr.travel_children_count, vr.travel_children
         FROM vacation_requests vr
         LEFT JOIN vacation_types vt ON vr.vacation_type_id = vt.id
         JOIN request_statuses rs ON vr.status_id = rs.id
         WHERE vr.user_id = $1 AND EXTRACT(YEAR FROM vr.start_date) = $2 AND rs.code = 'approved'
         ORDER BY vr.start_date`, values: [userId, year] }

    const [userResult, tmplResult, vacResult] = await Promise.all([
      query(gaUserText, gaUserValues),
      query(gaTmplText, gaTmplValues),
      query(gaVacText, gaVacValues),
    ])

    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' })
    if (tmplResult.rows.length === 0) return res.status(404).json({ error: 'Шаблон не найден' })

    const u = userResult.rows[0]
    const tmpl = tmplResult.rows[0]

    if (!tmpl.file_key) return res.status(400).json({ error: 'Файл шаблона не прикреплён' })

    const fullName = [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(' ')
    const initials = [u.first_name?.[0], u.middle_name?.[0]].filter(Boolean).map(c => c + '.').join('')
    const shortName = [u.last_name, initials].filter(Boolean).join(' ')

    const formatDate = (d) => {
      if (!d) return ''
      const dt = new Date(d)
      return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }

    const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
    const dateParts = (d) => {
      if (!d) return {}
      const dt = new Date(d)
      const day = dt.getDate()
      const month = dt.getMonth() + 1
      const year = dt.getFullYear()
      return {
        day: String(day).padStart(2, '0'),
        month: String(month).padStart(2, '0'),
        month_name: MONTHS_GENITIVE[month - 1],
        year: String(year),
      }
    }

    const vacations = vacResult.rows.map((v, i, arr) => {
      const sp = dateParts(v.start_date)
      const ep = dateParts(v.end_date)
      return {
        num: String(i + 1),
        is_last: i === arr.length - 1,
        type: v.vacation_type_name,
        start: formatDate(v.start_date),
        start_day: sp.day,
        start_month: sp.month,
        start_month_name: sp.month_name,
        start_year: sp.year,
        end: formatDate(v.end_date),
        end_day: ep.day,
        end_month: ep.month,
        end_month_name: ep.month_name,
        end_year: ep.year,
        days: String(v.duration),
        has_travel: v.has_travel || false,
        has_children: Array.isArray(v.travel_children) && v.travel_children.length > 0,
        travel_destination: v.travel_destination || '',
        travel_children_count: String(v.travel_children_count || 0),
        travel_children_list: Array.isArray(v.travel_children) ? v.travel_children.map(c => {
          const name = c.fullName || c.full_name || ''
          const birth = c.birthDate || c.birth_date || ''
          return birth ? `${name}, ${birth}` : name
        }).join('\n') : '',
        status: { on_approval: 'На согласовании', approved: 'Согласовано', rejected: 'Отклонено', cancelled_by_employee: 'Отменено', cancelled_by_manager: 'Отменено' }[v.status] || v.status,
      }
    })

    const today = new Date()
    const data = {
      full_name: fullName,
      short_name: shortName,
      last_name: u.last_name || '',
      first_name: u.first_name || '',
      middle_name: u.middle_name || '',
      position: u.position || '',
      department: u.department_name || '',
      year: String(year),
      selected_year: String(year),
      next_year: String(year + 1),
      date_today: formatDate(today),
      ...(await institutionHeadData(req)),
      travel_period_start: u.hire_date ? formatDate(u.hire_date) : '',
      travel_period_end: u.hire_date ? formatDate(new Date(u.hire_date).setFullYear(new Date(u.hire_date).getFullYear() + 2)) : '',
      vacations,
      vacations_count: String(vacations.length),
      total_days: String(vacations.reduce((s, v) => s + Number(v.days), 0)),
    }

    const s3Response = await getFromS3(tmpl.file_key)
    const buffer = Buffer.from(await s3Response.Body.transformToByteArray())

    const zip = new PizZip(buffer)
    applyYearPlaceholders(zip, year)
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
    doc.render(data)
    const output = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    const filename = encodeURIComponent(`Заявление_${u.last_name}_${year}.docx`)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
    res.send(output)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Ошибка генерации документа' })
  }
})

/**
 * @swagger
 * /vacation/generate-transfer-application:
 *   post:
 *     tags: [Vacation]
 *     summary: Сгенерировать заявление на перенос отпуска (DOCX)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [templateId, transferIds]
 *             properties:
 *               templateId: { type: integer }
 *               transferIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: DOCX файл
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema:
 *               type: string
 *               format: binary
 */
// POST /api/vacation/generate-transfer-application
// Body: { templateId, transferIds: number[] }
router.post('/generate-transfer-application', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { templateId, transferIds } = req.body

    if (!templateId || !Array.isArray(transferIds) || transferIds.length === 0) {
      return res.status(400).json({ error: 'Необходимо указать шаблон и переносы' })
    }

    const { text: gtUserText, values: gtUserValues } = req.org
      ? { text: `SELECT u.first_name, u.last_name, u.middle_name, u.position, u.hire_date, d.name as department_name
         FROM users u LEFT JOIN departments d ON u.department_id = d.id AND d.organization_id = $2 WHERE u.id = $1`, values: [userId, req.org.org_id] }
      : { text: `SELECT u.first_name, u.last_name, u.middle_name, u.position, u.hire_date, d.name as department_name
         FROM users u LEFT JOIN departments d ON u.department_id = d.id WHERE u.id = $1`, values: [userId] }
    const { text: gtTmplText, values: gtTmplValues } = orgScopedQuery(
      `SELECT name, file_key FROM document_templates WHERE id = $1 AND purpose = 'vacation_transfer_template'`,
      [templateId], req
    )
    const { text: gtTrText, values: gtTrValues } = req.org
      ? { text: `SELECT nr.id, nr.start_date as new_start, nr.duration as new_days, nr.transfer_note as note,
                nr.has_travel, nr.travel_destination, nr.travel_children, nr.travel_children_count,
                orig.start_date as original_start, orig.duration as original_days,
                rs.code as status
         FROM vacation_requests nr
         JOIN vacation_requests orig ON nr.transferred_from_id = orig.id
         JOIN request_statuses rs ON nr.status_id = rs.id
         WHERE nr.id = ANY($1) AND nr.user_id = $2 AND nr.organization_id = $3 AND rs.code = 'approved'
         ORDER BY orig.start_date`, values: [transferIds, userId, req.org.org_id] }
      : { text: `SELECT nr.id, nr.start_date as new_start, nr.duration as new_days, nr.transfer_note as note,
                nr.has_travel, nr.travel_destination, nr.travel_children, nr.travel_children_count,
                orig.start_date as original_start, orig.duration as original_days,
                rs.code as status
         FROM vacation_requests nr
         JOIN vacation_requests orig ON nr.transferred_from_id = orig.id
         JOIN request_statuses rs ON nr.status_id = rs.id
         WHERE nr.id = ANY($1) AND nr.user_id = $2 AND rs.code = 'approved'
         ORDER BY orig.start_date`, values: [transferIds, userId] }

    const [userResult, tmplResult, transfersResult] = await Promise.all([
      query(gtUserText, gtUserValues),
      query(gtTmplText, gtTmplValues),
      query(gtTrText, gtTrValues),
    ])

    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' })
    if (tmplResult.rows.length === 0) return res.status(404).json({ error: 'Шаблон не найден' })
    if (transfersResult.rows.length === 0) return res.status(400).json({ error: 'Нет подтверждённых переносов' })

    const u = userResult.rows[0]
    const tmpl = tmplResult.rows[0]

    if (!tmpl.file_key) return res.status(400).json({ error: 'Файл шаблона не прикреплён' })

    const fullName = [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(' ')
    const initials = [u.first_name?.[0], u.middle_name?.[0]].filter(Boolean).map(c => c + '.').join('')
    const shortName = [u.last_name, initials].filter(Boolean).join(' ')

    const formatDate = (d) => {
      if (!d) return ''
      const dt = new Date(d)
      return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }

    const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
    const dateParts = (d) => {
      if (!d) return {}
      const dt = new Date(d)
      const day = dt.getDate()
      const month = dt.getMonth() + 1
      const year = dt.getFullYear()
      return {
        day: String(day).padStart(2, '0'),
        month: String(month).padStart(2, '0'),
        month_name: MONTHS_GENITIVE[month - 1],
        year: String(year),
      }
    }

    const today = new Date()
    const data = {
      full_name: fullName,
      short_name: shortName,
      last_name: u.last_name || '',
      first_name: u.first_name || '',
      middle_name: u.middle_name || '',
      position: u.position || '',
      department: u.department_name || '',
      date_today: formatDate(today),
      year: String(today.getFullYear()),
      next_year: String(today.getFullYear() + 1),
      travel_period_start: u.hire_date ? formatDate(u.hire_date) : '',
      travel_period_end: u.hire_date ? formatDate(new Date(u.hire_date).setFullYear(new Date(u.hire_date).getFullYear() + 2)) : '',
      transfers: transfersResult.rows.map(t => {
        const delta = t.new_days - t.original_days
        const osp = dateParts(t.original_start)
        const nsp = dateParts(t.new_start)
        return {
          original_start: formatDate(t.original_start),
          original_start_day: osp.day,
          original_start_month: osp.month,
          original_start_month_name: osp.month_name,
          original_start_year: osp.year,
          original_days: String(t.original_days),
          original_end: (() => {
            if (!t.original_start) return ''
            const d = new Date(t.original_start)
            d.setDate(d.getDate() + t.original_days - 1)
            return formatDate(d)
          })(),
          original_end_day: (() => {
            const d = new Date(t.original_start)
            d.setDate(d.getDate() + t.original_days - 1)
            return String(d.getDate()).padStart(2, '0')
          })(),
          original_end_month_name: (() => {
            const d = new Date(t.original_start)
            d.setDate(d.getDate() + t.original_days - 1)
            return MONTHS_GENITIVE[d.getMonth()]
          })(),
          original_end_year: (() => {
            const d = new Date(t.original_start)
            d.setDate(d.getDate() + t.original_days - 1)
            return String(d.getFullYear())
          })(),
          new_start: formatDate(t.new_start),
          new_start_day: nsp.day,
          new_start_month: nsp.month,
          new_start_month_name: nsp.month_name,
          new_start_year: nsp.year,
          new_days: String(t.new_days),
          new_end: (() => {
            if (!t.new_start) return ''
            const d = new Date(t.new_start)
            d.setDate(d.getDate() + t.new_days - 1)
            return formatDate(d)
          })(),
          new_end_day: (() => {
            const d = new Date(t.new_start)
            d.setDate(d.getDate() + t.new_days - 1)
            return String(d.getDate()).padStart(2, '0')
          })(),
          new_end_month_name: (() => {
            const d = new Date(t.new_start)
            d.setDate(d.getDate() + t.new_days - 1)
            return MONTHS_GENITIVE[d.getMonth()]
          })(),
          new_end_year: (() => {
            const d = new Date(t.new_start)
            d.setDate(d.getDate() + t.new_days - 1)
            return String(d.getFullYear())
          })(),
          has_travel: Boolean(t.has_travel),
          travel_destination: t.travel_destination || '',
          travel_children_count: String(t.travel_children_count || 0),
          has_children: Array.isArray(t.travel_children) && t.travel_children.length > 0,
          travel_children_list: (() => {
            if (!Array.isArray(t.travel_children) || t.travel_children.length === 0) return ''
            const childrenList = t.travel_children.map(child => `${child.fullName}, ${child.birthDate}`)
            return childrenList.join('; ')
          })(),
          delta_direction: delta >= 0 ? 'увеличив' : 'сократив',
          delta_days: String(Math.abs(delta)),
          note: t.note ? ` ${t.note}` : '',
        }
      }),
    }

    const s3Response = await getFromS3(tmpl.file_key)
    const buffer = Buffer.from(await s3Response.Body.transformToByteArray())

    const transferYear = transfersResult.rows[0]?.new_start
      ? extractYear(transfersResult.rows[0].new_start)
      : today.getFullYear()
    data.selected_year = String(transferYear)
    Object.assign(data, await institutionHeadData(req))
    const zip = new PizZip(buffer)
    applyYearPlaceholders(zip, transferYear)
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
    doc.render(data)
    const output = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    const filename = encodeURIComponent(`Заявление_перенос_${u.last_name}.docx`)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)
    res.send(output)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Ошибка генерации документа' })
  }
})

function isRestrictionAdmin(req) {
  return ['hr', 'admin', 'superadmin'].includes(req.user.role) || ['hr', 'admin'].includes(req.org?.org_role)
}

async function getRestrictionScopeUserIds(req) {
  if (isRestrictionAdmin(req)) return null
  const { text, values } = orgScopedQuery('SELECT id FROM departments WHERE manager_id = $1', [req.user.id], req)
  const managed = await query(text, values)
  let deptIds = managed.rows.map(r => r.id)
  if (deptIds.length === 0) {
    const me = await query('SELECT department_id FROM users WHERE id = $1', [req.user.id])
    if (me.rows[0]?.department_id) deptIds = [me.rows[0].department_id]
  }
  const [deptUsers, colleagueIds] = await Promise.all([
    deptIds.length > 0 ? query('SELECT id FROM users WHERE department_id = ANY($1::int[])', [deptIds]) : Promise.resolve({ rows: [] }),
    getVisibleColleagueIds(req.user.id),
  ])
  return [...new Set([...deptUsers.rows.map(r => r.id), ...colleagueIds])]
}

function touchesScope(memberIds, scopeIds) {
  if (scopeIds === null) return true
  const scope = new Set(scopeIds)
  return memberIds.some(id => scope.has(Number(id)))
}

/**
 * @swagger
 * /vacation/restrictions/scope-employees:
 *   get:
 *     tags: [Vacation]
 *     summary: 'Работники, доступные для ограничений пересечений (manager — отделы, которыми руководит; hr/admin — вся организация)'
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 'Список работников с тегами: id, firstName, lastName, middleName, position, departmentId, departmentName, tags'
 */
router.get('/restrictions/scope-employees', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  try {
    const scopeIds = await getRestrictionScopeUserIds(req)
    if (scopeIds !== null && scopeIds.length === 0) return res.json([])

    const params = []
    let orgJoin = ''
    if (req.org) {
      params.push(currentOrgId(req))
      orgJoin = `JOIN user_organizations uo ON uo.user_id = u.id AND uo.org_id = $${params.length} AND uo.is_active = true`
    }
    let scopeClause = ''
    if (scopeIds !== null) {
      params.push(scopeIds)
      scopeClause = `AND u.id = ANY($${params.length}::int[])`
    }

    const result = await query(
      `SELECT u.id, u.first_name, u.last_name, u.middle_name, u.position, u.department_id, d.name AS department_name,
              COALESCE(
                (SELECT json_agg(json_build_object('id', sd.id, 'name', sd.name) ORDER BY sd.name)
                 FROM user_skills us JOIN skills_dictionary sd ON us.skill_id = sd.id
                 WHERE us.user_id = u.id),
                '[]'
              ) AS tags
       FROM users u
       ${orgJoin}
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.status <> 'inactive' ${excludeTest(req, 'u')} ${scopeClause}
       ORDER BY u.last_name, u.first_name`,
      params
    )

    res.json(result.rows.map(r => ({
      id: String(r.id),
      firstName: r.first_name,
      lastName: r.last_name,
      middleName: r.middle_name,
      position: r.position || '',
      departmentId: r.department_id === null ? null : String(r.department_id),
      departmentName: r.department_name,
      tags: (r.tags || []).map(t => ({ id: String(t.id), name: t.name })),
    })))
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось загрузить работников' })
  }
})

/**
 * @swagger
 * /vacation/restrictions:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить ограничения по пересечениям отпусков
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         required: false
 *         schema: { type: integer }
 *         description: 'Фильтр по отделу; без параметра — все ограничения организации'
 *       - in: query
 *         name: tagId
 *         required: false
 *         schema: { type: integer }
 *         description: 'Только правила, содержащие указанный тег'
 *       - in: query
 *         name: search
 *         required: false
 *         schema: { type: string }
 *         description: 'Поиск по описанию (ILIKE)'
 *     responses:
 *       200:
 *         description: 'Список ограничений: employeeIds, tagIds, tags (id+name), employeeCount (реальное число людей с учётом тегов), departmentName, maxConcurrent (0 — строгий запрет пересечений)'
 */
router.get('/restrictions', authenticateToken, async (req, res) => {
  try {
    const { departmentId, tagId, search, scope } = req.query
    const conditions = []
    const values = []

    if (departmentId) {
      const deptId = parseInt(departmentId)
      if (Number.isNaN(deptId)) {
        return res.status(400).json({ error: 'Некорректный departmentId' })
      }
      values.push(deptId)
      conditions.push(`vr.department_id = $${values.length}`)
    }
    if (tagId) {
      const parsedTagId = parseInt(tagId)
      if (Number.isNaN(parsedTagId)) {
        return res.status(400).json({ error: 'Некорректный tagId' })
      }
      values.push([parsedTagId])
      conditions.push(`vr.tag_ids @> $${values.length}::int[]`)
    }
    if (search && String(search).trim()) {
      values.push(`%${String(search).trim()}%`)
      conditions.push(`vr.description ILIKE $${values.length}`)
    }
    if (req.org) {
      values.push(req.org.org_id)
      conditions.push(`vr.organization_id = $${values.length}`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await query(
      `SELECT vr.*, d.name as department_name, u.first_name, u.last_name
       FROM vacation_restrictions vr
       LEFT JOIN departments d ON vr.department_id = d.id
       JOIN users u ON vr.created_by = u.id
       ${where}
       ORDER BY vr.created_at DESC`,
      values
    )

    const allTagIds = [...new Set(result.rows.flatMap(r => r.tag_ids || []))]
    const tagNameMap = new Map()
    const tagUserMap = new Map()
    if (allTagIds.length > 0) {
      const [tagRows, tagUsers] = await Promise.all([
        query('SELECT id, name FROM skills_dictionary WHERE id = ANY($1)', [allTagIds]),
        query('SELECT skill_id, user_id FROM user_skills WHERE skill_id = ANY($1)', [allTagIds]),
      ])
      for (const row of tagRows.rows) tagNameMap.set(row.id, row.name)
      for (const row of tagUsers.rows) {
        if (!tagUserMap.has(row.skill_id)) tagUserMap.set(row.skill_id, new Set())
        tagUserMap.get(row.skill_id).add(row.user_id)
      }
    }

    const scopeIds = scope === 'mine' ? await getRestrictionScopeUserIds(req) : null
    const isAdmin = isRestrictionAdmin(req)
    const allEmployeeIds = [...new Set(result.rows.flatMap(r => r.employee_ids || []))]
    const employeeNameMap = new Map()
    const employeeDeptMap = new Map()
    if (allEmployeeIds.length > 0) {
      const nameRows = await query(
        `SELECT u.id, u.first_name, u.last_name, d.name AS department_name
         FROM users u LEFT JOIN departments d ON d.id = u.department_id
         WHERE u.id = ANY($1::int[])`,
        [allEmployeeIds]
      )
      for (const row of nameRows.rows) {
        employeeNameMap.set(row.id, `${row.last_name} ${row.first_name}`)
        if (row.department_name) employeeDeptMap.set(row.id, row.department_name)
      }
    }

    const restrictions = result.rows.flatMap(r => {
      const memberIds = new Set(r.employee_ids)
      for (const tagId of (r.tag_ids || [])) {
        for (const uid of (tagUserMap.get(tagId) || new Set())) memberIds.add(uid)
      }
      if (scope === 'mine' && r.created_by !== req.user.id && !touchesScope([...memberIds], scopeIds)) return []
      return [{
        id: r.id,
        departmentId: r.department_id === null ? null : String(r.department_id),
        departmentName: r.department_name,
        type: r.restriction_type,
        employeeIds: r.employee_ids.map(String),
        tagIds: (r.tag_ids || []).map(String),
        tags: (r.tag_ids || []).map(id => ({ id: String(id), name: tagNameMap.get(id) || String(id) })),
        employeeCount: memberIds.size,
        maxConcurrent: r.max_concurrent,
        description: r.description,
        createdAt: r.created_at,
        createdBy: String(r.created_by),
        createdByName: `${r.last_name} ${r.first_name}`,
        employees: (r.employee_ids || []).map(id => ({ id: String(id), name: employeeNameMap.get(id) || String(id) })),
        employeeDepartments: [...new Set((r.employee_ids || []).map(id => employeeDeptMap.get(id)).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'ru')),
        canManage: isAdmin || r.created_by === req.user.id,
      }]
    })

    res.json(restrictions)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось получить ограничения' })
  }
})

/**
 * @swagger
 * /vacation/restrictions/preview-count:
 *   get:
 *     tags: [Vacation]
 *     summary: Предпросмотр числа работников для набора тегов/сотрудников (до создания правила)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tagIds
 *         required: false
 *         schema: { type: string }
 *         description: 'Список id тегов через запятую'
 *       - in: query
 *         name: employeeIds
 *         required: false
 *         schema: { type: string }
 *         description: 'Список id работников через запятую'
 *     responses:
 *       200:
 *         description: 'Реальное число уникальных людей, охваченных выбором (сотрудники ∪ работники с тегами)'
 */
router.get('/restrictions/preview-count', authenticateToken, async (req, res) => {
  try {
    const parseIdList = (raw) => [...new Set(
      String(raw || '').split(',').map(id => parseInt(id.trim())).filter(id => !Number.isNaN(id))
    )]
    const employeeIds = parseIdList(req.query.employeeIds)
    const tagIds = parseIdList(req.query.tagIds)

    if (employeeIds.length === 0 && tagIds.length === 0) {
      return res.json({ count: 0 })
    }

    const result = await query(
      `SELECT COUNT(DISTINCT uid)::int as c FROM (
         SELECT unnest($1::int[]) as uid
         UNION
         SELECT user_id FROM user_skills WHERE skill_id = ANY($2)
       ) t`,
      [employeeIds, tagIds]
    )
    res.json({ count: result.rows[0].c })
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось посчитать работников' })
  }
})

const addOneDay = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * @swagger
 * /vacation/restrictions/violations:
 *   get:
 *     tags: [Vacation]
 *     summary: 'Текущие нарушения правил пересечений (кто фактически пересекается) для отдела'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         required: false
 *         schema: { type: integer }
 *         description: 'Отдел; менеджер без параметра видит свой отдел. HR/admin могут указать любой отдел организации'
 *     responses:
 *       200:
 *         description: 'Список нарушений: restrictionId, type, description, tagNames, maxConcurrent, startDate, endDate, userIds, names'
 *       403:
 *         description: Доступ только к своему отделу (для руководителя)
 */
router.get('/restrictions/violations', authenticateToken, async (req, res) => {
  try {
    const isElevated = isRestrictionAdmin(req)
    const scopeMine = req.query.scope === 'mine'
    let departmentId = req.query.departmentId ? parseInt(req.query.departmentId) : null

    if (!departmentId && !scopeMine) {
      const { text: mdText, values: mdValues } = orgScopedQuery(
        'SELECT id FROM departments WHERE manager_id = $1', [req.user.id], req
      )
      const byManagerId = await query(mdText, mdValues)
      if (byManagerId.rows.length > 0) {
        departmentId = byManagerId.rows[0].id
      } else {
        const me = await query('SELECT department_id FROM users WHERE id = $1', [req.user.id])
        departmentId = me.rows[0]?.department_id ?? null
      }
    }
    if (!departmentId && !scopeMine) {
      return res.json([])
    }
    if (!isElevated && !scopeMine) {
      const { text: mcText, values: mcValues } = orgScopedQuery(
        'SELECT 1 FROM departments WHERE id = $1 AND manager_id = $2', [departmentId, req.user.id], req
      )
      const managerCheck = await query(mcText, mcValues)
      if (managerCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Доступ только к своему отделу' })
      }
    }

    const { text: restText, values: restValues } = scopeMine
      ? orgScopedQuery('SELECT * FROM vacation_restrictions', [], req)
      : orgScopedQuery(
        'SELECT * FROM vacation_restrictions WHERE (department_id = $1 OR department_id IS NULL)',
        [departmentId], req
      )
    const restrictions = await query(restText, restValues)
    if (restrictions.rows.length === 0) {
      return res.json([])
    }
    const violationScopeIds = scopeMine ? await getRestrictionScopeUserIds(req) : null

    const allTagIds = [...new Set(restrictions.rows.flatMap(r => r.tag_ids || []))]
    const tagUserMap = new Map()
    if (allTagIds.length > 0) {
      const tagUsers = await query('SELECT skill_id, user_id FROM user_skills WHERE skill_id = ANY($1)', [allTagIds])
      for (const row of tagUsers.rows) {
        if (!tagUserMap.has(row.skill_id)) tagUserMap.set(row.skill_id, new Set())
        tagUserMap.get(row.skill_id).add(row.user_id)
      }
    }

    const restrictionRows = restrictions.rows
      .map(r => {
        const manualIds = (r.employee_ids || []).map(Number)
        const ids = new Set(manualIds)
        for (const tagId of (r.tag_ids || [])) {
          for (const uid of (tagUserMap.get(tagId) || new Set())) ids.add(uid)
        }
        const memberIds = violationScopeIds === null
          ? [...ids]
          : [...ids].filter(id => violationScopeIds.includes(id))
        return { ...r, memberIds }
      })
      .filter(r => r.memberIds.length >= 2)

    if (restrictionRows.length === 0) {
      return res.json([])
    }

    const allMemberIds = [...new Set(restrictionRows.flatMap(r => r.memberIds))]

    const { text: reqText, values: reqValues } = orgScopedQuery(
      `SELECT vr.user_id, vr.start_date, vr.end_date FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id
       WHERE vr.user_id = ANY($1) AND rs.code IN ('on_approval', 'approved') AND vr.end_date >= $2
         AND vr.user_id IN (SELECT id FROM users WHERE status <> 'inactive')`,
      [allMemberIds, todayISO()], req
    )
    const [reqRows, nameRows, tagRows] = await Promise.all([
      query(reqText, reqValues),
      query('SELECT id, first_name, last_name, middle_name FROM users WHERE id = ANY($1)', [allMemberIds]),
      allTagIds.length > 0
        ? query('SELECT id, name FROM skills_dictionary WHERE id = ANY($1)', [allTagIds])
        : Promise.resolve({ rows: [] }),
    ])
    const nameMap = new Map(nameRows.rows.map(r => [r.id, [r.last_name, r.first_name, r.middle_name].filter(Boolean).join(' ')]))
    const tagNameMap = new Map(tagRows.rows.map(r => [r.id, r.name]))

    const requestsByUser = new Map()
    for (const row of reqRows.rows) {
      if (!requestsByUser.has(row.user_id)) requestsByUser.set(row.user_id, [])
      requestsByUser.get(row.user_id).push({ start: row.start_date, end: row.end_date })
    }

    const violations = []

    for (const restriction of restrictionRows) {
      const limit = restriction.max_concurrent ?? 1

      const intervals = []
      for (const uid of restriction.memberIds) {
        for (const iv of (requestsByUser.get(uid) || [])) {
          intervals.push({ uid, start: iv.start, end: iv.end })
        }
      }
      if (intervals.length < 2) continue

      const today = todayISO()
      const earliest = intervals.reduce((m, iv) => (iv.start < m ? iv.start : m), intervals[0].start)
      const minDate = earliest < today ? today : earliest
      const maxDate = intervals.reduce((m, iv) => (iv.end > m ? iv.end : m), intervals[0].end)

      const violatingDays = []
      for (let d = minDate; d <= maxDate; d = addOneDay(d)) {
        const activeUids = [...new Set(intervals.filter(iv => iv.start <= d && iv.end >= d).map(iv => iv.uid))]
        if (activeUids.length > limit) {
          violatingDays.push({ date: d, uids: activeUids })
        }
      }
      if (violatingDays.length === 0) continue

      let group = null
      const groups = []
      for (const vd of violatingDays) {
        const key = vd.uids.slice().sort((a, b) => a - b).join(',')
        if (group && group.key === key && addOneDay(group.end) === vd.date) {
          group.end = vd.date
        } else {
          if (group) groups.push(group)
          group = { key, uids: vd.uids, start: vd.date, end: vd.date }
        }
      }
      if (group) groups.push(group)

      const tagNames = (restriction.tag_ids || []).map(id => tagNameMap.get(id)).filter(Boolean)

      for (const g of groups) {
        violations.push({
          restrictionId: restriction.id,
          type: restriction.restriction_type,
          description: restriction.description,
          tagNames,
          maxConcurrent: restriction.restriction_type === 'group' ? restriction.max_concurrent : null,
          startDate: g.start,
          endDate: g.end,
          userIds: g.uids.map(String),
          names: g.uids.map(uid => nameMap.get(uid) || String(uid)),
        })
      }
    }

    violations.sort((a, b) => a.startDate.localeCompare(b.startDate))
    res.json(violations)
  } catch (error) {
    res.locals.errorCause = error
    console.error('GET /restrictions/violations error:', error)
    res.status(500).json({ error: 'Не удалось проверить пересечения' })
  }
})

/**
 * @swagger
 * /vacation/restrictions:
 *   post:
 *     tags: [Vacation]
 *     summary: Создать ограничение по отпуску
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               departmentId: { type: integer, description: 'Необязателен для правил только по тегам — тогда правило действует во всех отделах' }
 *               type: { type: string, enum: [group] }
 *               employeeIds: { type: array, items: { type: integer } }
 *               tagIds: { type: array, items: { type: integer } }
 *               maxConcurrent: { type: integer, description: '0 — строгий запрет пересечений' }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Ограничение создано
 */
async function resolveRestrictionFields({ type, rawEmployeeIds, rawTagIds, maxConcurrent }) {
  const parsedIds = [...new Set(
    Array.isArray(rawEmployeeIds)
      ? rawEmployeeIds.map(id => parseInt(id)).filter(id => !Number.isNaN(id))
      : []
  )]
  const parsedTagIds = [...new Set(
    Array.isArray(rawTagIds)
      ? rawTagIds.map(id => parseInt(id)).filter(id => !Number.isNaN(id))
      : []
  )]

  if (parsedTagIds.length > 0) {
    const tagRows = await query('SELECT id FROM skills_dictionary WHERE id = ANY($1)', [parsedTagIds])
    if (tagRows.rows.length !== parsedTagIds.length) {
      return { error: 'Некоторые из указанных тегов не найдены' }
    }
  }

  if (type === 'group') {
    const membersResult = await query(
      `SELECT COUNT(DISTINCT uid)::int as c FROM (
         SELECT unnest($1::int[]) as uid
         UNION
         SELECT user_id FROM user_skills WHERE skill_id = ANY($2)
       ) t`,
      [parsedIds, parsedTagIds]
    )
    if (membersResult.rows[0].c < 1) {
      return { error: 'Выберите хотя бы одного работника' }
    }
    let maxConc = 1
    if (maxConcurrent !== undefined && maxConcurrent !== null) {
      const parsedMax = parseInt(maxConcurrent)
      if (Number.isNaN(parsedMax) || parsedMax < 0) {
        return { error: 'Максимум одновременно в отпуске должен быть целым числом не меньше 0' }
      }
      maxConc = parsedMax
    }
    return { employeeIds: parsedIds, tagIds: parsedTagIds, maxConc }
  }

  return { error: 'Некорректный тип ограничения' }
}

function parseDeptId(departmentId) {
  if (departmentId === undefined || departmentId === null || departmentId === '') return { deptId: null }
  const deptId = parseInt(departmentId)
  if (Number.isNaN(deptId)) return { error: 'Некорректный departmentId' }
  return { deptId }
}

function mapRestrictionRow(r, userRow) {
  return {
    id: r.id,
    departmentId: r.department_id === null ? null : String(r.department_id),
    type: r.restriction_type,
    employeeIds: r.employee_ids.map(String),
    tagIds: (r.tag_ids || []).map(String),
    maxConcurrent: r.max_concurrent,
    description: r.description,
    createdAt: r.created_at,
    createdBy: String(r.created_by),
    createdByName: `${userRow.last_name} ${userRow.first_name}`,
  }
}

router.post('/restrictions', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  try {
    const { departmentId, type, employeeIds: rawEmployeeIds, tagIds: rawTagIds, maxConcurrent, description } = req.body
    const createdBy = req.user.id

    if (!type) {
      return res.status(400).json({ error: 'Укажите type' })
    }

    const deptResult = parseDeptId(departmentId)
    if (deptResult.error) {
      return res.status(400).json({ error: deptResult.error })
    }

    const resolved = await resolveRestrictionFields({ type, rawEmployeeIds, rawTagIds, maxConcurrent })
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error })
    }
    const { employeeIds, tagIds, maxConc } = resolved

    const result = await query(
      `INSERT INTO vacation_restrictions (department_id, restriction_type, employee_ids, tag_ids, max_concurrent, description, created_by, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [deptResult.deptId, type, employeeIds, tagIds, maxConc, description || null, createdBy, currentOrgId(req)]
    )

    const r = result.rows[0]
    const user = await query('SELECT first_name, last_name FROM users WHERE id = $1', [createdBy])

    res.status(201).json(mapRestrictionRow(r, user.rows[0]))
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось создать ограничение' })
  }
})

/**
 * @swagger
 * /vacation/restrictions/{id}:
 *   put:
 *     tags: [Vacation]
 *     summary: Изменить ограничение по отпуску
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               departmentId: { type: integer, description: 'Необязателен для правил только по тегам' }
 *               type: { type: string, enum: [group] }
 *               employeeIds: { type: array, items: { type: integer } }
 *               tagIds: { type: array, items: { type: integer } }
 *               maxConcurrent: { type: integer, description: '0 — строгий запрет пересечений' }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: Ограничение обновлено
 */
router.put('/restrictions/:id', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params
    const { departmentId, type, employeeIds: rawEmployeeIds, tagIds: rawTagIds, maxConcurrent, description } = req.body

    if (!type) {
      return res.status(400).json({ error: 'Укажите type' })
    }

    const deptResult = parseDeptId(departmentId)
    if (deptResult.error) {
      return res.status(400).json({ error: deptResult.error })
    }

    const resolved = await resolveRestrictionFields({ type, rawEmployeeIds, rawTagIds, maxConcurrent })
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error })
    }
    const { employeeIds, tagIds, maxConc } = resolved

    if (!isRestrictionAdmin(req)) {
      const { text: ownText, values: ownValues } = orgScopedQuery('SELECT created_by FROM vacation_restrictions WHERE id = $1', [id], req)
      const own = await query(ownText, ownValues)
      if (own.rows.length === 0) return res.status(404).json({ error: 'Ограничение не найдено' })
      if (own.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Изменять ограничение может только его владелец или HR' })
      }
    }

    const { text: updText, values: updValues } = orgScopedQuery(
      `UPDATE vacation_restrictions
       SET department_id = $1, restriction_type = $2, employee_ids = $3, tag_ids = $4, max_concurrent = $5, description = $6
       WHERE id = $7
       RETURNING *`,
      [deptResult.deptId, type, employeeIds, tagIds, maxConc, description || null, id],
      req
    )
    const result = await query(updText, updValues)
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ограничение не найдено' })
    }

    const r = result.rows[0]
    const user = await query('SELECT first_name, last_name FROM users WHERE id = $1', [r.created_by])

    res.json(mapRestrictionRow(r, user.rows[0]))
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось обновить ограничение' })
  }
})

/**
 * @swagger
 * /vacation/restrictions/{id}:
 *   delete:
 *     tags: [Vacation]
 *     summary: Удалить ограничение по отпуску
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ограничение удалено
 */
router.delete('/restrictions/:id', authenticateToken, authorizeRoles('manager', 'hr', 'admin'), async (req, res) => {
  try {
    const { id } = req.params
    if (!isRestrictionAdmin(req)) {
      const { text: ownText, values: ownValues } = orgScopedQuery('SELECT created_by FROM vacation_restrictions WHERE id = $1', [id], req)
      const own = await query(ownText, ownValues)
      if (own.rows.length === 0) return res.status(404).json({ error: 'Ограничение не найдено' })
      if (own.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Удалить ограничение может только его владелец или HR' })
      }
    }
    const { text: delText, values: delValues } = orgScopedQuery('DELETE FROM vacation_restrictions WHERE id = $1 RETURNING *', [id], req)
    const result = await query(delText, delValues)
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ограничение не найдено' })
    }
    res.json({ success: true })
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось удалить ограничение' })
  }
})

/**
 * @swagger
 * /vacation/check-restrictions:
 *   post:
 *     tags: [Vacation]
 *     summary: Проверить даты отпуска на ограничения
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, startDate, endDate]
 *             properties:
 *               userId: { type: integer }
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *     responses:
 *       200:
 *         description: 'Список нарушений: message, rule (group), ruleType (manual|tag|combined), tagNames, names (ФИО пересекающихся), dates (интервалы пересечений)'
 */
router.post('/check-restrictions', authenticateToken, async (req, res) => {
  try {
    const { userId, startDate, endDate: rawEndDate } = req.body

    if (!userId || !startDate || !rawEndDate) {
      return res.status(400).json({ error: 'Укажите userId, startDate и endDate' })
    }

    let endDate
    try {
      endDate = (await computeVacationDates(startDate, rawEndDate)).endDate
    } catch (err) {
      res.locals.errorCause = err
      if (err instanceof VacationValidationError) {
        return res.status(400).json({ error: err.message })
      }
      throw err
    }

    const userResult = await query('SELECT department_id FROM users WHERE id = $1', [userId])
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }
    const departmentId = userResult.rows[0].department_id

    const { text: chkRestText, values: chkRestValues } = orgScopedQuery(
      'SELECT * FROM vacation_restrictions WHERE (department_id = $1 OR department_id IS NULL)',
      [departmentId], req
    )
    const restrictions = await query(chkRestText, chkRestValues)

    const allTagIds = [...new Set(restrictions.rows.flatMap(r => r.tag_ids || []))]
    const tagUserMap = new Map()
    if (allTagIds.length > 0) {
      const tagUsers = await query('SELECT skill_id, user_id FROM user_skills WHERE skill_id = ANY($1)', [allTagIds])
      for (const row of tagUsers.rows) {
        if (!tagUserMap.has(row.skill_id)) tagUserMap.set(row.skill_id, new Set())
        tagUserMap.get(row.skill_id).add(row.user_id)
      }
    }

    const restrictionRows = restrictions.rows.map(r => {
      const manualIds = (r.employee_ids || []).map(id => parseInt(id))
      const ids = new Set(manualIds)
      for (const tagId of (r.tag_ids || [])) {
        for (const uid of (tagUserMap.get(tagId) || new Set())) ids.add(uid)
      }
      const source = (r.tag_ids || []).length > 0 ? (manualIds.length > 0 ? 'combined' : 'tag') : 'manual'
      return { ...r, employee_ids: [...ids], source }
    })

    const allOtherUserIds = new Set()
    for (const restriction of restrictionRows) {
      const others = (restriction.employee_ids || []).filter(id => id !== parseInt(userId))
      others.forEach(id => allOtherUserIds.add(id))
    }

    let overlapSet = new Set()
    let overlapDatesMap = new Map()
    let nameMap = new Map()
    if (allOtherUserIds.size > 0) {
      const allIds = [...allOtherUserIds]
      const { text: ovText2, values: ovValues2 } = orgScopedQuery(
        `SELECT DISTINCT vr.user_id, vr.start_date, vr.end_date FROM vacation_requests vr
           JOIN request_statuses rs ON vr.status_id = rs.id
           WHERE vr.user_id = ANY($1)
           AND rs.code IN ('on_approval', 'approved')
           AND vr.start_date <= $3 AND vr.end_date >= $2
           AND vr.user_id IN (SELECT id FROM users WHERE status <> 'inactive')`,
        [allIds, startDate, endDate], req
      )
      const [overlapResult, namesResult] = await Promise.all([
        query(ovText2, ovValues2),
        query('SELECT id, first_name, last_name, middle_name FROM users WHERE id = ANY($1)', [allIds])
      ])
      for (const row of overlapResult.rows) {
        overlapSet.add(row.user_id)
        if (!overlapDatesMap.has(row.user_id)) overlapDatesMap.set(row.user_id, [])
        overlapDatesMap.get(row.user_id).push({ startDate: row.start_date, endDate: row.end_date })
      }
      for (const row of namesResult.rows) {
        nameMap.set(row.id, [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' '))
      }
    }

    const tagNameMap = new Map()
    if (allTagIds.length > 0) {
      const tagRows = await query('SELECT id, name FROM skills_dictionary WHERE id = ANY($1)', [allTagIds])
      for (const row of tagRows.rows) tagNameMap.set(row.id, row.name)
    }

    const fullNameOf = (id) => {
      const name = nameMap.get(parseInt(id))
      return name && name.trim() ? name : String(id)
    }

    const violations = []

    for (const restriction of restrictionRows) {
      const memberIds = (restriction.employee_ids || []).map(id => parseInt(id))
      if (!memberIds.includes(parseInt(userId))) continue

      const tagNames = (restriction.tag_ids || []).map(id => tagNameMap.get(id)).filter(Boolean)
      const tagSuffix = tagNames.length > 0 ? `, правило по тегам: ${tagNames.join(', ')}` : ''

      if (restriction.restriction_type === 'group') {
        const concurrentIds = restriction.employee_ids
          .filter(id => id !== parseInt(userId) && overlapSet.has(id))
        const limit = restriction.max_concurrent

        if (concurrentIds.length >= (limit || 1)) {
          const concurrentNames = concurrentIds.map(id => fullNameOf(id))
          violations.push({
            field: 'restriction',
            message: limit === 0
              ? `Пересечение отпусков запрещено: ${concurrentNames.join(', ')} уже в отпуске в эти даты${tagSuffix}`
              : `Превышен лимит одновременных отпусков в отделе (макс. ${limit})${tagSuffix}`,
            rule: 'group',
            ruleType: restriction.source,
            tagNames,
            names: concurrentNames,
            dates: concurrentIds.flatMap(id => overlapDatesMap.get(id) || []),
            conflicts: concurrentIds.map(id => ({
              userId: String(id),
              name: fullNameOf(id),
              periods: overlapDatesMap.get(id) || [],
            })),
          })
        }
      }
    }

    res.json(violations)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось проверить ограничения' })
  }
})

router.get('/my-substitutions', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT vr.id, vr.start_date, vr.end_date, vr.duration,
              u.id as user_id, u.first_name, u.last_name, u.middle_name,
              u.position, u.avatar, u.gender,
              rs.code as status
       FROM vacation_substitutions vs
       JOIN vacation_requests vr ON vs.vacation_request_id = vr.id
       JOIN request_statuses rs ON vr.status_id = rs.id
       JOIN users u ON vr.user_id = u.id
       WHERE vs.substitute_user_id = $1 AND vr.end_date >= CURRENT_DATE
         ${req.org ? 'AND vs.organization_id = $2' : ''}
       ORDER BY vr.start_date ASC`,
      req.org ? [req.user.id, req.org.org_id] : [req.user.id]
    )
    res.json(result.rows)
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось получить замещения' })
  }
})

router.post('/requests/:id/substitutes', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { substitute_ids } = req.body
    if (!Array.isArray(substitute_ids) || substitute_ids.length === 0) {
      return res.status(400).json({ error: 'Укажите замещающих' })
    }

    const { text: reqText, values: reqValues } = orgScopedQuery(
      `SELECT vr.*, rs.code as status FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id WHERE vr.id = $1`,
      [id], req
    )
    const request = await query(reqText, reqValues)
    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Заявка не найдена' })
    }

    const vacation = request.rows[0]
    const isOwner = vacation.user_id === req.user.id
    const isPrivileged = ['hr', 'admin'].includes(req.user.role)
    if (!isOwner && !isPrivileged) {
      const approverIds = await getApproverIds(vacation.approver_id, req)
      if (!approverIds.includes(req.user.id)) {
        return res.status(403).json({ error: 'Нет прав' })
      }
    }

    const validUsers = await query(
      `SELECT u.id FROM users u
       JOIN user_organizations uo ON uo.user_id = u.id AND uo.is_active = true
       WHERE u.id = ANY($1) AND u.status <> 'inactive'${req.org ? ' AND uo.org_id = $2' : ''}`,
      req.org ? [substitute_ids, req.org.org_id] : [substitute_ids]
    )
    const validIds = validUsers.rows.map((r) => r.id)
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'Замещающие не найдены в организации' })
    }

    const empName = await getEmpName(vacation.user_id)
    for (const subId of validIds) {
      await query(
        `INSERT INTO vacation_substitutions (vacation_request_id, substitute_user_id, assigned_by, organization_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [id, subId, req.user.id, currentOrgId(req)]
      )
      notify({
        userId: subId,
        type: 'vacation_substitution',
        data: {
          requestId: id,
          employeeName: empName,
          startDate: fmtDate(vacation.start_date),
          endDate: fmtDate(vacation.end_date),
          link: '/vacation'
        }
      }).catch((err) => console.warn(`[NOTIFY] substitute add ${subId}: ${err.message}`))
    }

    res.status(201).json({ added: validIds.length })
    notifyVacationChanged(req, id, 'substitutes_changed')
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось добавить замещающих' })
  }
})

router.delete('/requests/:id/substitutes/:userId', authenticateToken, async (req, res) => {
  try {
    const { id, userId } = req.params
    const subUserId = parseInt(userId)

    const { text: reqText, values: reqValues } = orgScopedQuery(
      `SELECT vr.*, rs.code as status FROM vacation_requests vr
       JOIN request_statuses rs ON vr.status_id = rs.id WHERE vr.id = $1`,
      [id], req
    )
    const request = await query(reqText, reqValues)
    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Заявка не найдена' })
    }

    const vacation = request.rows[0]
    const isOwner = vacation.user_id === req.user.id
    const isPrivileged = ['hr', 'admin'].includes(req.user.role)
    if (!isOwner && !isPrivileged) {
      const approverIds = await getApproverIds(vacation.approver_id, req)
      if (!approverIds.includes(req.user.id)) {
        return res.status(403).json({ error: 'Нет прав' })
      }
    }

    const { text: delText, values: delValues } = orgScopedQuery(
      `DELETE FROM vacation_substitutions WHERE vacation_request_id = $1 AND substitute_user_id = $2`,
      [id, subUserId], req
    )
    await query(delText, delValues)

    notify({
      userId: subUserId,
      type: 'vacation_substitution_removed',
      data: { requestId: id, link: '/vacation' }
    }).catch((err) => console.warn(`[NOTIFY] substitute remove ${subUserId}: ${err.message}`))

    res.json({ removed: true })
    notifyVacationChanged(req, id, 'substitutes_changed')
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось удалить замещающего' })
  }
})

/**
 * @swagger
 * /vacation/day-rules:
 *   get:
 *     tags: [Vacation]
 *     summary: Получить настройки количества дней отпуска по умолчанию, должностям и работникам
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Настройки дней отпуска
 */
router.get('/day-rules', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const orgId = currentOrgId(req)
    const result = await query(
      `SELECT r.id, r.position, r.user_id, r.days, r.group_id, u.first_name, u.last_name, u.middle_name, u.position as user_position
       FROM vacation_day_rules r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.organization_id = $1
       ORDER BY r.position NULLS LAST, u.last_name NULLS LAST`,
      [orgId]
    )
    const defaultRule = result.rows.find((r) => r.user_id === null && r.position === null)
    const positionRules = result.rows
      .filter((r) => r.position !== null)
      .map((r) => ({ id: r.id, position: r.position, days: r.days, groupId: r.group_id }))
    const userRules = result.rows
      .filter((r) => r.user_id !== null)
      .map((r) => ({
        id: r.id,
        userId: String(r.user_id),
        userName: `${r.last_name} ${r.first_name}${r.middle_name ? ' ' + r.middle_name : ''}`,
        position: r.user_position,
        days: r.days,
        groupId: r.group_id,
      }))
    res.json({ defaultDays: defaultRule ? defaultRule.days : 28, positionRules, userRules })
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось получить настройки дней отпуска' })
  }
})

/**
 * @swagger
 * /vacation/day-rules:
 *   put:
 *     tags: [Vacation]
 *     summary: Задать количество дней отпуска по умолчанию, для должности или для работника
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [days]
 *             properties:
 *               position: { type: string }
 *               userId: { type: integer }
 *               positions: { type: array, items: { type: string } }
 *               userIds: { type: array, items: { type: integer } }
 *               groupId: { type: string }
 *               days: { type: integer }
 *     responses:
 *       200:
 *         description: Настройка сохранена
 */
router.put('/day-rules', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { position, userId, positions, userIds, groupId, days } = req.body
    const parsedDays = parseInt(days)
    if (Number.isNaN(parsedDays) || parsedDays < 0) {
      return res.status(400).json({ error: 'Некорректное число дней' })
    }
    const orgId = currentOrgId(req)
    if (!orgId) return res.status(400).json({ error: 'Не выбрана организация' })

    // Bulk create: one grouped rule covering several positions at once
    if (Array.isArray(positions)) {
      const trimmed = [...new Set(positions.map((p) => String(p).trim()).filter(Boolean))]
      if (trimmed.length === 0) return res.status(400).json({ error: 'Не выбраны должности' })
      const newGroupId = randomUUID()
      const client = await getClient()
      try {
        await client.query('BEGIN')
        for (const pos of trimmed) {
          const existing = await client.query(
            `SELECT id FROM vacation_day_rules WHERE organization_id = $1 AND position = $2`,
            [orgId, pos]
          )
          if (existing.rows.length > 0) {
            await client.query(
              `UPDATE vacation_day_rules SET days = $1, group_id = $2, updated_at = NOW() WHERE id = $3`,
              [parsedDays, newGroupId, existing.rows[0].id]
            )
          } else {
            await client.query(
              `INSERT INTO vacation_day_rules (organization_id, position, days, group_id) VALUES ($1, $2, $3, $4)`,
              [orgId, pos, parsedDays, newGroupId]
            )
          }
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
      for (const pos of trimmed) {
        await applyRuleToExistingBalances(orgId, { position: pos }, parsedDays)
      }
      return res.json({ success: true, groupId: newGroupId })
    }

    // Bulk create: one grouped rule covering several employees at once
    if (Array.isArray(userIds)) {
      const parsedIds = [...new Set(userIds.map((id) => parseInt(id)).filter((id) => !Number.isNaN(id)))]
      if (parsedIds.length === 0) return res.status(400).json({ error: 'Не выбраны работники' })
      const newGroupId = randomUUID()
      const client = await getClient()
      try {
        await client.query('BEGIN')
        for (const uid of parsedIds) {
          const existing = await client.query(
            `SELECT id FROM vacation_day_rules WHERE organization_id = $1 AND user_id = $2`,
            [orgId, uid]
          )
          if (existing.rows.length > 0) {
            await client.query(
              `UPDATE vacation_day_rules SET days = $1, group_id = $2, updated_at = NOW() WHERE id = $3`,
              [parsedDays, newGroupId, existing.rows[0].id]
            )
          } else {
            await client.query(
              `INSERT INTO vacation_day_rules (organization_id, user_id, days, group_id) VALUES ($1, $2, $3, $4)`,
              [orgId, uid, parsedDays, newGroupId]
            )
          }
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
      for (const uid of parsedIds) {
        await applyRuleToExistingBalances(orgId, { userId: uid }, parsedDays)
      }
      return res.json({ success: true, groupId: newGroupId })
    }

    // Edit an existing grouped rule: update all its members together
    if (groupId) {
      const members = await query(
        `SELECT id, position, user_id FROM vacation_day_rules WHERE organization_id = $1 AND group_id = $2`,
        [orgId, groupId]
      )
      if (members.rows.length === 0) return res.status(404).json({ error: 'Правило не найдено' })
      await query(
        `UPDATE vacation_day_rules SET days = $1, updated_at = NOW() WHERE organization_id = $2 AND group_id = $3`,
        [parsedDays, orgId, groupId]
      )
      for (const m of members.rows) {
        if (m.user_id) await applyRuleToExistingBalances(orgId, { userId: m.user_id }, parsedDays)
        else if (m.position) await applyRuleToExistingBalances(orgId, { position: m.position }, parsedDays)
      }
      return res.json({ success: true, groupId })
    }

    // Single rule: default value, or an ungrouped legacy position/employee rule
    const trimmedPosition = position ? String(position).trim() : null
    if (trimmedPosition && userId) {
      return res.status(400).json({ error: 'Укажите либо должность, либо работника, не оба' })
    }
    const parsedUserId = userId ? parseInt(userId) : null
    if (userId && Number.isNaN(parsedUserId)) return res.status(400).json({ error: 'Некорректный работник' })

    const existing = await query(
      `SELECT id FROM vacation_day_rules
       WHERE organization_id = $1
         AND position IS NOT DISTINCT FROM $2
         AND user_id IS NOT DISTINCT FROM $3`,
      [orgId, trimmedPosition, parsedUserId]
    )

    let row
    if (existing.rows.length > 0) {
      const upd = await query(
        `UPDATE vacation_day_rules SET days = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [parsedDays, existing.rows[0].id]
      )
      row = upd.rows[0]
    } else {
      const ins = await query(
        `INSERT INTO vacation_day_rules (organization_id, position, user_id, days) VALUES ($1, $2, $3, $4) RETURNING *`,
        [orgId, trimmedPosition, parsedUserId, parsedDays]
      )
      row = ins.rows[0]
    }

    await applyRuleToExistingBalances(orgId, { position: trimmedPosition, userId: parsedUserId }, parsedDays)

    res.json({ success: true, id: row.id })
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось сохранить настройку' })
  }
})

/**
 * @swagger
 * /vacation/day-rules/members:
 *   put:
 *     tags: [Vacation]
 *     summary: Изменить состав и число дней правила по должностям или работникам
 *     description: 'Заменяет список должностей (kind=position) или работников (kind=user) правила, заданного groupId или ruleId. Убранные из правила участники удаляются, новые добавляются (если у участника было другое правило — он переносится в это). Балансы участников за текущий и будущие годы пересчитываются'
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [kind, days]
 *             properties:
 *               groupId: { type: string }
 *               ruleId: { type: integer }
 *               kind: { type: string, enum: [position, user] }
 *               positions: { type: array, items: { type: string } }
 *               userIds: { type: array, items: { type: integer } }
 *               days: { type: integer }
 *     responses:
 *       200:
 *         description: Правило обновлено
 */
router.put('/day-rules/members', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const { groupId, ruleId, kind, positions, userIds, days } = req.body
    const parsedDays = parseInt(days)
    if (Number.isNaN(parsedDays) || parsedDays < 0) {
      return res.status(400).json({ error: 'Некорректное число дней' })
    }
    if (kind !== 'position' && kind !== 'user') {
      return res.status(400).json({ error: 'Некорректный тип правила' })
    }
    const orgId = currentOrgId(req)
    if (!orgId) return res.status(400).json({ error: 'Не выбрана организация' })

    const desired = kind === 'position'
      ? [...new Set((Array.isArray(positions) ? positions : []).map((p) => String(p).trim()).filter(Boolean))]
      : [...new Set((Array.isArray(userIds) ? userIds : []).map((id) => parseInt(id)).filter((id) => !Number.isNaN(id)))]
    if (desired.length === 0) {
      return res.status(400).json({ error: kind === 'position' ? 'Выберите хотя бы одну должность' : 'Выберите хотя бы одного работника' })
    }

    const column = kind === 'position' ? 'position' : 'user_id'
    const current = groupId
      ? await query(`SELECT id, ${column} AS member FROM vacation_day_rules WHERE organization_id = $1 AND group_id = $2 AND ${column} IS NOT NULL`, [orgId, groupId])
      : await query(`SELECT id, ${column} AS member FROM vacation_day_rules WHERE organization_id = $1 AND id = $2 AND ${column} IS NOT NULL`, [orgId, parseInt(ruleId)])
    if (current.rows.length === 0) return res.status(404).json({ error: 'Правило не найдено' })

    const targetGroupId = groupId || randomUUID()
    const client = await getClient()
    try {
      await client.query('BEGIN')
      const removedIds = current.rows.filter((r) => !desired.includes(r.member)).map((r) => r.id)
      if (removedIds.length > 0) {
        await client.query('DELETE FROM vacation_day_rules WHERE organization_id = $1 AND id = ANY($2::int[])', [orgId, removedIds])
      }
      for (const member of desired) {
        const existing = await client.query(
          `SELECT id FROM vacation_day_rules WHERE organization_id = $1 AND ${column} = $2`,
          [orgId, member]
        )
        if (existing.rows.length > 0) {
          await client.query(
            'UPDATE vacation_day_rules SET days = $1, group_id = $2, updated_at = NOW() WHERE id = $3',
            [parsedDays, targetGroupId, existing.rows[0].id]
          )
        } else {
          await client.query(
            `INSERT INTO vacation_day_rules (organization_id, ${column}, days, group_id) VALUES ($1, $2, $3, $4)`,
            [orgId, member, parsedDays, targetGroupId]
          )
        }
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    for (const member of desired) {
      await applyRuleToExistingBalances(orgId, kind === 'position' ? { position: member } : { userId: member }, parsedDays)
    }
    res.json({ success: true, groupId: targetGroupId })
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось сохранить правило' })
  }
})

/**
 * @swagger
 * /vacation/day-rules/group/{groupId}:
 *   delete:
 *     tags: [Vacation]
 *     summary: Удалить сгруппированное правило дней отпуска целиком
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Правило удалено
 */
router.delete('/day-rules/group/:groupId', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const orgId = currentOrgId(req)
    const result = await query(
      'DELETE FROM vacation_day_rules WHERE group_id = $1 AND organization_id = $2 RETURNING *',
      [req.params.groupId, orgId]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Правило не найдено' })
    res.json({ success: true })
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось удалить настройку' })
  }
})

/**
 * @swagger
 * /vacation/day-rules/{id}:
 *   delete:
 *     tags: [Vacation]
 *     summary: Удалить настройку дней отпуска
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Настройка удалена
 */
router.delete('/day-rules/:id', authenticateToken, authorizeRoles('hr', 'admin'), async (req, res) => {
  try {
    const orgId = currentOrgId(req)
    const result = await query(
      'DELETE FROM vacation_day_rules WHERE id = $1 AND organization_id = $2 RETURNING *',
      [req.params.id, orgId]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Настройка не найдена' })
    res.json({ success: true })
  } catch (error) {
    res.locals.errorCause = error
    res.status(500).json({ error: 'Не удалось удалить настройку' })
  }
})

export { computeVacationDates, VacationValidationError }
export default router
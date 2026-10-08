import ExcelJS from 'exceljs'
import PizZip from 'pizzip'
import { query } from '../config/database.js'
import { computeTravel } from './travel.js'

export const fio = "concat_ws(' ', u.last_name, u.first_name, NULLIF(u.middle_name, ''))"

export const employeesCte = `employees AS (
  SELECT u.id, ${fio} AS name, u.position, u.hire_date, u.travel_available_from, d.id AS department_id, d.name AS department
  FROM users u
  JOIN user_organizations uo ON uo.user_id = u.id AND uo.org_id = $1 AND uo.is_active
  LEFT JOIN departments d ON d.id = u.department_id
  WHERE u.status <> 'inactive' AND u.is_test = false
    AND (cardinality($2::int[]) = 0 OR u.department_id = ANY($2::int[]))
)`

const STATUS_LABELS = {
  on_approval: 'На согласовании',
  approved: 'Согласовано',
  rejected: 'Отклонено',
  cancelled_by_employee: 'Отменено работником',
  cancelled_by_manager: 'Отменено руководителем',
}

export const iso = (v) => (v ? (typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10)) : null)
export const ruDate = (v) => (v ? iso(v).split('-').reverse().join('.') : '')
export const daysBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000))

export const col = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra })
export const sum = (rows, key) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0)
export const count = (rows, fn) => rows.filter(fn).length
export const median = (values) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}
export const kpi = (label, value, tone = 'default', hint) => ({ label, value, tone, ...(hint ? { hint } : {}) })
export const totalsOf = (rows, keys) => Object.fromEntries(keys.map((k) => [k, sum(rows, k)]))

async function balances({ orgId, departmentIds, year }) {
  const rows = (await query(
    `WITH ${employeesCte}
     SELECT e.name, e.department, e.position,
       vb.total_days, vb.used_days, vb.reserved_days, vb.available_days,
       COALESCE((SELECT SUM(days) FROM leave_adjustments la WHERE la.user_id = e.id AND la.organization_id = $1 AND la.kind = 'vacation' AND la.year = $3), 0)::int AS adjusted
     FROM employees e
     LEFT JOIN vacation_balances vb ON vb.user_id = e.id AND vb.organization_id = $1 AND vb.year = $3
     ORDER BY e.department NULLS LAST, e.name`,
    [orgId, departmentIds, year]
  )).rows
  const out = rows.map((r) => ({
    ...r,
    department: r.department || '—',
    position: r.position || '',
    total_days: r.total_days ?? 0,
    used_days: r.used_days ?? 0,
    reserved_days: r.reserved_days ?? 0,
    available_days: r.available_days ?? 0,
    _tone: { available_days: (r.available_days ?? 0) === 0 ? 'muted' : (r.available_days ?? 0) >= 28 ? 'warning' : undefined },
  }))
  const totals = totalsOf(out, ['total_days', 'adjusted', 'used_days', 'reserved_days', 'available_days'])
  return {
    title: `Остатки отпусков на ${year} год`,
    primary: 'available_days',
    columns: [col('name', 'ФИО'), col('department', 'Отдел'), col('position', 'Должность'), col('total_days', 'Положено', 'number'), col('adjusted', 'Начислено вручную', 'number'), col('used_days', 'Использовано', 'number'), col('reserved_days', 'На согласовании', 'number'), col('available_days', 'Доступно', 'number')],
    rows: out,
    totals,
    summary: [
      kpi('Сотрудников', out.length),
      kpi('Положено дней', totals.total_days),
      kpi('Использовано', totals.used_days, 'success', totals.total_days ? `${Math.round((totals.used_days / totals.total_days) * 100)}% от положенного` : undefined),
      kpi('Осталось', totals.available_days, 'info', `${count(out, (r) => r.available_days >= 28)} сотр. с остатком от 28 дней`),
    ],
  }
}

async function unused({ orgId, departmentIds, year, months }) {
  const rows = (await query(
    `WITH ${employeesCte}
     SELECT e.name, e.department, e.hire_date, vb.available_days,
       (SELECT MAX(vr.end_date) FROM vacation_requests vr
         JOIN request_statuses rs ON rs.id = vr.status_id JOIN vacation_types vt ON vt.id = vr.vacation_type_id
         WHERE vr.user_id = e.id AND vr.organization_id = $1 AND rs.code = 'approved' AND vt.code = 'annual_paid' AND vr.end_date <= CURRENT_DATE) AS last_end
     FROM employees e
     LEFT JOIN vacation_balances vb ON vb.user_id = e.id AND vb.organization_id = $1 AND vb.year = $3`,
    [orgId, departmentIds, year]
  )).rows
  const today = new Date()
  const out = rows
    .map((r) => {
      const since = r.last_end || r.hire_date
      const monthsWithout = since ? Math.floor(daysBetween(since, today) / 30.44) : null
      return {
        name: r.name,
        department: r.department || '—',
        last_vacation: r.last_end ? ruDate(r.last_end) : 'не было',
        months_without: monthsWithout,
        available_days: r.available_days ?? 0,
      }
    })
    .filter((r) => r.months_without === null || r.months_without >= months)
    .sort((a, b) => (b.months_without ?? 0) - (a.months_without ?? 0) || b.available_days - a.available_days)
  for (const r of out) {
    r._tone = {
      months_without: r.months_without >= 12 ? 'danger' : 'warning',
      last_vacation: r.last_vacation === 'не было' ? 'danger' : undefined,
    }
  }
  return {
    title: `Без ежегодного отпуска ${months} мес. и дольше`,
    primary: 'months_without',
    columns: [col('name', 'ФИО'), col('department', 'Отдел'), col('last_vacation', 'Последний отпуск окончен', 'badge'), col('months_without', 'Месяцев без отпуска', 'number'), col('available_days', `Доступно дней (${year})`, 'number')],
    rows: out,
    totals: totalsOf(out, ['available_days']),
    summary: [
      kpi('Сотрудников', out.length, out.length ? 'warning' : 'success'),
      kpi('Больше года без отпуска', count(out, (r) => r.months_without >= 12), 'danger'),
      kpi('Ни разу не были в отпуске', count(out, (r) => r.last_vacation === 'не было'), 'danger'),
      kpi('Накоплено дней', sum(out, 'available_days'), 'info'),
    ],
  }
}

async function plan({ orgId, departmentIds, year }) {
  const rows = (await query(
    `WITH ${employeesCte}
     SELECT e.name, e.department, COALESCE(vb.total_days, 0) AS total_days,
       COALESCE(SUM(vr.duration) FILTER (WHERE rs.code = 'approved'), 0)::int AS approved,
       COALESCE(SUM(vr.duration) FILTER (WHERE rs.code = 'on_approval'), 0)::int AS pending,
       COALESCE(MAX(vr.duration) FILTER (WHERE rs.code IN ('approved', 'on_approval')), 0)::int AS longest
     FROM employees e
     LEFT JOIN vacation_balances vb ON vb.user_id = e.id AND vb.organization_id = $1 AND vb.year = $3
     LEFT JOIN vacation_requests vr ON vr.user_id = e.id AND vr.organization_id = $1 AND EXTRACT(YEAR FROM vr.start_date) = $3
       AND vr.vacation_type_id IN (SELECT id FROM vacation_types WHERE code = 'annual_paid')
     LEFT JOIN request_statuses rs ON rs.id = vr.status_id
     GROUP BY e.id, e.name, e.department, vb.total_days
     ORDER BY e.department NULLS LAST, e.name`,
    [orgId, departmentIds, year]
  )).rows
  return {
    title: `Распределение ежегодного отпуска на ${year} год`,
    primary: 'unplanned',
    columns: [col('name', 'ФИО'), col('department', 'Отдел'), col('total_days', 'Положено', 'number'), col('approved', 'Согласовано', 'number'), col('pending', 'На согласовании', 'number'), col('unplanned', 'Не распределено', 'number'), col('longest', 'Самая длинная часть', 'number'), col('part14', 'Часть ≥ 14 дней', 'badge')],
    ...(() => {
      const out = rows.map((r) => {
        const unplanned = Math.max(0, r.total_days - r.approved - r.pending)
        return {
          ...r,
          department: r.department || '—',
          unplanned,
          part14: r.longest >= 14 ? 'есть' : 'нет',
          _tone: { part14: r.longest >= 14 ? 'success' : 'danger', unplanned: unplanned > 0 ? 'warning' : 'success' },
        }
      })
      return {
        rows: out,
        totals: totalsOf(out, ['total_days', 'approved', 'pending', 'unplanned']),
        summary: [
          kpi('Распределили полностью', count(out, (r) => r.unplanned === 0), 'success', `из ${out.length}`),
          kpi('Не распределено дней', sum(out, 'unplanned'), 'warning'),
          kpi('Без части ≥ 14 дней', count(out, (r) => r.part14 === 'нет'), 'danger', 'ст. 125 ТК РФ'),
          kpi('На согласовании', sum(out, 'pending'), 'info', 'дней'),
        ],
      }
    })(),
  }
}

async function overlaps({ orgId, departmentIds, year }) {
  const rows = (await query(
    `WITH ${employeesCte},
     weeks AS (SELECT gs::date AS week_start FROM generate_series(date_trunc('week', make_date($3, 1, 4))::date, make_date($3, 12, 31), interval '7 days') gs),
     headcount AS (SELECT department_id, COUNT(*)::int AS total FROM employees GROUP BY department_id)
     SELECT w.week_start, e.department_id, MAX(e.department) AS department, MAX(h.total) AS total,
       COUNT(DISTINCT e.id)::int AS absent, string_agg(DISTINCT e.name, ', ') AS names
     FROM weeks w
     JOIN vacation_requests vr ON vr.organization_id = $1 AND vr.start_date <= w.week_start + 6 AND vr.end_date >= w.week_start
     JOIN request_statuses rs ON rs.id = vr.status_id AND rs.code = 'approved'
     JOIN employees e ON e.id = vr.user_id
     LEFT JOIN headcount h ON h.department_id IS NOT DISTINCT FROM e.department_id
     GROUP BY w.week_start, e.department_id
     ORDER BY w.week_start, department`,
    [orgId, departmentIds, year]
  )).rows
  return {
    title: `Одновременные отсутствия по неделям, ${year}`,
    primary: 'share',
    columns: [col('week', 'Неделя'), col('department', 'Отдел'), col('absent', 'Отсутствуют', 'number'), col('total', 'Всего в отделе', 'number'), col('share', 'Доля', 'percent'), col('names', 'Кто', 'text', { wide: true })],
    ...(() => {
      const out = rows.map((r) => {
        const share = r.total ? Math.round((r.absent / r.total) * 100) : 0
        return {
          week: `${ruDate(r.week_start)} — ${ruDate(new Date(new Date(iso(r.week_start)).getTime() + 6 * 86400000))}`,
          department: r.department || '—',
          absent: r.absent,
          total: r.total,
          share,
          names: r.names,
          _tone: { share: share >= 50 ? 'danger' : share >= 30 ? 'warning' : 'success' },
        }
      })
      const peak = out.reduce((best, r) => (!best || r.absent > best.absent ? r : best), null)
      return {
        rows: out,
        summary: [
          kpi('Пиковая неделя', peak ? `${peak.absent} чел.` : '—', 'info', peak ? `${peak.week}, ${peak.department}` : undefined),
          kpi('Недель с долей ≥ 30%', count(out, (r) => r.share >= 30), 'warning'),
          kpi('Недель с долей ≥ 50%', count(out, (r) => r.share >= 50), 'danger'),
        ],
      }
    })(),
  }
}

async function approvals({ orgId, departmentIds, year }) {
  const rows = (await query(
    `WITH ${employeesCte}
     SELECT e.name, e.department, vt.name AS type, vr.start_date, vr.end_date, vr.created_at, vr.reviewed_at, rs.code AS status,
       concat_ws(' ', a.last_name, a.first_name) AS approver
     FROM vacation_requests vr
     JOIN employees e ON e.id = vr.user_id
     JOIN request_statuses rs ON rs.id = vr.status_id
     JOIN vacation_types vt ON vt.id = vr.vacation_type_id
     LEFT JOIN users a ON a.id = COALESCE(vr.reviewed_by, vr.approver_id)
     WHERE vr.organization_id = $1 AND EXTRACT(YEAR FROM vr.created_at) = $3 AND rs.code IN ('on_approval', 'approved', 'rejected')
     ORDER BY vr.created_at DESC`,
    [orgId, departmentIds, year]
  )).rows
  const now = new Date()
  const STATUS_TONE = { approved: 'success', rejected: 'danger', on_approval: 'warning' }
  return {
    title: `Сроки согласования заявлений, поданных в ${year} году`,
    primary: 'wait_days',
    columns: [col('name', 'ФИО'), col('department', 'Отдел'), col('type', 'Вид'), col('period', 'Даты'), col('created', 'Подано'), col('decided', 'Решение'), col('status', 'Статус', 'badge'), col('wait_days', 'Дней на согласовании', 'number'), col('approver', 'Согласующий')],
    ...(() => {
      const out = rows.map((r) => {
        const wait = daysBetween(r.created_at, r.status === 'on_approval' || !r.reviewed_at ? now : r.reviewed_at)
        return {
          name: r.name,
          department: r.department || '—',
          type: r.type,
          period: `${ruDate(r.start_date)} — ${ruDate(r.end_date)}`,
          created: ruDate(r.created_at),
          decided: r.status === 'on_approval' ? '' : ruDate(r.reviewed_at),
          status: STATUS_LABELS[r.status] || r.status,
          wait_days: wait,
          approver: r.approver || '',
          _tone: { status: STATUS_TONE[r.status], wait_days: wait > 14 ? 'danger' : wait > 7 ? 'warning' : undefined },
        }
      }).sort((a, b) => b.wait_days - a.wait_days)
      const decided = out.filter((r) => r.decided)
      return {
        rows: out,
        summary: [
          kpi('Заявлений', out.length),
          kpi('Ждут решения', count(out, (r) => !r.decided), 'warning'),
          kpi('Медианный срок', `${median(decided.map((r) => r.wait_days))} дн.`, 'info', 'для рассмотренных'),
          kpi('Дольше 7 дней', count(out, (r) => r.wait_days > 7), 'danger'),
        ],
      }
    })(),
  }
}

async function changes({ orgId, departmentIds, year }) {
  const rows = (await query(
    `WITH ${employeesCte}
     SELECT e.name, e.department, rs.code AS status, vr.start_date, vr.end_date, vr.transfer_reason, vr.cancellation_reason, vr.updated_at, vr.created_at,
       src.start_date AS from_start, src.end_date AS from_end
     FROM vacation_requests vr
     JOIN employees e ON e.id = vr.user_id
     JOIN request_statuses rs ON rs.id = vr.status_id
     LEFT JOIN vacation_requests src ON src.id = vr.transferred_from_id
     WHERE vr.organization_id = $1 AND EXTRACT(YEAR FROM COALESCE(src.start_date, vr.start_date)) = $3
       AND (vr.transferred_from_id IS NOT NULL OR rs.code IN ('cancelled_by_employee', 'cancelled_by_manager'))
     ORDER BY COALESCE(vr.updated_at, vr.created_at) DESC`,
    [orgId, departmentIds, year]
  )).rows
  return {
    title: `Переносы и отмены отпусков, ${year}`,
    columns: [col('name', 'ФИО'), col('department', 'Отдел'), col('kind', 'Что произошло', 'badge'), col('original', 'Исходные даты'), col('updated', 'Новые даты'), col('reason', 'Причина', 'text', { wide: true }), col('status', 'Статус'), col('date', 'Дата')],
    ...withChangesSummary(rows.map((r) => {
      const transfer = !!r.from_start
      return {
        name: r.name,
        department: r.department || '—',
        kind: transfer ? 'Перенос' : STATUS_LABELS[r.status],
        original: transfer ? `${ruDate(r.from_start)} — ${ruDate(r.from_end)}` : `${ruDate(r.start_date)} — ${ruDate(r.end_date)}`,
        updated: transfer ? `${ruDate(r.start_date)} — ${ruDate(r.end_date)}` : '',
        reason: (transfer ? r.transfer_reason : r.cancellation_reason) || '',
        status: STATUS_LABELS[r.status] || r.status,
        date: ruDate(transfer ? r.created_at : r.updated_at),
        _tone: { kind: transfer ? 'info' : 'warning' },
      }
    })),
  }
}

function withChangesSummary(out) {
  return {
    rows: out,
    summary: [
      kpi('Переносов', count(out, (r) => r.kind === 'Перенос'), 'info'),
      kpi('Отменено работником', count(out, (r) => r.kind === STATUS_LABELS.cancelled_by_employee), 'warning'),
      kpi('Отменено руководителем', count(out, (r) => r.kind === STATUS_LABELS.cancelled_by_manager), 'danger'),
      kpi('Без указания причины', count(out, (r) => !r.reason), 'default'),
    ],
  }
}

async function dayOffs({ orgId, departmentIds }) {
  const rows = (await query(
    `WITH ${employeesCte}
     SELECT e.name, e.department,
       COALESCE((SELECT SUM(days) FROM leave_adjustments la WHERE la.user_id = e.id AND la.organization_id = $1 AND la.kind = 'day_off'), 0)::int AS granted,
       COALESCE(SUM(vr.duration) FILTER (WHERE rs.code = 'approved'), 0)::int AS used,
       COALESCE(SUM(vr.duration) FILTER (WHERE rs.code = 'on_approval'), 0)::int AS pending
     FROM employees e
     LEFT JOIN vacation_requests vr ON vr.user_id = e.id AND vr.organization_id = $1
       AND vr.vacation_type_id IN (SELECT id FROM vacation_types WHERE code = 'day_off')
     LEFT JOIN request_statuses rs ON rs.id = vr.status_id
     GROUP BY e.id, e.name, e.department
     ORDER BY e.department NULLS LAST, e.name`,
    [orgId, departmentIds]
  )).rows
  return {
    title: 'Отгулы',
    primary: 'available',
    columns: [col('name', 'ФИО'), col('department', 'Отдел'), col('granted', 'Начислено', 'number'), col('used', 'Использовано', 'number'), col('pending', 'На согласовании', 'number'), col('available', 'Остаток', 'number')],
    ...(() => {
      const out = rows
        .map((r) => ({ ...r, department: r.department || '—', available: r.granted - r.used - r.pending, _tone: { available: r.granted - r.used - r.pending < 0 ? 'danger' : undefined } }))
        .filter((r) => r.granted || r.used || r.pending)
      const totals = totalsOf(out, ['granted', 'used', 'pending', 'available'])
      return {
        rows: out,
        totals,
        summary: [
          kpi('Сотрудников с отгулами', out.length),
          kpi('Начислено', totals.granted, 'info', 'дней'),
          kpi('Использовано', totals.used, 'success', 'дней'),
          kpi('Остаток', totals.available, totals.available < 0 ? 'danger' : 'default', 'дней'),
        ],
      }
    })(),
  }
}

async function travel({ orgId, departmentIds }) {
  const employees = (await query(`WITH ${employeesCte} SELECT * FROM employees ORDER BY department NULLS LAST, name`, [orgId, departmentIds])).rows
  const requests = (await query(
    `SELECT vr.id, vr.user_id, vr.start_date, vr.end_date, vr.travel_destination, rs.code AS status
     FROM vacation_requests vr JOIN request_statuses rs ON rs.id = vr.status_id
     WHERE vr.organization_id = $1 AND vr.has_travel AND rs.code IN ('approved', 'on_approval')`,
    [orgId]
  )).rows
  const byUser = new Map()
  for (const r of requests) byUser.set(r.user_id, [...(byUser.get(r.user_id) || []), r])
  const today = iso(new Date())
  return {
    title: 'Проезд к месту отпуска',
    columns: [col('name', 'ФИО'), col('department', 'Отдел'), col('period', 'Текущий период'), col('state', 'Состояние', 'badge'), col('available_from', 'Доступен с'), col('available_until', 'Действует до'), col('last_used', 'Последний проезд')],
    ...withTravelSummary(employees.map((e) => {
      const s = computeTravel({ hireDate: e.hire_date, override: e.travel_available_from, requests: byUser.get(e.id) || [] })
      const current = s.periods.find((p) => p.current)
      const lastUsed = s.periods.flatMap((p) => p.used).at(-1)
      const state = !e.hire_date ? 'нет даты найма'
        : s.pending ? 'заявка на согласовании'
        : s.date_ok ? 'доступен, не использован'
        : current?.used.length ? 'использован в текущем периоде'
        : s.next_available_date > today ? 'право ещё не наступило' : '—'
      return {
        name: e.name,
        department: e.department || '—',
        period: current ? `${ruDate(current.start)} — ${ruDate(current.end)}` : '',
        state,
        available_from: ruDate(s.next_available_date),
        available_until: s.date_ok ? ruDate(s.available_until) : '',
        last_used: lastUsed ? `${ruDate(lastUsed.start_date)}${lastUsed.destination ? `, ${lastUsed.destination}` : ''}` : '',
        _tone: { state: TRAVEL_TONE[state] },
      }
    })),
  }
}

const TRAVEL_TONE = {
  'доступен, не использован': 'success',
  'заявка на согласовании': 'warning',
  'использован в текущем периоде': 'info',
  'право ещё не наступило': 'muted',
  'нет даты найма': 'danger',
}

function withTravelSummary(out) {
  return {
    rows: out,
    summary: [
      kpi('Доступен, не использован', count(out, (r) => r.state === 'доступен, не использован'), 'success'),
      kpi('Использован в периоде', count(out, (r) => r.state === 'использован в текущем периоде'), 'info'),
      kpi('На согласовании', count(out, (r) => r.state === 'заявка на согласовании'), 'warning'),
      kpi('Право ещё не наступило', count(out, (r) => r.state === 'право ещё не наступило'), 'muted'),
    ],
  }
}

export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const parseRu = (v) => {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(String(v || ''))
  return m ? { day: +m[1], month: +m[2], year: +m[3] } : null
}

export function byDepartment(rows, keys, { limit = 10 } = {}) {
  const groups = new Map()
  for (const r of rows) {
    const d = r.department || '—'
    const g = groups.get(d) || Object.fromEntries(keys.map((k) => [k, 0]))
    for (const k of keys) g[k] += Math.max(0, Number(r[k]) || 0)
    groups.set(d, g)
  }
  const sorted = [...groups.entries()].sort((a, b) => keys.reduce((t, k) => t + b[1][k], 0) - keys.reduce((t, k) => t + a[1][k], 0))
  const head = sorted.slice(0, limit)
  const tail = sorted.slice(limit)
  if (tail.length) head.push([`Остальные (${tail.length})`, Object.fromEntries(keys.map((k) => [k, tail.reduce((t, [, g]) => t + g[k], 0)]))])
  return { categories: head.map(([d]) => d), values: (k) => head.map(([, g]) => g[k]) }
}

function departmentStack(report, title, parts, unit = 'дн.') {
  const d = byDepartment(report.rows, parts.map(([k]) => k))
  return { id: 'departments', type: 'hbar-stacked', title, unit, categories: d.categories, series: parts.map(([k, name]) => ({ name, values: d.values(k) })) }
}

const CHART_BUILDERS = {
  balances: (r) => [departmentStack(r, 'Дни отпуска по отделам', [['used_days', 'Использовано'], ['reserved_days', 'На согласовании'], ['available_days', 'Доступно']])],
  plan: (r) => [departmentStack(r, 'Распределение по отделам', [['approved', 'Согласовано'], ['pending', 'На согласовании'], ['unplanned', 'Не распределено']])],
  'day-offs': (r) => [departmentStack(r, 'Отгулы по отделам', [['used', 'Использовано'], ['pending', 'На согласовании'], ['available', 'Остаток']])],
  unused: (r, { months }) => {
    const buckets = [
      [`${months}–11 мес.`, (x) => x.last_vacation !== 'не было' && x.months_without < 12],
      ['1–2 года', (x) => x.last_vacation !== 'не было' && x.months_without >= 12 && x.months_without < 24],
      ['больше 2 лет', (x) => x.last_vacation !== 'не было' && x.months_without >= 24],
      ['ни разу', (x) => x.last_vacation === 'не было'],
    ].filter(([, fn], i) => i > 0 || months < 12 || r.rows.some(fn))
    return [{ id: 'buckets', type: 'column', title: 'Сколько времени без ежегодного отпуска', unit: 'чел.', categories: buckets.map(([n]) => n), series: [{ name: 'Сотрудников', values: buckets.map(([, fn]) => count(r.rows, fn)) }] }]
  },
  overlaps: (r, { year }) => {
    const totals = new Map()
    for (const row of r.rows) totals.set(row.week, (totals.get(row.week) || 0) + row.absent)
    const jan4 = new Date(Date.UTC(year, 0, 4))
    let d = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000)
    const categories = []
    const values = []
    const lastDay = new Date(Date.UTC(year, 11, 31))
    while (d <= lastDay) {
      const end = new Date(d.getTime() + 6 * 86400000)
      const key = `${ruDate(d)} — ${ruDate(end)}`
      categories.push(ruDate(d).slice(0, 5))
      values.push(totals.get(key) || 0)
      d = new Date(d.getTime() + 7 * 86400000)
    }
    return [{ id: 'weeks', type: 'area', title: 'Сотрудников в отпуске по неделям', unit: 'чел.', categories, series: [{ name: 'В отпуске', values }] }]
  },
  approvals: (r) => {
    const buckets = [['0–3 дня', 0, 3], ['4–7 дней', 4, 7], ['8–14 дней', 8, 14], ['15–30 дней', 15, 30], ['больше 30', 31, Infinity]]
    const inB = (x, lo, hi) => x.wait_days >= lo && x.wait_days <= hi
    return [{
      id: 'wait', type: 'column', stacked: true, title: 'Сколько заявления ждали решения', unit: 'заявл.',
      categories: buckets.map(([n]) => n),
      series: [
        { name: 'Рассмотрено', values: buckets.map(([, lo, hi]) => count(r.rows, (x) => !!x.decided && inB(x, lo, hi))) },
        { name: 'Ждут решения', values: buckets.map(([, lo, hi]) => count(r.rows, (x) => !x.decided && inB(x, lo, hi))) },
      ],
    }]
  },
  changes: (r) => {
    const month = (x) => (parseRu(x.original)?.month ?? 0) - 1
    return [{
      id: 'months', type: 'column', stacked: true, title: 'Переносы и отмены по месяцам начала отпуска', unit: 'шт.',
      categories: MONTHS_SHORT,
      series: [
        { name: 'Переносы', values: MONTHS_SHORT.map((_, m) => count(r.rows, (x) => x.kind === 'Перенос' && month(x) === m)) },
        { name: 'Отмены', values: MONTHS_SHORT.map((_, m) => count(r.rows, (x) => x.kind !== 'Перенос' && month(x) === m)) },
      ],
    }]
  },
  travel: (r) => {
    const states = [['доступен, не использован', 'Доступен'], ['использован в текущем периоде', 'Использован'], ['заявка на согласовании', 'На согласовании'], ['право ещё не наступило', 'Право не наступило']]
    const other = count(r.rows, (x) => !states.some(([k]) => k === x.state))
    const items = [...states.map(([k, name]) => ({ name, values: [count(r.rows, (x) => x.state === k)] })), ...(other ? [{ name: 'Прочее', values: [other] }] : [])]
    return [{ id: 'states', type: 'share', title: 'Состояние права на проезд', unit: 'чел.', categories: ['Сотрудники'], series: items }]
  },
}

export function withCharts(report, builder, args) {
  report.charts = (builder?.(report, args) || [])
    .map((c) => ({ ...c, series: c.series.map((sr, i) => ({ ...sr, color: sr.color ?? (sr.name === 'Прочее' ? -1 : i) })).filter((sr) => sr.values.some((v) => v > 0)) }))
    .filter((c) => c.series.length > 0)
  return report
}

export async function buildReport(type, args) {
  return withCharts(await VACATION_REPORTS[type](args), CHART_BUILDERS[type], args)
}

export const VACATION_REPORTS = {
  balances,
  unused,
  plan,
  overlaps,
  approvals,
  changes,
  'day-offs': dayOffs,
  travel,
}

const FONT = 'Calibri'
const PALETTE = {
  success: { strong: 'FF12B76A', light: 'FFECFDF3', text: 'FF027A48' },
  warning: { strong: 'FFF79009', light: 'FFFFFAEB', text: 'FFB54708' },
  danger: { strong: 'FFF04438', light: 'FFFEF3F2', text: 'FFB42318' },
  info: { strong: 'FF2E90FA', light: 'FFEFF8FF', text: 'FF175CD3' },
  muted: { strong: 'FF98A2B3', light: 'FFF2F4F7', text: 'FF475467' },
  default: { strong: 'FF6172F3', light: 'FFEEF4FF', text: 'FF3538CD' },
}
const INK = 'FF101828'
const SUBTLE = 'FF667085'
const NAVY = 'FF0B1F3A'
const NAVY_2 = 'FF15335C'
const LINE = 'FFEAECF0'
const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const font = (o = {}) => ({ name: FONT, size: 11, color: { argb: INK }, ...o })
const thin = (argb = LINE) => ({ style: 'thin', color: { argb } })
const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 10
  const b = Math.abs(n) % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many
}

function banner(sheet, from, to, title, subtitle, fillTo = to) {
  sheet.mergeCells(1, from, 1, to)
  sheet.mergeCells(2, from, 2, to)
  sheet.getRow(1).height = 42
  sheet.getRow(2).height = 22
  for (let c = 1; c <= fillTo; c++) {
    sheet.getRow(1).getCell(c).fill = solid(NAVY)
    sheet.getRow(2).getCell(c).fill = solid(NAVY_2)
  }
  const t = sheet.getRow(1).getCell(from)
  t.value = title
  t.font = font({ size: 20, bold: true, color: { argb: 'FFFFFFFF' } })
  t.alignment = { vertical: 'middle', indent: 1 }
  const st = sheet.getRow(2).getCell(from)
  st.value = subtitle
  st.font = font({ size: 10, color: { argb: 'FFB9C6DA' } })
  st.alignment = { vertical: 'middle', indent: 1 }
}

function sectionTitle(sheet, row, col, text, toCol) {
  const r = sheet.getRow(row)
  r.height = 24
  if (toCol > col) sheet.mergeCells(row, col, row, toCol)
  const cell = r.getCell(col)
  cell.value = text
  cell.font = font({ size: 13, bold: true, color: { argb: NAVY } })
  cell.alignment = { vertical: 'bottom' }
  for (let c = col; c <= toCol; c++) r.getCell(c).border = { bottom: { style: 'medium', color: { argb: NAVY } } }
}

function link(cell, text, target) {
  cell.value = { text, hyperlink: `#'${target}'!A1` }
  cell.font = font({ size: 10, bold: true, color: { argb: 'FF175CD3' }, underline: true })
}

function addDataTable(sheet, { name, startRow, columns, rows, totals, numFmts, toneFor, primary }) {
  const table = sheet.addTable({
    name,
    ref: `A${startRow}`,
    headerRow: true,
    totalsRow: !!totals,
    style: { theme: 'TableStyleLight1', showRowStripes: true },
    columns: columns.map((c, i) => ({
      name: c.label,
      filterButton: true,
      ...(totals ? (i === 0 ? { totalsRowLabel: 'Итого' } : totals.includes(c.key) ? { totalsRowFunction: 'sum' } : { totalsRowFunction: 'none' }) : {}),
    })),
    rows,
  })
  const header = sheet.getRow(startRow)
  header.height = 34
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1)
    cell.fill = solid(NAVY)
    cell.font = font({ bold: true, size: 10, color: { argb: 'FFFFFFFF' } })
    cell.alignment = { vertical: 'middle', horizontal: c.type === 'number' || c.type === 'percent' ? 'right' : 'left', wrapText: true, indent: 1 }
    cell.border = { right: thin('FF24456F') }
  })
  const last = startRow + rows.length
  for (let r = startRow + 1; r <= last; r++) {
    const row = sheet.getRow(r)
    row.height = 20
    const zebra = (r - startRow) % 2 === 0
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.font = font({ size: 10, bold: c.key === 'name' })
      cell.fill = solid(zebra ? 'FFF8FAFC' : 'FFFFFFFF')
      cell.border = { bottom: thin() }
      cell.alignment = { vertical: 'middle', indent: 1, wrapText: !!c.wide, horizontal: c.type === 'number' || c.type === 'percent' ? 'right' : 'left' }
      if (numFmts[c.key]) cell.numFmt = numFmts[c.key]
      const tone = toneFor(r - startRow - 1, c.key)
      if (tone) {
        const p = PALETTE[tone] || PALETTE.default
        if (c.type === 'badge') {
          cell.fill = solid(p.light)
          cell.font = font({ size: 10, bold: true, color: { argb: p.text } })
          cell.alignment = { ...cell.alignment, horizontal: 'center' }
        } else {
          cell.font = font({ size: 10, bold: true, color: { argb: p.text } })
        }
      }
    })
  }
  if (totals) {
    const row = sheet.getRow(last + 1)
    row.height = 24
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.fill = solid('FFE4EBF5')
      cell.font = font({ size: 10, bold: true, color: { argb: NAVY } })
      cell.border = { top: { style: 'medium', color: { argb: NAVY } } }
      cell.alignment = { vertical: 'middle', indent: 1, horizontal: c.type === 'number' ? 'right' : 'left' }
      if (numFmts[c.key]) cell.numFmt = numFmts[c.key]
    })
  }
  if (rows.length) {
    columns.forEach((c, i) => {
      const ref = `${colLetter(i + 1)}${startRow + 1}:${colLetter(i + 1)}${last}`
      if (c.key === primary && c.type === 'number') {
        sheet.addConditionalFormatting({ ref, rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF7EA6F8' }, gradient: true }] })
      }
      if (c.type === 'percent') {
        sheet.addConditionalFormatting({ ref, rules: [{ type: 'colorScale', priority: 2, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 0.3 }, { type: 'num', value: 0.6 }], color: [{ argb: 'FFD1FADF' }, { argb: 'FFFEF0C7' }, { argb: 'FFFECDCA' }] }] })
      }
    })
  }
  return { table, lastRow: last + (totals ? 1 : 0) }
}

const xmlEscape = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const XL_SERIES = ['2A78D6', 'EB6834', '1BAF7A', 'EDA100', 'E87BA4']
const XL_OTHER = 'A3A29C'
const xlColor = (i) => (i < 0 ? XL_OTHER : XL_SERIES[i % XL_SERIES.length])

function chartXml({ kind, grouping = 'clustered', sheetName, catRef, categories, series, labels = true }) {
  const txt = (sz, rgb, b = false) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b ? 1 : 0}"><a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="ru-RU"/></a:p></c:txPr>`
  const ref = (range) => xmlEscape(`'${sheetName.replace(/'/g, "''")}'!${range}`)
  const cat = `<c:cat><c:strRef><c:f>${ref(catRef)}</c:f><c:strCache><c:ptCount val="${categories.length}"/>${categories.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`
  const val = (sr) => `<c:val><c:numRef><c:f>${ref(sr.valRef)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${sr.values.length}"/>${sr.values.map((v, i) => `<c:pt idx="${i}"><c:v>${Number(v) || 0}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>`
  const dLbls = (pos) => `<c:dLbls><c:numFmt formatCode="#,##0;;" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txt(900, pos === 'ctr' ? 'FFFFFF' : '101828', true)}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
  const noLbls = '<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>'
  const stacked = grouping === 'stacked' || grouping === 'percentStacked'
  const lblPos = !labels ? null : stacked ? (series.length > 1 ? 'ctr' : 'inBase') : 'outEnd'
  const ser = series.map((sr, i) => {
    const color = sr.color
    const fill = kind === 'area'
      ? `<c:spPr><a:solidFill><a:srgbClr val="${color}"><a:alpha val="18000"/></a:srgbClr></a:solidFill><a:ln w="25400" cap="rnd"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:round/></a:ln></c:spPr>`
      : `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>`
    const labelsXml = kind === 'area' || !labels ? noLbls : dLbls(lblPos === 'inBase' ? 'ctr' : lblPos)
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${xmlEscape(sr.name)}</c:v></c:tx>${fill}${kind === 'area' ? '' : '<c:invertIfNegative val="0"/>'}${labelsXml}${cat}${val(sr)}</c:ser>`
  }).join('')
  const axIds = '<c:axId val="50010001"/><c:axId val="50010002"/>'
  const plot = kind === 'area'
    ? `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}${axIds}</c:areaChart>`
    : `<c:barChart><c:barDir val="${kind === 'bar' ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${ser}<c:gapWidth val="${kind === 'bar' ? 55 : 80}"/>${stacked ? '<c:overlap val="100"/>' : ''}${axIds}</c:barChart>`
  const horizontal = kind === 'bar'
  const catAx = `<c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D0D5DD"/></a:solidFill></a:ln></c:spPr>${txt(900, '475467')}<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/>${kind === 'area' ? '<c:tickLblSkip val="4"/>' : ''}<c:noMultiLvlLbl val="0"/></c:catAx>`
  const valAx = `<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/>${grouping === 'percentStacked' ? '<c:max val="1"/>' : ''}</c:scaling><c:delete val="${horizontal ? 1 : 0}"/><c:axPos val="${horizontal ? 't' : 'l'}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="EAECF0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${grouping === 'percentStacked' ? '0%' : '#,##0'}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txt(900, '667085')}<c:crossAx val="50010001"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="${kind === 'area' ? 'midCat' : 'between'}"/></c:valAx>`
  const legend = series.length > 1 ? `<c:legend><c:legendPos val="t"/><c:overlay val="0"/>${txt(900, '475467')}</c:legend>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>${plot}${catAx}${valAx}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="EAECF0"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="ru-RU"/></a:p></c:txPr></c:chartSpace>`
}

function injectCharts(buffer, drawings) {
  const zip = new PizZip(buffer)
  let chartNo = 0
  const overrides = []
  drawings.forEach(({ sheetIndex, charts }, d) => {
    const drawingNo = d + 1
    const anchors = []
    const drawingRels = []
    charts.forEach(({ anchor, xml }, k) => {
      chartNo += 1
      zip.file(`xl/charts/chart${chartNo}.xml`, xml)
      overrides.push(`<Override PartName="/xl/charts/chart${chartNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`)
      drawingRels.push(`<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartNo}.xml"/>`)
      anchors.push(`<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${anchor.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchor.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${anchor.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchor.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="Диаграмма ${k + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`)
    })
    zip.file(`xl/drawings/drawing${drawingNo}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join('')}</xdr:wsDr>`)
    zip.file(`xl/drawings/_rels/drawing${drawingNo}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRels.join('')}</Relationships>`)
    overrides.push(`<Override PartName="/xl/drawings/drawing${drawingNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`)
    const sheetPath = `xl/worksheets/sheet${sheetIndex}.xml`
    const relsPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`
    const rel = `<Relationship Id="rIdWcDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingNo}.xml"/>`
    const rels = zip.file(relsPath)?.asText()
    zip.file(relsPath, rels
      ? rels.replace('</Relationships>', `${rel}</Relationships>`)
      : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`)
    let sheet = zip.file(sheetPath).asText()
    const at = Math.min(...['<legacyDrawing', '<legacyDrawingHF', '<picture', '<oleObjects', '<controls', '<webPublishItems', '<tableParts', '<extLst', '</worksheet>'].map((t) => sheet.indexOf(t)).filter((i) => i >= 0))
    sheet = `${sheet.slice(0, at)}<drawing r:id="rIdWcDrawing"/>${sheet.slice(at)}`
    zip.file(sheetPath, sheet)
  })
  zip.file('[Content_Types].xml', zip.file('[Content_Types].xml').asText().replace('</Types>', `${overrides.join('')}</Types>`))
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

const CANVAS = 'FFF4F6FA'

export async function sendReportXlsx(res, report, fileName, meta = {}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Worker Cabinet'
  workbook.created = new Date()
  workbook.title = report.title
  const cols = report.columns
  const generated = new Date().toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' })
  const subtitle = [meta.organization, meta.filters, `сформирован ${generated}`].filter(Boolean).join('   •   ')
  const numFmts = Object.fromEntries(cols.map((c) => [c.key, c.type === 'number' ? '#,##0' : c.type === 'percent' ? '0%' : null]).filter(([, f]) => f))
  const values = (r) => cols.map((c) => (c.type === 'percent' ? (typeof r[c.key] === 'number' ? r[c.key] / 100 : null) : r[c.key] ?? ''))
  const totalKeys = report.totals ? Object.keys(report.totals) : null
  const primaryCol = cols.find((c) => c.key === report.primary)
  const hasDepartment = cols.some((c) => c.key === 'department')
  const isDanger = (r) => Object.values(r._tone || {}).includes('danger')
  const dangerRows = report.rows.filter(isDanger)
  const pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.5, header: 0.2, footer: 0.25 } }
  const footer = { oddFooter: `&L&8${report.title}&R&8Стр. &P из &N` }

  const sumKeys = (totalKeys || []).filter((k) => cols.some((c) => c.key === k))
  let deptRows = []
  let deptCols = []
  let chartKey = null
  if (hasDepartment) {
    const groups = new Map()
    for (const r of report.rows) {
      const key = r.department || '—'
      const g = groups.get(key) || { department: key, count: 0, danger: 0, ...Object.fromEntries(sumKeys.map((k) => [k, 0])) }
      g.count += 1
      if (isDanger(r)) g.danger += 1
      for (const k of sumKeys) g[k] += Number(r[k]) || 0
      groups.set(key, g)
    }
    deptCols = [
      { key: 'department', label: 'Отдел', type: 'text' },
      { key: 'count', label: 'Записей', type: 'number' },
      ...sumKeys.map((k) => ({ key: k, label: cols.find((c) => c.key === k).label, type: 'number' })),
      { key: 'danger', label: 'Требуют внимания', type: 'number' },
    ]
    chartKey = dangerRows.length ? 'danger' : sumKeys.includes(report.primary) ? report.primary : 'count'
    deptRows = [...groups.values()].sort((a, b) => b[chartKey] - a[chartKey] || b.count - a.count)
  }
  const chartRows = deptRows.slice(0, 10).filter((g) => g[chartKey] > 0)

  const dash = workbook.addWorksheet('Сводка', { views: [{ showGridLines: false, zoomScale: 100 }], pageSetup: { ...pageSetup, fitToHeight: 1 }, headerFooter: footer, properties: { tabColor: { argb: NAVY } } })
  const reportCharts = report.charts || []
  const chartsSheet = reportCharts.length ? workbook.addWorksheet('Графики', { views: [{ showGridLines: false }], pageSetup: { ...pageSetup, fitToHeight: 0 }, headerFooter: footer, properties: { tabColor: { argb: 'FFEB6834' } } }) : null
  const dataSheet = workbook.addWorksheet('Данные', { views: [{ showGridLines: false }], pageSetup, headerFooter: footer, properties: { tabColor: { argb: 'FF2E90FA' } } })
  const deptSheet = hasDepartment ? workbook.addWorksheet('По отделам', { views: [{ showGridLines: false }], pageSetup, headerFooter: footer, properties: { tabColor: { argb: 'FF12B76A' } } }) : null

  const DASH_COLS = [3, 15, 15, 15, 2, 15, 15, 15, 2, 15, 15, 15, 2, 15, 15, 15, 3]
  DASH_COLS.forEach((w, i) => { dash.getColumn(i + 1).width = w })
  const lastDashCol = DASH_COLS.length - 1
  banner(dash, 2, lastDashCol, report.title, subtitle, DASH_COLS.length)

  let row = 4
  const cards = (report.summary || []).slice(0, 4)
  if (cards.length) {
    sectionTitle(dash, row, 2, 'Ключевые показатели', lastDashCol)
    row += 2
    const cardRows = [5, 20, 44, 18, 10]
    cardRows.forEach((h, i) => { dash.getRow(row + i).height = h })
    cards.forEach((k, i) => {
      const from = 2 + i * 4
      const to = from + 2
      const p = PALETTE[k.tone] || PALETTE.default
      for (let r = row; r < row + cardRows.length; r++) {
        for (let c = from; c <= to; c++) {
          const cell = dash.getRow(r).getCell(c)
          cell.fill = solid(r === row ? p.strong : 'FFFFFFFF')
          cell.border = {
            ...(c === from ? { left: thin('FFE4E7EC') } : {}),
            ...(c === to ? { right: thin('FFE4E7EC') } : {}),
            ...(r === row + cardRows.length - 1 ? { bottom: thin('FFE4E7EC') } : {}),
          }
        }
      }
      const put = (offset, value, f, opts = {}) => {
        dash.mergeCells(row + offset, from, row + offset, to)
        const cell = dash.getRow(row + offset).getCell(from)
        cell.value = value
        cell.font = font(f)
        cell.alignment = { vertical: opts.v || 'middle', horizontal: 'left', indent: 1 }
        if (typeof value === 'number') cell.numFmt = '#,##0'
      }
      put(1, k.label.toUpperCase(), { size: 9, bold: true, color: { argb: SUBTLE } }, { v: 'bottom' })
      put(2, k.value, { size: 30, bold: true, color: { argb: p.text } })
      put(3, k.hint || ' ', { size: 9, color: { argb: 'FF98A2B3' } }, { v: 'top' })
    })
    row += cardRows.length + 2
  }

  let chartAnchor = null
  if (chartRows.length) {
    const metricLabel = chartKey === 'danger' ? 'Требуют внимания' : chartKey === 'count' ? 'Записей' : deptCols.find((c) => c.key === chartKey)?.label
    sectionTitle(dash, row, 2, `По отделам — ${metricLabel.toLowerCase()}`, lastDashCol)
    row += 1
    const height = Math.max(8, chartRows.length * 2 + 3)
    for (let r = row; r < row + height; r++) dash.getRow(r).height = 18
    chartAnchor = { fromCol: 1, fromRow: row, toCol: lastDashCol, toRow: row + height - 1, metricLabel }
    row += height + 1
  }

  if (dangerRows.length) {
    const top = [...dangerRows].sort((a, b) => (Number(b[report.primary]) || 0) - (Number(a[report.primary]) || 0)).slice(0, 10)
    sectionTitle(dash, row, 2, `Требуют внимания — ${dangerRows.length.toLocaleString('ru-RU')} ${plural(dangerRows.length, 'запись', 'записи', 'записей')}`, lastDashCol)
    row += 1
    const metricCol = primaryCol || cols.find((c) => c.type === 'number')
    const badgeCol = cols.find((c) => c.type === 'badge' && top.some((r) => r._tone?.[c.key] === 'danger'))
    const spans = [[2, 7, 'Сотрудник'], [8, 12, 'Отдел'], [13, 14, metricCol?.label || ''], [15, 16, badgeCol?.label || '']]
    const head = dash.getRow(row)
    head.height = 24
    spans.forEach(([f, t, label]) => {
      dash.mergeCells(row, f, row, t)
      const cell = head.getCell(f)
      cell.value = label.toUpperCase()
      cell.font = font({ size: 8, bold: true, color: { argb: SUBTLE } })
      cell.alignment = { vertical: 'middle', indent: 1, wrapText: true, horizontal: f === 13 ? 'right' : f === 15 ? 'center' : 'left' }
      for (let c = f; c <= t; c++) {
        head.getCell(c).fill = solid('FFF9FAFB')
        head.getCell(c).border = { bottom: thin('FFE4E7EC'), top: thin('FFE4E7EC') }
      }
    })
    top.forEach((r, i) => {
      const n = row + 1 + i
      const line = dash.getRow(n)
      line.height = 22
      const cellsData = [r.name ?? r.week ?? '', r.department ?? '', metricCol ? r[metricCol.key] : '', badgeCol ? r[badgeCol.key] : '']
      spans.forEach(([f, t], j) => {
        dash.mergeCells(n, f, n, t)
        const cell = line.getCell(f)
        cell.value = metricCol?.type === 'percent' && j === 2 && typeof cellsData[j] === 'number' ? cellsData[j] / 100 : cellsData[j]
        cell.font = font({ size: 10, bold: j === 0, color: { argb: j === 1 ? SUBTLE : INK } })
        cell.alignment = { vertical: 'middle', indent: 1, horizontal: j === 2 ? 'right' : 'left' }
        for (let c = f; c <= t; c++) {
          line.getCell(c).fill = solid('FFFFFFFF')
          line.getCell(c).border = { bottom: thin() }
        }
        if (j === 2) {
          cell.numFmt = metricCol?.type === 'percent' ? '0%' : '#,##0'
          cell.font = font({ size: 11, bold: true, color: { argb: PALETTE.danger.text } })
        }
        if (j === 3 && badgeCol) {
          const p = PALETTE[r._tone?.[badgeCol.key]] || PALETTE.muted
          cell.font = font({ size: 9, bold: true, color: { argb: p.text } })
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          for (let c = f; c <= t; c++) line.getCell(c).fill = solid(p.light)
        }
      })
    })
    row += top.length + 1
    if (dangerRows.length > top.length) {
      const more = dash.getRow(row).getCell(2)
      more.value = `и ещё ${(dangerRows.length - top.length).toLocaleString('ru-RU')} — на листе «Данные»`
      more.font = font({ size: 9, italic: true, color: { argb: SUBTLE } })
      row += 1
    }
    row += 1
  }

  sectionTitle(dash, row, 2, 'Листы книги', lastDashCol)
  row += 1
  const sheetsInfo = [
    ...(chartsSheet ? [['Графики', `${reportCharts.length} ${plural(reportCharts.length, 'график', 'графика', 'графиков')} с данными`]] : []),
    ['Данные', `${report.rows.length.toLocaleString('ru-RU')} ${plural(report.rows.length, 'строка', 'строки', 'строк')} с фильтрами, итогами и гистограммами`],
    ...(deptSheet ? [['По отделам', 'свод по каждому отделу']] : []),
  ]
  for (const [name, desc] of sheetsInfo) {
    dash.getRow(row).height = 22
    link(dash.getRow(row).getCell(2), `→  ${name}`, name)
    dash.mergeCells(row, 2, row, 4)
    dash.mergeCells(row, 5, row, lastDashCol)
    const d = dash.getRow(row).getCell(5)
    d.value = desc
    d.font = font({ size: 10, color: { argb: SUBTLE } })
    d.alignment = { vertical: 'middle' }
    dash.getRow(row).getCell(2).alignment = { vertical: 'middle' }
    row += 1
  }
  const footRow = dash.getRow(row + 1)
  dash.mergeCells(row + 1, 2, row + 1, lastDashCol)
  footRow.getCell(2).value = 'Сформировано в Worker Cabinet'
  footRow.getCell(2).font = font({ size: 8, color: { argb: 'FF98A2B3' } })
  footRow.getCell(2).alignment = { horizontal: 'right' }
  for (let r = 3; r <= row + 2; r++) {
    for (let c = 1; c <= DASH_COLS.length; c++) {
      const cell = dash.getRow(r).getCell(c)
      if (!cell.fill) cell.fill = solid(CANVAS)
    }
  }

  cols.forEach((c, i) => {
    const sample = [c.label, ...report.rows.slice(0, 400).map((r) => String(r[c.key] ?? ''))]
    const longest = Math.max(...sample.map((v) => v.length))
    dataSheet.getColumn(i + 1).width = c.wide ? Math.min(70, Math.max(30, longest * 0.55)) : Math.min(44, Math.max(c.type === 'number' || c.type === 'percent' ? 13 : 14, longest + 4))
  })
  banner(dataSheet, 1, cols.length, report.title, subtitle)
  link(dataSheet.getRow(3).getCell(1), '←  Сводка', 'Сводка')
  dataSheet.getRow(3).height = 20
  const dataStart = 4
  addDataTable(dataSheet, {
    name: 'ReportData',
    startRow: dataStart,
    columns: cols,
    rows: report.rows.length ? report.rows.map(values) : [cols.map(() => '')],
    totals: totalKeys && report.rows.length ? totalKeys : null,
    numFmts,
    toneFor: (i, key) => report.rows[i]?._tone?.[key],
    primary: report.primary,
  })
  dataSheet.views = [{ state: 'frozen', ySplit: dataStart, xSplit: 1, showGridLines: false }]
  dataSheet.pageSetup.printTitlesRow = `${dataStart}:${dataStart}`

  if (deptSheet) {
    deptCols.forEach((c, i) => { deptSheet.getColumn(i + 1).width = i === 0 ? 38 : 18 })
    banner(deptSheet, 1, deptCols.length, `${report.title}: по отделам`, subtitle)
    link(deptSheet.getRow(3).getCell(1), '←  Сводка', 'Сводка')
    addDataTable(deptSheet, {
      name: 'ByDepartment',
      startRow: 4,
      columns: deptCols,
      rows: deptRows.length ? deptRows.map((g) => deptCols.map((c) => g[c.key])) : [deptCols.map(() => '')],
      totals: deptRows.length ? deptCols.slice(1).map((c) => c.key) : null,
      numFmts: Object.fromEntries(deptCols.slice(1).map((c) => [c.key, '#,##0'])),
      toneFor: (i, key) => (key === 'danger' && deptRows[i]?.danger > 0 ? 'danger' : undefined),
      primary: null,
    })
    if (deptRows.length) {
      deptCols.slice(1).forEach((c, idx) => {
        const letter = colLetter(idx + 2)
        deptSheet.addConditionalFormatting({
          ref: `${letter}5:${letter}${4 + deptRows.length}`,
          rules: [{ type: 'dataBar', priority: idx + 1, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: c.key === 'danger' ? 'FFFDA29B' : 'FF7EA6F8' }, gradient: true }],
        })
      })
    }
    deptSheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 1, showGridLines: false }]
    deptSheet.pageSetup.printTitlesRow = '4:4'
  }

  const drawings = []
  if (chartsSheet) {
    const KIND = { 'hbar-stacked': ['bar', 'stacked'], column: ['col', 'clustered'], area: ['area', 'standard'], share: ['bar', 'percentStacked'] }
    const maxSeries = Math.max(...reportCharts.map((c) => c.series.length))
    const dataCols = 1 + maxSeries
    chartsSheet.getColumn(1).width = 30
    for (let c = 2; c <= dataCols; c++) chartsSheet.getColumn(c).width = 15
    chartsSheet.getColumn(dataCols + 1).width = 3
    for (let c = dataCols + 2; c <= dataCols + 13; c++) chartsSheet.getColumn(c).width = 10
    const totalCols = dataCols + 13
    banner(chartsSheet, 1, totalCols, `${report.title}: графики`, subtitle)
    link(chartsSheet.getRow(3).getCell(1), '←  Сводка', 'Сводка')
    let r = 5
    const placed = []
    for (const c of reportCharts) {
      const [kind, grouping] = KIND[c.type]
      const stacked = c.type === 'column' && c.stacked
      sectionTitle(chartsSheet, r, 1, c.title, totalCols)
      r += 1
      const headRow = r
      const head = chartsSheet.getRow(headRow)
      head.height = 22
      ;['', ...c.series.map((sr) => sr.name)].forEach((label, i) => {
        const cell = head.getCell(i + 1)
        cell.value = i === 0 ? (c.type === 'area' ? 'Неделя' : c.type === 'share' ? '' : 'Категория') : label
        cell.font = font({ size: 9, bold: true, color: { argb: 'FFFFFFFF' } })
        cell.fill = solid(NAVY)
        cell.alignment = { vertical: 'middle', indent: 1, horizontal: i === 0 ? 'left' : 'right', wrapText: true }
      })
      c.series.forEach((sr, i) => {
        const swatch = chartsSheet.getRow(headRow).getCell(i + 2)
        swatch.border = { bottom: { style: 'thick', color: { argb: `FF${xlColor(sr.color)}` } } }
      })
      c.categories.forEach((cat, k) => {
        const row = chartsSheet.getRow(headRow + 1 + k)
        row.height = 16
        row.getCell(1).value = cat
        row.getCell(1).font = font({ size: 9, color: { argb: INK } })
        row.getCell(1).alignment = { indent: 1 }
        c.series.forEach((sr, i) => {
          const cell = row.getCell(i + 2)
          cell.value = sr.values[k]
          cell.numFmt = '#,##0'
          cell.font = font({ size: 9 })
        })
        for (let col = 1; col <= 1 + c.series.length; col++) {
          row.getCell(col).border = { bottom: thin() }
          if (k % 2) row.getCell(col).fill = solid('FFF8FAFC')
        }
      })
      const first = headRow + 1
      const last = headRow + c.categories.length
      const height = Math.max(16, c.type === 'share' ? 8 : c.type === 'hbar-stacked' ? c.categories.length * 2 + 4 : 18)
      placed.push({
        anchor: { fromCol: dataCols + 1, fromRow: headRow - 1, toCol: totalCols, toRow: headRow - 1 + height },
        xml: chartXml({
          kind,
          grouping: stacked ? 'stacked' : grouping,
          sheetName: 'Графики',
          catRef: `$A$${first}:$A$${last}`,
          categories: c.categories,
          labels: c.type !== 'area' && c.series.length === 1 && c.categories.length <= 14,
          series: c.series.map((sr, i) => ({ name: sr.name, color: xlColor(sr.color), values: sr.values, valRef: `$${colLetter(i + 2)}$${first}:$${colLetter(i + 2)}$${last}` })),
        }),
      })
      r = Math.max(last, headRow + height) + 3
    }
    drawings.push({ sheetIndex: 2, charts: placed })
  }
  if (chartAnchor) {
    const valueCol = colLetter(deptCols.findIndex((c) => c.key === chartKey) + 1)
    const last = 4 + chartRows.length
    drawings.unshift({
      sheetIndex: 1,
      charts: [{
        anchor: chartAnchor,
        xml: chartXml({
          kind: 'bar',
          sheetName: 'По отделам',
          catRef: `$A$5:$A$${last}`,
          categories: chartRows.map((g) => g.department),
          series: [{ name: chartAnchor.metricLabel, color: chartKey === 'danger' ? 'F04438' : '2E90FA', values: chartRows.map((g) => g[chartKey]), valRef: `$${valueCol}$5:$${valueCol}$${last}` }],
        }),
      }],
    })
  }
  let buffer = await workbook.xlsx.writeBuffer()
  if (drawings.length) buffer = injectCharts(buffer, drawings)

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`)
  res.end(Buffer.from(buffer))
}

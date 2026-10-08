import { query } from '../config/database.js'
import { MONTHS_SHORT, byDepartment, col, count, daysBetween, employeesCte, fio, iso, kpi, median, ruDate, sum, totalsOf, withCharts } from './vacationReports.js'

const years = (from, to = new Date()) => Math.round((daysBetween(from, to) / 365.25) * 10) / 10
const avg = (values) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0)
const yearsLabel = (v) => `${String(v).replace('.', ',')} г.`

const TENURE_BUCKETS = [
  ['до 1 года', 0, 1, 'info'],
  ['1–3 года', 1, 3, undefined],
  ['3–5 лет', 3, 5, undefined],
  ['5 лет и больше', 5, Infinity, 'success'],
]
const bucketOf = (t) => TENURE_BUCKETS.find(([, lo, hi]) => t >= lo && t < hi)

async function headcount({ orgId, departmentIds, year }) {
  const rows = (await query(
    `WITH ${employeesCte}
     SELECT e.department, e.hire_date, concat_ws(' ', m.last_name, m.first_name) AS manager
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN users m ON m.id = d.manager_id`,
    [orgId, departmentIds]
  )).rows
  const groups = new Map()
  for (const r of rows) {
    const key = r.department || 'Без отдела'
    const g = groups.get(key) || { department: key, manager: r.manager || '', headcount: 0, tenures: [], hired: 0 }
    g.headcount += 1
    if (r.hire_date) g.tenures.push(years(r.hire_date))
    if (r.hire_date && Number(iso(r.hire_date).slice(0, 4)) === year) g.hired += 1
    groups.set(key, g)
  }
  const out = [...groups.values()]
    .map((g) => ({
      department: g.department,
      manager: g.manager,
      headcount: g.headcount,
      hired: g.hired,
      avg_tenure: avg(g.tenures),
      _tone: { manager: g.manager ? undefined : 'danger', department: g.department === 'Без отдела' ? 'warning' : undefined },
    }))
    .sort((a, b) => b.headcount - a.headcount)
  for (const r of out) if (!r.manager) r.manager = 'не назначен'
  const all = rows.filter((r) => r.hire_date).map((r) => years(r.hire_date))
  return {
    title: 'Численность по отделам',
    primary: 'headcount',
    columns: [col('department', 'Отдел'), col('manager', 'Руководитель', 'badge'), col('headcount', 'Сотрудников', 'number'), col('hired', `Принято в ${year}`, 'number'), col('avg_tenure', 'Средний стаж, лет', 'number')],
    rows: out,
    totals: totalsOf(out, ['headcount', 'hired']),
    summary: [
      kpi('Сотрудников', rows.length),
      kpi('Отделов', count(out, (r) => r.department !== 'Без отдела'), 'info', `в среднем ${String(avg(out.filter((r) => r.department !== 'Без отдела').map((r) => r.headcount))).replace('.', ',')} чел.`),
      kpi('Средний стаж', yearsLabel(avg(all)), 'success'),
      kpi('Без отдела', count(rows, (r) => !r.department), count(rows, (r) => !r.department) ? 'warning' : 'default'),
    ],
  }
}

async function hires({ orgId, departmentIds, year }) {
  const rows = (await query(
    `WITH ${employeesCte}
     SELECT e.name, e.department, e.position, e.hire_date FROM employees e
     WHERE EXTRACT(YEAR FROM e.hire_date)::int IN ($3::int, $3::int - 1)
     ORDER BY e.hire_date DESC`,
    [orgId, departmentIds, year]
  )).rows
  const thisYear = rows.filter((r) => Number(iso(r.hire_date).slice(0, 4)) === year)
  const prev = rows.length - thisYear.length
  const out = thisYear.map((r) => ({
    name: r.name,
    department: r.department || '—',
    position: r.position || '',
    hire_date: ruDate(r.hire_date),
    days: daysBetween(r.hire_date, new Date()),
    _tone: { days: daysBetween(r.hire_date, new Date()) < 90 ? 'info' : undefined },
  }))
  const byMonth = MONTHS_SHORT.map((_, m) => count(thisYear, (r) => Number(iso(r.hire_date).slice(5, 7)) - 1 === m))
  const peak = byMonth.indexOf(Math.max(...byMonth))
  const delta = thisYear.length - prev
  return {
    title: `Приём на работу в ${year} году`,
    primary: 'days',
    columns: [col('name', 'ФИО'), col('department', 'Отдел'), col('position', 'Должность'), col('hire_date', 'Дата приёма'), col('days', 'Дней в организации', 'number')],
    rows: out,
    _prevByMonth: MONTHS_SHORT.map((_, m) => count(rows, (r) => Number(iso(r.hire_date).slice(0, 4)) === year - 1 && Number(iso(r.hire_date).slice(5, 7)) - 1 === m)),
    _byMonth: byMonth,
    summary: [
      kpi('Принято за год', thisYear.length, 'success'),
      kpi(`В ${year - 1} году`, prev, 'default', prev ? `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} к прошлому году` : undefined),
      kpi('Больше всего в месяце', thisYear.length ? MONTHS_SHORT[peak] : '—', 'info', thisYear.length ? `${byMonth[peak]} чел.` : undefined),
      kpi('На испытательном сроке', count(out, (r) => r.days < 90), 'warning', 'меньше 3 месяцев'),
    ],
  }
}

async function tenure({ orgId, departmentIds }) {
  const rows = (await query(`WITH ${employeesCte} SELECT e.name, e.department, e.position, e.hire_date FROM employees e WHERE e.hire_date IS NOT NULL ORDER BY e.hire_date`, [orgId, departmentIds])).rows
  const out = rows.map((r) => {
    const t = years(r.hire_date)
    const b = bucketOf(t)
    return { name: r.name, department: r.department || '—', position: r.position || '', hire_date: ruDate(r.hire_date), tenure: t, group: b[0], _tone: { group: b[3] } }
  })
  const values = out.map((r) => r.tenure)
  return {
    title: 'Стаж в организации',
    primary: 'tenure',
    columns: [col('name', 'ФИО'), col('department', 'Отдел'), col('position', 'Должность'), col('hire_date', 'Дата приёма'), col('tenure', 'Стаж, лет', 'number'), col('group', 'Группа', 'badge')],
    rows: out,
    summary: [
      kpi('Средний стаж', yearsLabel(avg(values)), 'info'),
      kpi('Медиана', yearsLabel(median(values.map((v) => Math.round(v * 10))) / 10), 'default'),
      kpi('Работают меньше года', count(out, (r) => r.tenure < 1), 'warning'),
      kpi('5 лет и больше', count(out, (r) => r.tenure >= 5), 'success'),
    ],
  }
}

async function positions({ orgId, departmentIds }) {
  const rows = (await query(`WITH ${employeesCte} SELECT e.position, e.department, e.hire_date FROM employees e`, [orgId, departmentIds])).rows
  const groups = new Map()
  for (const r of rows) {
    const key = r.position || 'Не указана'
    const g = groups.get(key) || { position: key, headcount: 0, departments: new Set(), tenures: [] }
    g.headcount += 1
    if (r.department) g.departments.add(r.department)
    if (r.hire_date) g.tenures.push(years(r.hire_date))
    groups.set(key, g)
  }
  const out = [...groups.values()]
    .map((g) => ({ position: g.position, headcount: g.headcount, departments: g.departments.size, avg_tenure: avg(g.tenures), _tone: { position: g.position === 'Не указана' ? 'warning' : undefined } }))
    .sort((a, b) => b.headcount - a.headcount)
  const top = out[0]
  return {
    title: 'Должности',
    primary: 'headcount',
    columns: [col('position', 'Должность'), col('headcount', 'Сотрудников', 'number'), col('departments', 'В отделах', 'number'), col('avg_tenure', 'Средний стаж, лет', 'number')],
    rows: out,
    totals: totalsOf(out, ['headcount']),
    summary: [
      kpi('Должностей', out.length, 'info'),
      kpi('Самая массовая', top ? top.headcount : 0, 'default', top?.position),
      kpi('Единичные', count(out, (r) => r.headcount === 1), 'muted', 'по одному сотруднику'),
      kpi('Без должности', out.find((r) => r.position === 'Не указана')?.headcount || 0, 'warning'),
    ],
  }
}

async function structure({ orgId, departmentIds }) {
  const rows = (await query(
    `SELECT d.id, d.name, p.name AS parent, ${fio.replace(/u\./g, 'm.')} AS manager,
       (SELECT COUNT(*) FROM users u JOIN user_organizations uo ON uo.user_id = u.id AND uo.org_id = $1 AND uo.is_active
         WHERE u.department_id = d.id AND u.status <> 'inactive' AND u.is_test = false)::int AS headcount,
       (SELECT COUNT(*) FROM departments c WHERE c.parent_id = d.id)::int AS children
     FROM departments d
     LEFT JOIN departments p ON p.id = d.parent_id
     LEFT JOIN users m ON m.id = d.manager_id
     WHERE d.organization_id = $1 AND COALESCE(d.is_test, false) = false
       AND (cardinality($2::int[]) = 0 OR d.id = ANY($2::int[]))
     ORDER BY d.name`,
    [orgId, departmentIds]
  )).rows
  const out = rows.map((r) => ({
    department: r.name,
    parent: r.parent || '—',
    manager: r.manager || 'не назначен',
    headcount: r.headcount,
    children: r.children,
    _tone: { manager: r.manager ? undefined : 'danger', headcount: r.headcount === 0 ? 'warning' : undefined },
  }))
  return {
    title: 'Структура организации',
    primary: 'headcount',
    columns: [col('department', 'Отдел'), col('parent', 'Входит в'), col('manager', 'Руководитель', 'badge'), col('headcount', 'Сотрудников', 'number'), col('children', 'Подотделов', 'number')],
    rows: out,
    totals: totalsOf(out, ['headcount']),
    summary: [
      kpi('Отделов', out.length, 'info'),
      kpi('Без руководителя', count(out, (r) => r.manager === 'не назначен'), 'danger'),
      kpi('Без сотрудников', count(out, (r) => r.headcount === 0), 'warning'),
      kpi('Средний размер', avg(out.filter((r) => r.headcount).map((r) => r.headcount)), 'default', 'чел. в отделе'),
    ],
  }
}

const ACTIVITY = [
  ['сегодня', 0, 1, 'success'],
  ['на этой неделе', 1, 7, 'success'],
  ['в этом месяце', 7, 30, 'info'],
  ['больше месяца назад', 30, Infinity, 'warning'],
]

async function activity({ orgId, departmentIds }) {
  const rows = (await query(`WITH ${employeesCte} SELECT e.name, e.department, e.position, u.last_seen_at FROM employees e JOIN users u ON u.id = e.id`, [orgId, departmentIds])).rows
  const now = new Date()
  const out = rows.map((r) => {
    const days = r.last_seen_at ? (now - new Date(r.last_seen_at)) / 86400000 : null
    const b = days === null ? ['никогда не заходил', 0, 0, 'danger'] : ACTIVITY.find(([, lo, hi]) => days >= lo && days < hi)
    return {
      name: r.name,
      department: r.department || '—',
      position: r.position || '',
      last_seen: r.last_seen_at ? new Date(r.last_seen_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '',
      days_ago: days === null ? null : Math.floor(days),
      group: b[0],
      _tone: { group: b[3] },
    }
  }).sort((a, b) => (b.days_ago ?? 1e9) - (a.days_ago ?? 1e9))
  const active30 = count(out, (r) => r.days_ago !== null && r.days_ago < 30)
  return {
    title: 'Активность в системе',
    primary: 'days_ago',
    columns: [col('name', 'ФИО'), col('department', 'Отдел'), col('position', 'Должность'), col('last_seen', 'Последний раз в системе'), col('days_ago', 'Дней назад', 'number'), col('group', 'Группа', 'badge')],
    rows: out,
    summary: [
      kpi('Заходили за месяц', active30, 'success', out.length ? `${Math.round((active30 / out.length) * 100)}% сотрудников` : undefined),
      kpi('Сегодня', count(out, (r) => r.days_ago !== null && r.days_ago < 1), 'info'),
      kpi('Больше месяца назад', count(out, (r) => r.days_ago !== null && r.days_ago >= 30), 'warning'),
      kpi('Ни разу не заходили', count(out, (r) => r.days_ago === null), 'danger'),
    ],
  }
}

const CHARTS = {
  headcount: (r) => {
    const d = byDepartment(r.rows, ['headcount'])
    return [{ id: 'departments', type: 'hbar-stacked', title: 'Сотрудников по отделам', unit: 'чел.', categories: d.categories, series: [{ name: 'Сотрудников', values: d.values('headcount') }] }]
  },
  hires: (r, { year }) => [{
    id: 'months', type: 'column', title: 'Приём по месяцам', unit: 'чел.', categories: MONTHS_SHORT,
    series: [{ name: String(year), values: r._byMonth }, { name: String(year - 1), values: r._prevByMonth, color: -1 }],
  }],
  tenure: (r) => [{ id: 'buckets', type: 'column', title: 'Распределение по стажу', unit: 'чел.', categories: TENURE_BUCKETS.map(([n]) => n), series: [{ name: 'Сотрудников', values: TENURE_BUCKETS.map(([n]) => count(r.rows, (x) => x.group === n)) }] }],
  positions: (r) => {
    const top = r.rows.slice(0, 10)
    const rest = r.rows.slice(10)
    const cats = [...top.map((x) => x.position), ...(rest.length ? [`Остальные (${rest.length})`] : [])]
    const vals = [...top.map((x) => x.headcount), ...(rest.length ? [sum(rest, 'headcount')] : [])]
    return [{ id: 'positions', type: 'hbar-stacked', title: 'Самые массовые должности', unit: 'чел.', categories: cats, series: [{ name: 'Сотрудников', values: vals }] }]
  },
  activity: (r) => {
    const groups = [...ACTIVITY.map(([n]) => n), 'никогда не заходил']
    return [{ id: 'activity', type: 'share', title: 'Когда сотрудники последний раз были в системе', unit: 'чел.', categories: ['Сотрудники'], series: groups.map((n) => ({ name: n[0].toUpperCase() + n.slice(1), values: [count(r.rows, (x) => x.group === n)] })) }]
  },
}

export const STAFF_REPORTS = { headcount, hires, tenure, positions, structure, activity }
export const STAFF_YEARLY = ['headcount', 'hires']

export async function buildStaffReport(type, args) {
  const report = withCharts(await STAFF_REPORTS[type](args), CHARTS[type], args)
  delete report._byMonth
  delete report._prevByMonth
  return report
}

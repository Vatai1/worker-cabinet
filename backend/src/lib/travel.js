import { query } from '../config/database.js'

const PERIOD_YEARS = 2
const FIRST_RIGHT_MONTHS = 6

const toDate = (value) => {
  if (!value) return null
  const s = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
  return new Date(`${s}T00:00:00Z`)
}

const iso = (d) => d.toISOString().slice(0, 10)

const addYears = (d, years) => {
  const r = new Date(d)
  r.setUTCFullYear(r.getUTCFullYear() + years)
  if (r.getUTCDate() !== d.getUTCDate()) r.setUTCDate(0)
  return r
}

const addDays = (d, days) => new Date(d.getTime() + days * 86400000)

const addMonths = (d, months) => {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(d.getUTCDate(), lastDay))
  return r
}

export function periodIndex(hire, date) {
  let k = Math.max(0, Math.floor((date.getUTCFullYear() - hire.getUTCFullYear()) / PERIOD_YEARS) + 1)
  while (k > 0 && addYears(hire, k * PERIOD_YEARS) > date) k--
  return k
}

export function periodBounds(hire, k) {
  const start = addYears(hire, k * PERIOD_YEARS)
  return {
    start,
    end: addDays(addYears(hire, (k + 1) * PERIOD_YEARS), -1),
    eligibleFrom: k === 0 ? addMonths(hire, FIRST_RIGHT_MONTHS) : start,
  }
}

export function computeTravel({ hireDate, override, requests, today = new Date() }) {
  const hire = toDate(hireDate)
  const now = toDate(iso(today))
  const approved = requests.filter((r) => r.status === 'approved')
  const pending = requests.find((r) => r.status === 'on_approval') || null

  if (!hire) {
    const next = toDate(override)
    return {
      hire_date: null, periods: [], pending,
      override: override ? iso(toDate(override)) : null,
      next_available_date: next ? iso(next) : null,
      available_until: null,
      date_ok: !!next && next <= now,
    }
  }

  const currentK = periodIndex(hire, now)
  const lastUsedK = approved.reduce((max, r) => Math.max(max, periodIndex(hire, toDate(r.start_date))), -1)
  const maxK = Math.max(currentK, lastUsedK) + 1
  const periods = []
  for (let k = 0; k <= maxK; k++) {
    const { start, end, eligibleFrom } = periodBounds(hire, k)
    const used = approved.filter((r) => periodIndex(hire, toDate(r.start_date)) === k)
    periods.push({
      index: k,
      start: iso(start),
      end: iso(end),
      eligible_from: iso(eligibleFrom),
      current: k === currentK,
      used: used.map((r) => ({ id: r.id, start_date: iso(toDate(r.start_date)), end_date: iso(toDate(r.end_date)), destination: r.travel_destination })),
    })
  }

  let nextK = currentK
  while (periods[nextK]?.used.length) nextK++
  let next = periodBounds(hire, nextK).eligibleFrom
  const overrideDate = toDate(override)
  if (overrideDate) next = overrideDate
  const untilK = overrideDate ? periodIndex(hire, overrideDate) : nextK

  return {
    hire_date: iso(hire),
    periods,
    pending,
    override: overrideDate ? iso(overrideDate) : null,
    next_available_date: iso(next),
    available_until: iso(periodBounds(hire, untilK).end),
    date_ok: next <= now,
  }
}

export async function getTravelState(userId, orgId, { excludeRequestId = null, db = { query } } = {}) {
  const user = (await db.query('SELECT hire_date, travel_available_from FROM users WHERE id = $1', [userId])).rows[0]
  if (!user) return null
  const requests = (await db.query(
    `SELECT vr.id, vr.start_date, vr.end_date, vr.travel_destination, rs.code AS status
     FROM vacation_requests vr JOIN request_statuses rs ON rs.id = vr.status_id
     WHERE vr.user_id = $1 AND vr.has_travel AND rs.code IN ('approved', 'on_approval')
       AND ($2::int IS NULL OR vr.organization_id = $2) AND ($3::int IS NULL OR vr.id <> $3)
     ORDER BY vr.start_date`,
    [userId, orgId, excludeRequestId]
  )).rows
  const state = computeTravel({ hireDate: user.hire_date, override: user.travel_available_from, requests })
  return { ...state, available: state.date_ok && !state.pending }
}

export async function assertTravelAllowed(userId, orgId, opts = {}) {
  const state = await getTravelState(userId, orgId, opts)
  if (!state) return { ok: false, status: 404, error: 'Работник не найден' }
  if (state.pending) return { ok: false, status: 409, error: 'Уже есть заявка с проездом на согласовании' }
  if (!state.date_ok) {
    const d = state.next_available_date ? state.next_available_date.split('-').reverse().join('.') : null
    return { ok: false, status: 400, error: d ? `Проезд к месту отпуска будет доступен с ${d}` : 'Проезд к месту отпуска недоступен' }
  }
  return { ok: true }
}

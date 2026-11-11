import { query } from '../config/database.js'

const LAW_HOLIDAYS = ['01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08', '02-23', '03-08', '05-01', '05-09', '06-12', '11-04']

export async function getWorkingCalendar(from, to, db = { query }) {
  const { rows } = await db.query('SELECT day, kind FROM calendar_holidays WHERE day BETWEEN $1 AND $2', [from, to])
  const byDay = new Map(rows.map(r => [r.day, r.kind]))
  const { rows: years } = await db.query(
    'SELECT DISTINCT year FROM calendar_holidays WHERE year BETWEEN $1 AND $2',
    [Number(from.slice(0, 4)), Number(to.slice(0, 4))]
  )
  const loadedYears = new Set(years.map(r => r.year))
  const getKind = day => loadedYears.has(Number(day.slice(0, 4)))
    ? byDay.get(day)
    : LAW_HOLIDAYS.includes(day.slice(5)) ? 'holiday' : undefined

  return {
    isHoliday: day => getKind(day) === 'holiday',
    isNonWorking: day => {
      const kind = getKind(day)
      const weekday = new Date(day).getUTCDay()
      return kind === 'holiday' || kind === 'transfer' || ((weekday === 0 || weekday === 6) && kind !== 'shortened')
    },
  }
}

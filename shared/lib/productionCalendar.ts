import { useEffect, useState } from 'react'
import { apiGet } from '@/shared/lib/apiClient'

export type ProductionDayKind = 'holiday' | 'transfer' | 'shortened'

export interface ProductionDay {
  day: string
  kind: ProductionDayKind
  description: string | null
}

const cache = new Map<number, Promise<Map<string, ProductionDay>>>()

function loadYear(year: number) {
  let pending = cache.get(year)
  if (!pending) {
    pending = apiGet<{ days: ProductionDay[] }>(`/vacation/production-calendar?year=${year}`)
      .then((res) => new Map(res.days.map((d) => [d.day, d])))
      .catch(() => {
        cache.delete(year)
        return new Map<string, ProductionDay>()
      })
    cache.set(year, pending)
  }
  return pending
}

export function useProductionCalendar(year: number) {
  const [days, setDays] = useState<Map<string, ProductionDay> | null>(null)
  useEffect(() => {
    let active = true
    loadYear(year).then((map) => { if (active) setDays(map) })
    return () => { active = false }
  }, [year])
  return days
}

function isoDays(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(`${start}T12:00:00Z`)
  const last = new Date(`${end}T12:00:00Z`)
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return days
}

export function useVacationDuration(start?: string | null, end?: string | null) {
  const s = start?.slice(0, 10) ?? ''
  const e = end?.slice(0, 10) ?? ''
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(s) && /^\d{4}-\d{2}-\d{2}$/.test(e) && s <= e
  const startYear = valid ? Number(s.slice(0, 4)) : 0
  const endYear = valid ? Number(e.slice(0, 4)) : 0
  const [holidays, setHolidays] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!valid) return
    let active = true
    const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
    Promise.all(years.map(loadYear)).then((maps) => {
      if (!active) return
      const set = new Set<string>()
      for (const map of maps) for (const d of map.values()) if (d.kind === 'holiday') set.add(d.day)
      setHolidays(set)
    })
    return () => { active = false }
  }, [valid, startYear, endYear])

  if (!valid) return { calendarDays: 0, holidays: 0, countedDays: 0 }
  const days = isoDays(s, e)
  const holidayCount = days.filter((d) => holidays.has(d)).length
  return { calendarDays: days.length, holidays: holidayCount, countedDays: days.length - holidayCount }
}

export function pluralDays(n: number) {
  const a = n % 10
  const b = n % 100
  if (a === 1 && b !== 11) return 'день'
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'дня'
  return 'дней'
}

const LAW_HOLIDAYS = ['01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08', '02-23', '03-08', '05-01', '05-09', '06-12', '11-04']

function isNonWorking(dayIso: string, calendars: Map<number, Map<string, ProductionDay>>) {
  const year = Number(dayIso.slice(0, 4))
  const weekday = new Date(`${dayIso}T12:00:00Z`).getUTCDay()
  const weekend = weekday === 0 || weekday === 6
  const cal = calendars.get(year)
  if (cal && cal.size > 0) {
    const d = cal.get(dayIso)
    if (d?.kind === 'holiday' || d?.kind === 'transfer') return true
    if (d?.kind === 'shortened') return false
    return weekend
  }
  return weekend || LAW_HOLIDAYS.includes(dayIso.slice(5))
}

export function useReturnToWork(end?: string | null) {
  const e = end?.slice(0, 10) ?? ''
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(e)
  const year = valid ? Number(e.slice(0, 4)) : 0
  const [calendars, setCalendars] = useState<Map<number, Map<string, ProductionDay>> | null>(null)

  useEffect(() => {
    if (!valid) return
    let active = true
    Promise.all([loadYear(year), loadYear(year + 1)]).then(([a, b]) => {
      if (active) setCalendars(new Map([[year, a], [year + 1, b]]))
    })
    return () => { active = false }
  }, [valid, year])

  if (!valid) return null
  const cur = new Date(`${e}T12:00:00Z`)
  for (let i = 0; i < 60; i++) {
    cur.setUTCDate(cur.getUTCDate() + 1)
    const iso = cur.toISOString().slice(0, 10)
    if (!isNonWorking(iso, calendars ?? new Map())) return iso
  }
  return null
}

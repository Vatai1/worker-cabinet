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

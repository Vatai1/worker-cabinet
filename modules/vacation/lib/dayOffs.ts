import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '@/shared/lib/apiClient'

export interface DayOffSummary {
  granted: number
  used: number
  pending: number
  available: number
}

export interface LeaveAdjustment {
  id: number
  kind: 'vacation' | 'day_off'
  year: number | null
  days: number
  comment: string
  created_at: string
  created_by_name: string | null
}

export const DAY_OFF_HINT = 'Отгулы — не отпуск: они не привязаны к году, не расходуют дни отпуска и доступны всегда, даже когда подача заявок на отпуск закрыта. Считаются в рабочих днях.'

export function useLeaveAdjustments(userId?: string | number | null) {
  const [dayOffs, setDayOffs] = useState<DayOffSummary | null>(null)
  const [items, setItems] = useState<LeaveAdjustment[]>([])

  const reload = useCallback(async () => {
    try {
      const data = await apiGet<{ dayOffs: DayOffSummary; items: LeaveAdjustment[] }>(
        `/vacation/adjustments${userId ? `?userId=${userId}` : ''}`
      )
      setDayOffs(data.dayOffs)
      setItems(data.items)
    } catch {
      setDayOffs(null)
      setItems([])
    }
  }, [userId])

  useEffect(() => { reload() }, [reload])

  return { dayOffs, items, reload }
}

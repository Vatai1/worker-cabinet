import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'

interface Props {
  start: string
  end: string
  createdAt?: string
  status: 'approved' | 'on_approval'
}

const MS_PER_DAY = 86400000

function parseDate(s: string): Date {
  const p = s.split('T')[0].split('-')
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])))
}

function startOfToday(): Date {
  const n = new Date()
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY)
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

function daysWord(n: number): string {
  return plural(n, 'день', 'дня', 'дней')
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function fmt(d: Date, withYear: boolean): string {
  const s = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`
  return withYear ? `${s}.${d.getUTCFullYear()}` : s
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

const STATUS_BADGES = {
  approved: { label: 'Согласовано', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  on_approval: { label: 'На согласовании', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
} as const

export function PlannedVacationCard({ start, end, createdAt, status }: Props) {
  const [today, setToday] = useState(startOfToday)

  useEffect(() => {
    const t = setInterval(() => setToday(startOfToday()), 60000)
    return () => clearInterval(t)
  }, [])

  const startDate = parseDate(start)
  const endDate = parseDate(end)
  const createdDate = createdAt ? parseDate(createdAt) : null
  const duration = diffDays(endDate, startDate) + 1
  const before = today < startDate
  const during = !before && today <= endDate
  const badge = STATUS_BADGES[status]

  let progress = 0
  let labelElapsed = ''
  let labelRemaining = ''
  let countdown: React.ReactNode = null

  if (before) {
    const total = createdDate ? diffDays(startDate, createdDate) : 0
    const elapsed = createdDate ? diffDays(today, createdDate) : 0
    const remaining = diffDays(startDate, today)
    progress = createdDate && total > 0 ? clamp01(elapsed / total) * 100 : 0
    labelRemaining = `Осталось ${remaining} ${daysWord(remaining)}`
    countdown = <>Осталось <b className="font-bold text-foreground">{remaining}</b> {daysWord(remaining)} до начала отпуска</>
  } else if (during) {
    const totalV = diffDays(endDate, startDate) + 1
    const leftV = diffDays(endDate, today) + 1
    progress = clamp01(diffDays(today, startDate) / totalV) * 100
    labelRemaining = `До конца ${leftV} ${daysWord(leftV)}`
    countdown = <>Отпуск идёт, осталось <b className="font-bold text-foreground">{leftV}</b> {daysWord(leftV)}</>
  } else {
    progress = 100
    labelElapsed = `Завершён ${fmt(endDate, true)}`
    countdown = <>Отпуск завершён</>
  }
  return (
    <div className="w-full max-w-[520px] border border-border rounded-xl p-5 bg-card max-[560px]:p-4">
      <div className="flex items-center gap-3 mb-[18px]">
        <div className="w-10 h-10 rounded-[10px] bg-primary/10 flex items-center justify-center shrink-0">
          <CalendarDays className="w-5 h-5 text-primary" />
        </div>
        <div className="text-[15px] font-semibold">Ближайший отпуск</div>
        <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <div className="text-2xl font-bold tracking-tight leading-tight max-[560px]:text-[21px]">
        {fmt(startDate, false)}
        <span className="text-primary font-normal mx-1">→</span>
        {fmt(endDate, true)}
      </div>
      <div className="text-[13px] text-muted-foreground mt-1">
        {duration} {plural(duration, 'календарный', 'календарных', 'календарных')} {daysWord(duration)}
      </div>
      <div className="mt-[18px]">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-[width] duration-[400ms] ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{labelElapsed}</span>
          <span>{labelRemaining}</span>
        </div>
      </div>
      <div className="mt-3.5 text-sm text-muted-foreground">{countdown}</div>
    </div>
  )
}

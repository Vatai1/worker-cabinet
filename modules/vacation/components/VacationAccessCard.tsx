import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  Filter, Lock, Unlock, Loader2, Users, Server, Check, BarChart3, Shield,
  PenTool, Megaphone, Phone, Headphones, TrendingUp, Box, Code, Wallet, Scale,
  HelpCircle, X, ShieldAlert,
} from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { useDepartmentsStore } from '@/shared/store/departmentsStore'
import { getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { API_BASE_URL } from '@/shared/lib/api'
import { cn } from '@/shared/lib/utils'

interface Department {
  id: number
  name: string
  employee_count?: string | number
  vacation_requests_blocked?: boolean
}

function deptHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
  return ((h % 360) + 360) % 360
}

function hueStyle(hue: number): CSSProperties {
  return { '--dept-hue': hue } as CSSProperties
}

function getDeptIcon(name: string): React.ReactNode {
  const iconKey: Record<string, React.ReactNode> = {
    'HR отдел': <Users className="w-5 h-5" />,
    'Отдел DevOps': <Server className="w-5 h-5" />,
    'Отдел QA': <Check className="w-5 h-5" />,
    'Отдел аналитики': <BarChart3 className="w-5 h-5" />,
    'Отдел безопасности': <Shield className="w-5 h-5" />,
    'Отдел дизайна': <PenTool className="w-5 h-5" />,
    'Отдел маркетинга': <Megaphone className="w-5 h-5" />,
    'Отдел мобильной разработки': <Phone className="w-5 h-5" />,
    'Отдел поддержки': <Headphones className="w-5 h-5" />,
    'Отдел продаж': <TrendingUp className="w-5 h-5" />,
    'Отдел продукта': <Box className="w-5 h-5" />,
    'Отдел разработки': <Code className="w-5 h-5" />,
    'Финансовый отдел': <Wallet className="w-5 h-5" />,
    'Юридический отдел': <Scale className="w-5 h-5" />,
  }
  return iconKey[name] || <Users className="w-5 h-5" />
}

function AccessInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useModalOpen(open)
  if (!open) return null

  const steps = [
    { title: 'Блокировка закрывает только подачу новых заявок', text: 'уже поданные и согласованные заявки работников отдела остаются в силе — блокировка их не затрагивает' },
    { title: 'Точечная блокировка', text: 'переключатель у конкретного отдела блокирует подачу заявок только для его работников' },
    { title: '«Заблокировать все»', text: 'одним нажатием закрывает подачу заявок сразу для всех отделов организации; кнопка превращается в «Разблокировать все», когда всё уже заблокировано' },
    { title: 'Что видит работник', text: 'при попытке подать заявление на отпуск из заблокированного отдела появится сообщение, что подача временно закрыта HR' },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="fixed inset-0" onClick={onClose} />
      <Card className="relative flex w-full max-w-lg max-h-[85vh] flex-col overflow-hidden p-0 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold leading-tight">Как работает доступ к подаче заявлений</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-5">
          <ol className="space-y-4">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium">{step.title}</span>
                  <span className="text-muted-foreground"> — {step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="border-t border-border p-4 shrink-0">
          <Button className="w-full" onClick={onClose}>Понятно</Button>
        </div>
      </Card>
    </div>,
    document.body
  )
}

export function VacationAccessCard() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingBlock, setTogglingBlock] = useState<number | null>(null)
  const [togglingAll, setTogglingAll] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const fetchDepartments = async () => {
    setLoading(true)
    await useDepartmentsStore.getState().invalidateDepartments()
    await useDepartmentsStore.getState().fetchDepartments()
    setDepartments(useDepartmentsStore.getState().departments as Department[])
    setLoading(false)
  }

  useEffect(() => { fetchDepartments() }, [])

  const handleToggleBlock = async (deptId: number, blocked: boolean) => {
    setTogglingBlock(deptId)
    try {
      const res = await fetch(`${API_BASE_URL}/departments/${deptId}/vacation-block`, {
        method: 'PATCH', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ blocked }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Ошибка') }
      setDepartments((prev) => prev.map((d) => d.id === deptId ? { ...d, vacation_requests_blocked: blocked } : d))
    } catch { } finally { setTogglingBlock(null) }
  }

  const allBlocked = departments.length > 0 && departments.every((d) => d.vacation_requests_blocked)

  const handleToggleAll = async () => {
    setTogglingAll(true)
    try {
      const res = await fetch(`${API_BASE_URL}/departments/vacation-block-all`, {
        method: 'PATCH', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ blocked: !allBlocked }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Ошибка') }
      setDepartments((prev) => prev.map((d) => ({ ...d, vacation_requests_blocked: !allBlocked })))
    } catch { } finally { setTogglingAll(false) }
  }

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" />
            Доступ к подаче заявлений
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInfo(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Как это работает
            </button>
            {departments.length > 0 && (
              <Button
                variant={allBlocked ? 'outline' : 'destructive'}
                size="sm"
                onClick={handleToggleAll}
                disabled={togglingAll}
                className="gap-1.5"
              >
                {togglingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : allBlocked ? (
                  <Unlock className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                {allBlocked ? 'Разблокировать все' : 'Заблокировать все'}
              </Button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {departments.map((dd) => {
              const blocked = !!dd.vacation_requests_blocked
              return (
                <div
                  key={dd.id}
                  className={cn(
                    'relative flex flex-col gap-3 p-4 rounded-xl border transition-all',
                    blocked
                      ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20'
                      : 'border-border/50 hover:bg-muted/30'
                  )}
                >
                  {blocked && <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-red-500" />}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 dept-chip-bg" style={hueStyle(deptHue(dd.name))}>
                      {getDeptIcon(dd.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug break-words" title={dd.name}>{dd.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {typeof dd.employee_count === 'number' ? dd.employee_count : (dd.employee_count || '—')} работник(ов)
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-[52px]">
                    <span className={cn(
                      'text-xs font-semibold px-2 py-0.5 rounded-full',
                      blocked
                        ? 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40'
                        : 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40'
                    )}>
                      {togglingBlock === dd.id ? '…' : blocked ? 'Заблокирован' : 'Активно'}
                    </span>
                    <button
                      role="switch"
                      aria-checked={!blocked}
                      aria-label={`Доступ: ${dd.name}`}
                      onClick={() => handleToggleBlock(dd.id, !blocked)}
                      disabled={togglingBlock === dd.id}
                      className={cn(
                        'w-11 h-[22px] rounded-full border-0 cursor-pointer relative transition-colors flex-shrink-0',
                        blocked ? 'bg-red-600' : 'bg-emerald-500'
                      )}
                    >
                      <div className={cn(
                        'absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform',
                        blocked ? 'translate-x-[26px]' : 'translate-x-[2px]'
                      )} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AccessInfoModal open={showInfo} onClose={() => setShowInfo(false)} />
    </Card>
  )
}

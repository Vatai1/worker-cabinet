import { useState, useMemo } from 'react'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { Button } from '@/shared/components/ui/Button'
import { Badge } from '@/shared/components/ui/Badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/shared/components/ui/Avatar'
import { generateAvatarUrl } from '@/shared/lib/avatar'
import { cn, personName } from '@/shared/lib/utils'
import { VacationRequestStatus, VACATION_TYPES } from '@/shared/types'
import type { VacationRequest } from '@/shared/types'
import {
  X, Calendar, FileText, Filter, RotateCcw, History, PlaneTakeoff,
  CheckCircle2, XCircle, Clock, Ban,
} from 'lucide-react'

interface VacationHistoryListProps {
  requests: VacationRequest[]
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все статусы' },
  { value: VacationRequestStatus.ON_APPROVAL, label: 'На согласовании' },
  { value: VacationRequestStatus.APPROVED, label: 'Согласовано' },
  { value: VacationRequestStatus.REJECTED, label: 'Не согласовано' },
  { value: VacationRequestStatus.CANCELLED_BY_EMPLOYEE, label: 'Отменено работником' },
  { value: VacationRequestStatus.CANCELLED_BY_MANAGER, label: 'Отменено руководителем' },
]

const STATUS_META: Record<VacationRequestStatus, { label: string; icon: typeof Clock; className: string }> = {
  [VacationRequestStatus.ON_APPROVAL]: { label: 'На согласовании', icon: Clock, className: 'text-amber-600 bg-amber-500/15' },
  [VacationRequestStatus.APPROVED]: { label: 'Согласовано', icon: CheckCircle2, className: 'text-emerald-600 bg-emerald-500/15' },
  [VacationRequestStatus.REJECTED]: { label: 'Не согласовано', icon: XCircle, className: 'text-red-600 bg-red-500/15' },
  [VacationRequestStatus.CANCELLED_BY_EMPLOYEE]: { label: 'Отменено работником', icon: Ban, className: 'text-muted-foreground bg-muted' },
  [VacationRequestStatus.CANCELLED_BY_MANAGER]: { label: 'Отменено руководителем', icon: Ban, className: 'text-orange-600 bg-orange-500/15' },
}

export function VacationHistoryList({ requests }: VacationHistoryListProps) {
  const [selectedYear, setSelectedYear] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  const clearFilters = () => {
    setSelectedYear('all')
    setSelectedStatus('all')
  }

  const years = useMemo(() => {
    const yearsSet = new Set<number>()
    requests.forEach(request => {
      const year = new Date(request.startDate).getFullYear()
      yearsSet.add(year)
    })
    return Array.from(yearsSet).sort((a, b) => b - a)
  }, [requests])

  const filteredRequests = useMemo(() => {
    let filtered = [...requests]

    if (selectedYear !== 'all') {
      filtered = filtered.filter(request =>
        new Date(request.startDate).getFullYear().toString() === selectedYear
      )
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(request => request.status === selectedStatus)
    }

    return filtered.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [requests, selectedYear, selectedStatus])

  const hasActiveFilters = selectedYear !== 'all' ||
                          selectedStatus !== 'all'

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <History className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">История заявок</h2>
          <p className="text-xs text-muted-foreground">
            {hasActiveFilters
              ? `Найдено: ${filteredRequests.length} из ${requests.length}`
              : `Всего заявок: ${requests.length}`}
          </p>
        </div>
      </div>

      <div className="space-y-3 border-b border-border bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Фильтры</span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Сбросить
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedYear('all')}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              selectedYear === 'all'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted/50',
            )}
          >
            Все года
          </button>
          {years.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => setSelectedYear(year.toString())}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                selectedYear === year.toString()
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/50',
              )}
            >
              {year}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSelectedStatus(s.value)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                selectedStatus === s.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/50',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-3 p-5">
        {filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-12 text-center">
            <History className="h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">
              {hasActiveFilters ? 'По выбранным фильтрам ничего не найдено' : 'История отпусков пуста'}
            </p>
          </div>
        ) : (
          filteredRequests.map((request) => {
            const meta = STATUS_META[request.status]
            const StatusIcon = meta.icon
            return (
              <div key={request.id} className="rounded-xl border border-border p-4 transition-colors hover:bg-muted/30">
                <div className="flex flex-wrap items-start gap-4">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.className)}>
                    <StatusIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Avatar className="h-6 w-6 rounded-lg">
                        <AvatarImage src={request.userAvatar || generateAvatarUrl(request.userId, request.userGender)} alt={personName(request.userLastName, request.userFirstName, request.userMiddleName)} />
                        <AvatarFallback className="rounded-lg bg-primary/10 text-[10px] font-semibold text-primary">
                          {request.userFirstName[0]}{request.userLastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-semibold">{personName(request.userLastName, request.userFirstName, request.userMiddleName)}</span>
                      <Badge className={cn('border-transparent', meta.className)}>{meta.label}</Badge>
                    </div>

                    <div className="mt-2 text-sm font-medium">
                      {VACATION_TYPES[request.vacationType]?.name ?? 'Отпуск'}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(request.startDate).toLocaleDateString('ru-RU')} — {new Date(request.endDate).toLocaleDateString('ru-RU')}
                      </span>
                      <Badge variant="outline">{request.duration} дн.</Badge>
                      <span>
                        Создано: {new Date(request.createdAt).toLocaleDateString('ru-RU')}{' '}
                        {new Date(request.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {request.comment && (
                      <div className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
                        <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1">Комментарий: {request.comment}</span>
                      </div>
                    )}

                    {request.hasTravel && (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-400">
                        <PlaneTakeoff className="h-3.5 w-3.5" />
                        С проездом{request.travelDestination && ` до ${request.travelDestination}`}
                      </div>
                    )}

                    {(request.rejectionReason || request.cancellationReason) && (
                      <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                        Причина: {request.rejectionReason || request.cancellationReason}
                      </div>
                    )}

                    {request.statusHistory && request.statusHistory.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">История изменений</p>
                        {request.statusHistory.map((history, index) => (
                          <div key={index} className="flex flex-col text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                            <span>
                              {STATUS_META[history.status]?.label ?? history.status}
                              {history.comment && ` (${history.comment})`}
                              {history.changedByName && <span className="text-muted-foreground/70"> — {history.changedByName}</span>}
                            </span>
                            <span className="shrink-0">
                              {history.changedAt
                                ? `${new Date(history.changedAt).toLocaleDateString('ru-RU')} ${new Date(history.changedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                                : 'Дата не указана'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

interface VacationHistoryModalProps {
  isOpen: boolean
  requests: VacationRequest[]
  onClose: () => void
}

export function VacationHistoryModal({ isOpen, requests, onClose }: VacationHistoryModalProps) {
  useModalOpen(isOpen)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-5xl mx-4 max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
        <div className="p-6 border-b flex justify-between items-center bg-card shrink-0">
          <h2 className="text-xl font-semibold">История отпусков</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain">
          <VacationHistoryList requests={requests} />
        </div>

        <div className="p-6 border-t bg-muted/50 shrink-0">
          <Button
            onClick={onClose}
            className="w-full"
          >
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  )
}

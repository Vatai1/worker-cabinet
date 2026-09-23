import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { VacationRequest } from '@/shared/types'
import { useModalOpen } from '@/shared/hooks/useModalOpen'
import { VACATION_TYPES } from '@/shared/types'
import { Button } from '@/shared/components/ui/Button'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { X, UserCheck } from 'lucide-react'
import { formatDate, personName } from '@/shared/lib/utils'

interface VacationDetailModalProps {
  isOpen: boolean
  request: VacationRequest | null
  onClose: () => void
  onApprove?: (requestId: string) => Promise<void>
  onReject?: (requestId: string, reason: string) => Promise<void>
  loading?: boolean
  intersectionWarnings?: {message: string; employeeName: string; dates: string}[]
  onTransfer?: (request: VacationRequest) => void
}

export function VacationDetailModal({ isOpen, request, onClose, onApprove, onReject, loading, intersectionWarnings = [], onTransfer }: VacationDetailModalProps) {
  useModalOpen(isOpen)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen || !request) {
    return null
  }

  const vacationTypeInfo = VACATION_TYPES[request.vacationType]
  const canManage = !!onApprove && !!onReject

  const handleApprove = async () => {
    if (onApprove) {
      await onApprove(request.id)
      onClose()
    }
  }

  const handleReject = async () => {
    if (onReject && rejectionReason.trim()) {
      await onReject(request.id, rejectionReason)
      setShowRejectInput(false)
      setRejectionReason('')
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div data-testid="vacation-detail-modal" className="bg-card rounded-lg shadow-xl w-full max-w-md mx-4 animate-scale-in overflow-hidden flex max-h-[85vh] flex-col">
        <div className="p-6 border-b flex justify-between items-center shrink-0">
          <h2 className="text-xl font-semibold">Детали отпуска</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto scrollbar-thin overscroll-contain">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Работник</div>
            <div className="font-semibold text-lg">
              {request.userLastName} {request.userFirstName} {request.userMiddleName || ''}
            </div>
            <div className="text-sm text-muted-foreground">{request.userPosition}</div>
            <div className="text-sm text-muted-foreground">{request.userDepartment}</div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-1">Период отпуска</div>
            <div className="font-semibold">
              {format(new Date(request.startDate), 'dd MMMM yyyy', { locale: ru })} —{' '}
              {format(new Date(request.endDate), 'dd MMMM yyyy', { locale: ru })}
            </div>
            <div className="text-sm text-muted-foreground">{request.duration} дней</div>
          </div>

          <div>
            <div className="text-sm text-muted-foreground mb-1">Вид отпуска</div>
            <div className="font-semibold">{vacationTypeInfo?.name}</div>
            <div className="text-sm text-muted-foreground">{vacationTypeInfo?.description}</div>
          </div>

          {request.substitutes && request.substitutes.length > 0 && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/15">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Замещающие</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {request.substitutes.map((s) => (
                  <Link
                    key={s.id}
                    to={`/employees/${s.id}`}
                    onClick={onClose}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-background border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-medium text-primary">
                      {s.last_name[0]}{s.first_name[0]}
                    </div>
                    <div className="text-sm">
                      <div className="font-medium leading-tight">{personName(s.last_name, s.first_name, s.middle_name)}</div>
                      {s.position && <div className="text-xs text-muted-foreground leading-tight">{s.position}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {request.delegated_to && (
            <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/15">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-violet-600" />
                <span className="text-sm text-muted-foreground">
                  Согласование делегировано:{' '}
                  <Link
                    to={`/employees/${request.delegated_to.id}`}
                    onClick={onClose}
                    className="font-medium text-foreground hover:underline"
                  >
                    {personName(request.delegated_to.last_name, request.delegated_to.first_name, request.delegated_to.middle_name)}
                  </Link>
                </span>
              </div>
            </div>
          )}

          {request.hasTravel && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-1">
              <div className="flex items-center gap-2 text-blue-600">
                <span className="text-lg">✈️</span>
                <span className="font-semibold">С проездом к месту проведения отпуска</span>
              </div>
              {request.travelDestination && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Город: </span>
                  <span className="font-medium">{request.travelDestination}</span>
                </div>
              )}
              {request.travelChildrenCount != null && request.travelChildrenCount > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Несовершеннолетних детей: </span>
                  <span className="font-medium">{request.travelChildrenCount}</span>
                </div>
              )}
              {request.travelChildren && request.travelChildren.length > 0 && (
                <div className="mt-2 space-y-1">
                  {request.travelChildren.map((child, index) => (
                    <div key={index} className="text-sm pl-1 border-l-2 border-blue-300">
                      <span className="font-medium">{child.fullName}</span>
                      {child.birthDate && (
                        <span className="text-muted-foreground ml-2">({formatDate(child.birthDate)})</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {intersectionWarnings.length > 0 && (
            <div className="p-3 rounded-lg bg-[hsl(var(--warning)/0.1)] border border-[hsl(var(--warning)/0.25)]">
              <div className="text-sm">
                <div className="font-medium mb-2 flex items-center gap-2 text-[hsl(var(--warning))]">
                  <span>⚠️</span>
                  Пересечение с другими отпусками
                </div>
                {intersectionWarnings.map((warning, index) => (
                  <div key={index} className="text-[hsl(var(--warning)/0.85)] mb-2 last:mb-0">
                    <div className="font-medium">{warning.employeeName}</div>
                    <div className="text-xs text-[hsl(var(--warning)/0.7)]">{warning.dates}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {request.comment && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Комментарий</div>
              <div className="text-sm bg-muted rounded-lg p-3">{request.comment}</div>
            </div>
          )}

          {request.referenceDocument && (
            <div>
              <div className="text-sm text-muted-foreground mb-1">Справка</div>
              <div className="text-sm bg-primary/10 rounded-lg p-3">
                📄 {request.referenceDocument}
              </div>
            </div>
          )}

          {request.statusHistory && request.statusHistory.length > 0 && (
            <div>
<div className="text-sm text-muted-foreground mb-1">История изменений</div>
                <div className="space-y-2">
                  {request.statusHistory.map((history, index) => (
                    <div key={index} className="text-sm bg-muted rounded-lg p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium">
                        {history.status === 'on_approval'
                          ? 'На согласовании'
                          : history.status === 'approved'
                          ? 'Согласовано'
                          : history.status === 'rejected'
                          ? 'Не согласовано'
                          : history.status === 'cancelled_by_employee'
                          ? 'Отменено работником'
                          : history.status === 'cancelled_by_manager'
                          ? 'Отменено руководителем'
                          : history.status}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {history.changedAt 
                          ? `${format(new Date(history.changedAt), 'dd MMM yyyy HH:mm', { locale: ru })}`
                          : 'Дата не указана'
                        }
                      </span>
                    </div>
                    {history.changedByName && (
                      <div className="text-muted-foreground text-xs">
                        {history.changedByName}
                      </div>
                    )}
                    {history.comment && (
                      <div className="text-muted-foreground text-xs mt-1">
                        {history.comment}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
        <div className="px-6 py-4 border-t border-border shrink-0">
          <div className="flex gap-3">
            {canManage && !showRejectInput && (
              <>
                <Button
                  variant="secondary"
                  onClick={onClose}
                  className="flex-1"
                  disabled={loading}
                >
                  Закрыть
                </Button>
                <Button
                  onClick={handleApprove}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={loading}
                >
                  Согласовать
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectInput(true)}
                  className="flex-1"
                  disabled={loading}
                >
                  Отклонить
                </Button>
              </>
            )}
            {canManage && showRejectInput && (
              <div className="w-full space-y-3">
                <textarea
                  className="w-full rounded-xl border-2 border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Причина отклонения..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRejectInput(false)
                      setRejectionReason('')
                    }}
                    className="flex-1"
                    disabled={loading}
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    className="flex-1"
                    disabled={loading || !rejectionReason.trim()}
                  >
                    Подтвердить
                  </Button>
                </div>
              </div>
            )}
            {!canManage && (
              <div className="flex gap-3 w-full">
                <Button
                  variant="secondary"
                  onClick={onClose}
                  className="flex-1"
                >
                  Закрыть
                </Button>
                {!canManage && request.status === 'approved' && onTransfer && (
                  <Button
                    onClick={() => {
                      onTransfer(request)
                      onClose()
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    disabled={loading}
                  >
                    Перенести
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

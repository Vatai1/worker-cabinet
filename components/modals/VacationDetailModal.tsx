import type { VacationRequest } from '@/types'
import { VACATION_TYPES } from '@/types'
import { Button } from '@/components/ui/Button'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { X } from 'lucide-react'

interface VacationDetailModalProps {
  isOpen: boolean
  request: VacationRequest | null
  onClose: () => void
}

export function VacationDetailModal({ isOpen, request, onClose }: VacationDetailModalProps) {
  if (!isOpen || !request) {
    return null
  }

  const vacationTypeInfo = VACATION_TYPES[request.vacationType]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">Детали отпуска</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">Сотрудник</div>
            <div className="font-semibold text-lg">
              {request.userLastName} {request.userFirstName} {request.userMiddleName || ''}
            </div>
            <div className="text-sm text-gray-600">{request.userPosition}</div>
            <div className="text-sm text-gray-600">{request.userDepartment}</div>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">Период отпуска</div>
            <div className="font-semibold">
              {format(new Date(request.startDate), 'dd MMMM yyyy', { locale: ru })} —{' '}
              {format(new Date(request.endDate), 'dd MMMM yyyy', { locale: ru })}
            </div>
            <div className="text-sm text-gray-600">{request.duration} дней</div>
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-1">Вид отпуска</div>
            <div className="font-semibold">{vacationTypeInfo?.name}</div>
            <div className="text-sm text-gray-600">{vacationTypeInfo?.description}</div>
          </div>

          {request.hasTravel && (
            <div className="flex items-center gap-2 text-blue-600">
              <span className="text-lg">✈️</span>
              <span className="font-semibold">С проездом к месту проведения отпуска</span>
            </div>
          )}

          {request.comment && (
            <div>
              <div className="text-sm text-gray-500 mb-1">Комментарий</div>
              <div className="text-sm bg-gray-50 rounded-lg p-3">{request.comment}</div>
            </div>
          )}

          {request.referenceDocument && (
            <div>
              <div className="text-sm text-gray-500 mb-1">Справка</div>
              <div className="text-sm bg-blue-50 text-blue-900 rounded-lg p-3">
                📄 {request.referenceDocument}
              </div>
            </div>
          )}

          <div className="pt-4 border-t flex gap-3">
            <Button
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              Закрыть
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

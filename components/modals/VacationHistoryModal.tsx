import { useState, useMemo } from 'react'
import { VacationRequestStatus } from '@/types'
import { getVacationRequestStatusBadge } from '@/data/mockVacationData'
import { Button } from '@/components/ui/Button'
import { X, Calendar, FileText, Filter, RotateCcw } from 'lucide-react'

interface VacationHistoryModalProps {
  isOpen: boolean
  requests: any[]
  onClose: () => void
}

export function VacationHistoryModal({ isOpen, requests, onClose }: VacationHistoryModalProps) {
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex justify-between items-center bg-white">
          <div>
            <h2 className="text-xl font-semibold">История отпусков</h2>
            <p className="text-sm text-gray-600 mt-1">
              {hasActiveFilters 
                ? `Найдено: ${filteredRequests.length} из ${requests.length}`
                : `Всего заявок: ${requests.length}`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Фильтры */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">Фильтры</span>
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="secondary"
                onClick={clearFilters}
                className="text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Сбросить
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Фильтр по году */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Год</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Все года</option>
                {years.map(year => (
                  <option key={year} value={year.toString()}>{year}</option>
                ))}
              </select>
            </div>

            {/* Фильтр по статусу */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Статус</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Все статусы</option>
                <option value="on_approval">На согласовании</option>
                <option value="approved">Согласовано</option>
                <option value="rejected">Не согласовано</option>
                <option value="cancelled_by_employee">Отменено сотрудником</option>
                <option value="cancelled_by_manager">Отменено руководителем</option>
              </select>
            </div>
          </div>
        </div>

        {/* Список заявок */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              {hasActiveFilters 
                ? 'По выбранным фильтрам ничего не найдено'
                : 'История отпусков пуста'
              }
            </div>
          ) : (
            filteredRequests.map((request) => {
              const statusBadge = getVacationRequestStatusBadge(request.status)
              return (
                <div key={request.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          Создано: {new Date(request.createdAt).toLocaleDateString('ru-RU')}{' '}
                          {new Date(request.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      </div>
                      
                      <div className="mb-2">
                        <span className="font-semibold">
                          {request.vacationType === 'annual_paid'
                            ? 'Ежегодный отпуск'
                            : request.vacationType === 'unpaid'
                            ? 'Без сохранения ЗП'
                            : request.vacationType === 'educational'
                            ? 'Учебный отпуск'
                            : request.vacationType === 'maternity'
                            ? 'Отпуск по беременности и родам'
                            : request.vacationType === 'child_care'
                            ? 'Отпуск по уходу за ребёнком'
                            : request.vacationType === 'additional'
                            ? 'Дополнительный отпуск'
                            : request.vacationType === 'veteran'
                            ? 'Ветеранский отпуск'
                            : 'Другой'}
                        </span>
                      </div>

                      <div className="text-sm text-gray-700 mb-2">
                        <span className="font-medium">
                          {new Date(request.startDate).toLocaleDateString('ru-RU')} -{' '}
                          {new Date(request.endDate).toLocaleDateString('ru-RU')}
                        </span>
                        <span className="ml-2 text-gray-600">
                          ({request.duration} {request.duration === 1 ? 'день' : request.duration >= 2 && request.duration <= 4 ? 'дня' : 'дней'})
                        </span>
                      </div>

                      {request.comment && (
                        <div className="text-sm text-gray-600 mb-2 flex items-start gap-2">
                          <FileText className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span className="flex-1">Комментарий: {request.comment}</span>
                        </div>
                      )}

                      {request.hasTravel && (
                        <div className="text-sm text-blue-600 mb-2">
                          ✈️ С проездом{request.travelDestination && ` до ${request.travelDestination}`}
                        </div>
                      )}

                      {(request.rejectionReason || request.cancellationReason) && (
                        <div className="text-sm text-red-600 mb-2">
                          Причина: {request.rejectionReason || request.cancellationReason}
                        </div>
                      )}

                      {request.statusHistory && request.statusHistory.length > 0 && (
                        <div className="text-xs text-gray-500 mt-2 pt-2 border-t">
                          <div className="font-medium mb-1">История изменений:</div>
                          <div className="space-y-1">
                            {request.statusHistory.map((history: any, index: number) => (
                              <div key={index} className="flex flex-col">
                                <div className="flex justify-between">
                                  <span>
                                    {getVacationRequestStatusBadge(history.status).label}
                                    {history.comment && ` (${history.comment})`}
                                  </span>
                                  <span>
                                    {history.changedAt 
                                      ? `${new Date(history.changedAt).toLocaleDateString('ru-RU')} ${new Date(history.changedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                                      : 'Дата не указана'
                                    }
                                  </span>
                                </div>
                                {history.changedByName && (
                                  <div className="text-gray-400 text-xs mt-0.5">
                                    {history.changedByName}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
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

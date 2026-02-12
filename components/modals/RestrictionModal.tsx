import { useState } from 'react'
import { Button } from '@/components/ui/Button'

interface Restriction {
  id: string
  type: 'pair' | 'group'
  employeeIds: string[]
  maxConcurrent?: number
  description?: string
}

interface RestrictionModalProps {
  isOpen: boolean
  restrictions: Restriction[]
  departmentUsers: Array<{ id: string; firstName: string; lastName: string; position: string }>
  onCreateRestriction: (restriction: Omit<Restriction, 'id'>) => void
  onDeleteRestriction: (restrictionId: string) => void
  onClose: () => void
}

export function RestrictionModal({
  isOpen,
  restrictions,
  departmentUsers,
  onCreateRestriction,
  onDeleteRestriction,
  onClose,
}: RestrictionModalProps) {
  const [restrictionType, setRestrictionType] = useState<'pair' | 'group'>('pair')
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [maxConcurrent, setMaxConcurrent] = useState<number>(1)
  const [description, setDescription] = useState('')

  if (!isOpen) return null

  const handleCreateRestriction = () => {
    if (selectedEmployees.length === 0) return

    if (restrictionType === 'pair' && selectedEmployees.length !== 2) {
      alert('Для парного ограничения нужно выбрать ровно 2 сотрудника')
      return
    }

    if (restrictionType === 'group' && selectedEmployees.length < 2) {
      alert('Для группового ограничения нужно выбрать минимум 2 сотрудника')
      return
    }

    onCreateRestriction({
      type: restrictionType,
      employeeIds: selectedEmployees,
      maxConcurrent: restrictionType === 'group' ? maxConcurrent : undefined,
      description: description || undefined,
    })

    setSelectedEmployees([])
    setMaxConcurrent(1)
    setDescription('')
  }

  const toggleEmployee = (employeeId: string) => {
    if (selectedEmployees.includes(employeeId)) {
      setSelectedEmployees(selectedEmployees.filter((id) => id !== employeeId))
    } else {
      setSelectedEmployees([...selectedEmployees, employeeId])
    }
  }

  const getEmployeeName = (employeeId: string) => {
    const employee = departmentUsers.find((u) => u.id === employeeId)
    return employee ? `${employee.lastName} ${employee.firstName}` : employeeId
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">Настроить пересечения отпусков</h2>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Создать новое ограничение</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Тип ограничения</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setRestrictionType('pair')}
                      className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                        restrictionType === 'pair'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      Парное
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestrictionType('group')}
                      className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                        restrictionType === 'group'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      Групповое
                    </button>
                  </div>
                </div>

                {restrictionType === 'pair' ? (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
                    Парное ограничение: два выбранных сотрудника не могут одновременно находиться в отпуске
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800">
                    Групповое ограничение: максимум {maxConcurrent} {maxConcurrent === 1 ? 'сотрудник' : 'сотрудника'} из группы могут одновременно находиться в отпуске
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">Выберите сотрудников</label>
                  <div className="border-2 border-gray-300 rounded-lg max-h-60 overflow-y-auto">
                    {departmentUsers.map((employee) => (
                      <button
                        key={employee.id}
                        type="button"
                        onClick={() => toggleEmployee(employee.id)}
                        className={`w-full px-4 py-2 text-left border-b border-gray-200 last:border-0 hover:bg-gray-50 flex items-center gap-2 ${
                          selectedEmployees.includes(employee.id) ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          selectedEmployees.includes(employee.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                        }`}>
                          {selectedEmployees.includes(employee.id) && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{employee.lastName} {employee.firstName}</div>
                          <div className="text-xs text-gray-500">{employee.position}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Выбрано: {selectedEmployees.length}</div>
                </div>

                {restrictionType === 'group' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Максимум одновременно в отпуске</label>
                    <input
                      type="number"
                      min="1"
                      max={selectedEmployees.length - 1 || 1}
                      value={maxConcurrent}
                      onChange={(e) => setMaxConcurrent(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">Описание (необязательно)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Например, для обеспечения непрерывной работы..."
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <Button
                  type="button"
                  onClick={handleCreateRestriction}
                  disabled={selectedEmployees.length === 0}
                  className="w-full"
                >
                  Создать ограничение
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Текущие ограничения</h3>
              {restrictions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Нет ограничений</div>
              ) : (
                <div className="space-y-3 max-h-[calc(90vh-300px)] overflow-y-auto">
                  {restrictions.map((restriction) => (
                    <div
                      key={restriction.id}
                      className="border-2 border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div>
                          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                            restriction.type === 'pair' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {restriction.type === 'pair' ? 'Парное' : 'Групповое'}
                          </span>
                          {restriction.maxConcurrent && (
                            <span className="ml-2 text-xs text-gray-600">
                              (максимум {restriction.maxConcurrent} {restriction.maxConcurrent === 1 ? 'одновременно' : 'одновременно'})
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteRestriction(restriction.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      <div className="text-sm mb-2">
                        {restriction.employeeIds.map((id) => getEmployeeName(id)).join(', ')}
                      </div>
                      {restriction.description && (
                        <div className="text-xs text-gray-500 italic">{restriction.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t">
          <Button
            type="button"
            variant="secondary"
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

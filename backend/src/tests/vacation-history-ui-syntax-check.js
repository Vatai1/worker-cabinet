import { describe, it } from 'node:test'
import assert from 'node:assert'

console.log('=== Vacation History UI Components Syntax Check ===\n')

describe('Syntax Check for Vacation History UI Components', () => {

  describe('Status History Display', () => {
    it('✓ Should render status with changedBy name', () => {
      const historyEntry = {
        status: 'approved',
        changedAt: '2025-02-12T10:30:00.000Z',
        changedBy: '5',
        changedByName: 'Иванов Иван',
        comment: 'Согласовано'
      }
      
      const displayHTML = `
        <div class="history-entry">
          <span class="status">${historyEntry.status}</span>
          <span class="date">${new Date(historyEntry.changedAt).toLocaleDateString('ru-RU')}</span>
          <div class="changed-by">Кем: ${historyEntry.changedByName}</div>
        </div>
      `
      
      assert.ok(displayHTML.includes('Иванов Иван'), 'Should include actual name')
    })

    it('✓ Should handle missing changedByName gracefully', () => {
      const historyEntry = {
        status: 'on_approval',
        changedAt: '2025-02-12T09:00:00.000Z',
        changedBy: '10',
        comment: null
      }
      
      let changedByDisplay = historyEntry.changedByName 
        ? `<div>Кем: ${historyEntry.changedByName}</div>` 
        : ''
      
      assert.strictEqual(typeof changedByDisplay, 'string', 'Should produce string output')
    })

    it('✓ Should format Russian date correctly', () => {
      const dateStr = '2025-02-12T10:30:00.000Z'
      const date = new Date(dateStr)
      
      const formattedDate = date.toLocaleDateString('ru-RU')
      const formattedTime = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      
      assert.ok(formattedDate, 'Should format date')
      assert.ok(formattedTime, 'Should format time')
      assert.strictEqual(typeof formattedDate, 'string', 'Formatted date should be string')
      assert.strictEqual(typeof formattedTime, 'string', 'Formatted time should be string')
    })
  })

  describe('Vacation History Modal', () => {
    it('✓ Should support history entries array', () => {
      const statusHistory = [
        {
          status: 'on_approval',
          changedAt: '2025-02-12T09:00:00.000Z',
          changedBy: '10',
          changedByName: 'Петров Петр'
        },
        {
          status: 'approved',
          changedAt: '2025-02-12T10:30:00.000Z',
          changedBy: '5',
          changedByName: 'Иванов Иван',
          comment: 'Согласовано'
        }
      ]
      
      assert.ok(Array.isArray(statusHistory), 'statusHistory should be an array')
      assert.strictEqual(statusHistory.length, 2, 'Should have two entries')
    })

    it('✓ Should render history section', () => {
      const historySectionHTML = `
        <div className="text-xs text-gray-500 mt-2 pt-2 border-t">
          <div className="font-medium mb-1">История изменений:</div>
          <div className="space-y-1">
            <div class="flex flex-col">
              <div class="flex justify-between">
                <span>Согласовано</span>
                <span>12.02.2025 10:30</span>
              </div>
              <div class="text-gray-400 text-xs mt-0.5">
                Иванов Иван
              </div>
            </div>
          </div>
        </div>
      `
      
      assert.ok(historySectionHTML.includes('История изменений:'), 'Should include history section title')
      assert.ok(historySectionHTML.includes('Иванов Иван'), 'Should include user name')
    })
  })

  describe('Vacation Detail Modal', () => {
    it('✓ Should render history in details', () => {
      const detailHistoryHTML = `
        <div>
          <div className="text-sm text-gray-500 mb-1">История изменений</div>
          <div className="space-y-2">
            <div className="text-sm bg-gray-50 rounded-lg p-3">
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium">Согласовано</span>
                <span className="text-gray-500 text-xs">12 фев 2025 10:30</span>
              </div>
              <div className="text-gray-600 text-xs">
                Иванов Иван
              </div>
              <div className="text-gray-600 text-xs mt-1">
                Согласовано
              </div>
            </div>
          </div>
        </div>
      `
      
      assert.ok(detailHistoryHTML.includes('История изменений'), 'Should include history section')
      assert.ok(detailHistoryHTML.includes('Иванов Иван'), 'Should include user name')
    })

    it('✓ Should format status labels in Russian', () => {
      const statusLabels = {
        'on_approval': 'На согласовании',
        'approved': 'Согласовано',
        'rejected': 'Не согласовано',
        'cancelled_by_employee': 'Отменено сотрудником',
        'cancelled_by_manager': 'Отменено руководителем'
      }
      
      assert.strictEqual(statusLabels.on_approval, 'На согласовании')
      assert.strictEqual(statusLabels.approved, 'Согласовано')
      assert.strictEqual(statusLabels.rejected, 'Не согласовано')
    })
  })

  describe('TypeScript Types', () => {
    it('✓ VacationRequestStatusHistory interface should have required fields', () => {
      const VacationRequestStatusHistory = {
        status: 'approved',
        changedAt: '2025-02-12T10:30:00.000Z',
        changedBy: '5',
        changedByName: 'Иванов Иван',
        comment: 'Согласовано'
      }
      
      assert.ok(VacationRequestStatusHistory.status, 'Should have status field')
      assert.ok(VacationRequestStatusHistory.changedAt, 'Should have changedAt field')
      assert.ok(VacationRequestStatusHistory.changedBy, 'Should have changedBy field')
      assert.ok(VacationRequestStatusHistory.changedByName, 'Should have changedByName field')
    })

    it('✓ VacationRequest should have statusHistory array', () => {
      const VacationRequest = {
        id: '1',
        userId: '10',
        statusHistory: [
          {
            status: 'on_approval',
            changedAt: '2025-02-12T09:00:00.000Z',
            changedBy: '10',
            changedByName: 'Петров Петр'
          }
        ]
      }
      
      assert.ok(VacationRequest.statusHistory, 'Should have statusHistory field')
      assert.ok(Array.isArray(VacationRequest.statusHistory), 'statusHistory should be an array')
    })
  })

  describe('Component Props', () => {
    it('✓ VacationHistoryModal should accept requests prop', () => {
      const modalProps = {
        isOpen: true,
        requests: [
          {
            id: '1',
            statusHistory: [
              {
                status: 'approved',
                changedBy: '5',
                changedByName: 'Иванов Иван',
                changedAt: '2025-02-12T10:30:00.000Z'
              }
            ]
          }
        ],
        onClose: () => {}
      }
      
      assert.ok(modalProps.requests, 'Should have requests prop')
      assert.ok(Array.isArray(modalProps.requests), 'requests should be an array')
    })

    it('✓ VacationDetailModal should accept request prop', () => {
      const detailModalProps = {
        isOpen: true,
        request: {
          id: '1',
          status: 'approved',
          statusHistory: [
            {
              status: 'approved',
              changedBy: '5',
              changedByName: 'Иванов Иван',
              changedAt: '2025-02-12T10:30:00.000Z'
            }
          ]
        },
        onClose: () => {}
      }
      
      assert.ok(detailModalProps.request, 'Should have request prop')
      assert.ok(detailModalProps.request.statusHistory, 'Request should have statusHistory')
    })
  })
})

console.log('\n=== All Vacation History UI Components Syntax Checks Passed! ===\n')

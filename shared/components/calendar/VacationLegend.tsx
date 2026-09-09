import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/shared/components/ui/Card'
import { DepartmentBalanceTable } from '@/modules/vacation/components/DepartmentBalanceTable'
import { CalendarLegendSwatches } from '@/shared/components/calendar/CalendarLegendSwatches'
import { cn } from '@/shared/lib/utils'

interface VacationLegendProps {
  departmentId: string
  year: number
  currentUserId?: string
}

export function VacationLegend({ departmentId, year, currentUserId }: VacationLegendProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card>
      <div className="p-5">
        <CalendarLegendSwatches />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-sm font-medium transition-colors hover:bg-muted"
        >
          Сотрудники отдела
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')} />
        </button>

        <div
          className="grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="pt-3">
              <DepartmentBalanceTable departmentId={departmentId} year={year} currentUserId={currentUserId} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

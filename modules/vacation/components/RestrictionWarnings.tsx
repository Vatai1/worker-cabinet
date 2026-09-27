import { AlertTriangle } from 'lucide-react'
import { formatDate } from '@/shared/lib/utils'
import type { RestrictionConflict, VacationValidationErrorDetails } from '@/shared/types'

interface RestrictionWarning {
  message: string
  details?: VacationValidationErrorDetails
  conflicts?: RestrictionConflict[]
}

export function RestrictionWarnings({ warnings }: { warnings: RestrictionWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="p-3 rounded-lg bg-[hsl(var(--warning)/0.1)] border border-[hsl(var(--warning)/0.25)]">
      <div className="text-sm">
        <div className="font-medium mb-2 flex items-center gap-2 text-[hsl(var(--warning))]">
          <AlertTriangle className="h-4 w-4" />
          Внимание: пересечение отпусков
        </div>
        {warnings.map((warning, index) => (
          <div key={index} className="text-[hsl(var(--warning)/0.85)] mb-2 last:mb-0">
            <div>{warning.message}</div>
            {(warning.conflicts?.length ?? 0) > 0 && (
              <div className="mt-1.5 space-y-1">
                <div className="text-xs font-medium text-[hsl(var(--warning))]">В эти даты в отпуске:</div>
                <ul className="space-y-0.5">
                  {warning.conflicts!.map((c) => (
                    <li key={c.userId} className="text-xs text-[hsl(var(--warning)/0.85)]">
                      <span className="font-medium">{c.name}</span>
                      {c.periods.length > 0 && (
                        <span>
                          {' — '}
                          {c.periods.map((p) => `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`).join(', ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!warning.conflicts?.length && warning.details?.conflictingEmployee && (
              <div className="text-xs text-[hsl(var(--warning)/0.7)] mt-1">
                Даты: {warning.details.conflictingEmployee.dates}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

import { TIMESHEET_CODES, CODE_COLORS } from '@/shared/lib/timesheetCodes'

export function TimesheetLegend() {
  return (
    <div className="mt-6 p-4 bg-muted/30 rounded-xl border border-border/50">
      <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Легенда классификатора</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {TIMESHEET_CODES.map(({ code, label }) => (
          <div key={code} className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-md ${CODE_COLORS[code]} font-mono font-bold text-sm`}>{code}</span>
            <span className="text-sm text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function CalendarLegendSwatches() {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border bg-emerald-500/15 dark:bg-emerald-500/20" />
        <span className="text-muted-foreground">Согласовано</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border vac-pending-stripe" />
        <span className="text-muted-foreground">На согласовании</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border-2 border-primary" />
        <span className="text-muted-foreground">Мой отпуск</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border bg-muted" />
        <span className="text-muted-foreground">Выходной / праздник</span>
      </div>
    </div>
  )
}

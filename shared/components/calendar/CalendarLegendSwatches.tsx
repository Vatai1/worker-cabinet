export function CalendarLegendSwatches() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2.5 text-sm">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded flex items-center justify-center" style={{ boxShadow: 'inset 0 0 0 1px hsl(var(--primary))' }}>
          <span className="text-[10px] font-bold text-foreground">7</span>
        </div>
        <span className="text-muted-foreground">Мой отпуск</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border" style={{ backgroundColor: 'hsl(var(--success) / 0.22)' }} />
        <span className="text-muted-foreground">Согласовано</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border" style={{ backgroundColor: 'hsl(var(--warning) / 0.22)' }} />
        <span className="text-muted-foreground">На согласовании</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border" style={{ backgroundImage: 'linear-gradient(135deg, hsl(var(--success) / 0.3) 50%, hsl(var(--warning) / 0.3) 50%)' }} />
        <span className="text-muted-foreground">Смешанный статус</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border bg-muted" />
        <span className="text-muted-foreground">Выходной / праздник</span>
      </div>
    </div>
  )
}

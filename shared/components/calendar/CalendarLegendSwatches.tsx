import { PENDING_STRIPE } from '@/shared/components/calendar/YearCalendar'

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
        <div className="h-5 w-5 rounded border border-border" style={{ backgroundColor: 'hsl(var(--muted) / 0.5)', backgroundImage: PENDING_STRIPE }} />
        <span className="text-muted-foreground">На согласовании — серый штрих</span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="h-5 w-5 rounded border border-border"
          style={{
            backgroundColor: 'hsl(var(--muted) / 0.5)',
            backgroundImage: `linear-gradient(to bottom, hsl(var(--success) / 0.32) 50%, transparent 50%), ${PENDING_STRIPE}`,
          }}
        />
        <span className="text-muted-foreground">Оба статуса в один день</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border bg-muted" />
        <span className="text-muted-foreground">Выходной</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border flex items-center justify-center text-[10px] font-medium text-red-600 dark:text-red-400">23</div>
        <span className="text-muted-foreground">Праздник</span>
      </div>
    </div>
  )
}

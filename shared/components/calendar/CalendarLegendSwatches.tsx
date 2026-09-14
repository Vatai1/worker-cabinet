import { PARTICIPANT_COLORS } from '@/shared/components/calendar/YearCalendar'

export function CalendarLegendSwatches() {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded flex items-center justify-center" style={{ boxShadow: 'inset 0 0 0 1.5px hsl(var(--primary))' }}>
          <span className="text-[10px] font-bold text-foreground">7</span>
        </div>
        <span className="text-muted-foreground">Мой отпуск</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border" style={{ backgroundColor: `${PARTICIPANT_COLORS[1]}26` }} />
        <span className="text-muted-foreground">Согласовано — цвет сотрудника</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border" style={{ backgroundImage: `repeating-linear-gradient(45deg, ${PARTICIPANT_COLORS[0]}59 0 2px, transparent 2px 6px)` }} />
        <span className="text-muted-foreground">На согласовании — цвет сотрудника</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded border border-border bg-muted" />
        <span className="text-muted-foreground">Выходной / праздник</span>
      </div>
    </div>
  )
}

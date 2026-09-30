import { MousePointerClick, Keyboard, Navigation, Globe, AlertTriangle } from 'lucide-react'
import type { TelemetryAction } from '@/shared/lib/telemetry'
import { cn } from '@/shared/lib/utils'

const ICONS = {
  click: MousePointerClick,
  input: Keyboard,
  nav: Navigation,
  api: Globe,
  error: AlertTriangle,
}

export function TelemetryActions({ actions, className }: { actions: TelemetryAction[]; className?: string }) {
  if (actions.length === 0) return <p className="text-xs text-muted-foreground">Действий нет</p>
  return (
    <ol className={cn('max-h-64 overflow-y-auto rounded-lg bg-muted/30 p-2 text-xs space-y-0.5', className)}>
      {actions.map((a, i) => {
        const Icon = ICONS[a.type] ?? MousePointerClick
        return (
          <li key={i} className={cn('flex items-start gap-2 px-1 py-0.5', a.type === 'error' && 'text-destructive')}>
            <span className="shrink-0 font-mono text-muted-foreground">{new Date(a.t).toLocaleTimeString('ru-RU')}</span>
            <Icon className="h-3.5 w-3.5 shrink-0 mt-px text-muted-foreground" />
            <span className="min-w-0 break-words">{a.text}</span>
            <span className="ml-auto shrink-0 font-mono text-muted-foreground/70">{a.path}</span>
          </li>
        )
      })}
    </ol>
  )
}

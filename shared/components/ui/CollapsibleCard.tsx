import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card, CardContent, CardDescription, CardTitle } from '@/shared/components/ui/Card'
import { readLocalPref, writeLocalPref } from '@/shared/lib/localPrefs'
import { cn } from '@/shared/lib/utils'

export function CollapsibleCard({ id, icon, title, description, children }: {
  id: string
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}) {
  const prefKey = `collapsed_${id}`
  const [open, setOpen] = useState(() => readLocalPref(prefKey) !== '1')

  const toggle = () => {
    writeLocalPref(prefKey, open ? '1' : '0')
    setOpen(!open)
  }

  return (
    <Card>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 rounded-2xl p-6 text-left"
      >
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <ChevronDown className={cn('mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  )
}

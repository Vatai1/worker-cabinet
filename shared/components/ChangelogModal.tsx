import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Sparkles } from 'lucide-react'
import raw from '@/CHANGELOG.md?raw'
import { Card } from '@/shared/components/ui/Card'
import { useModalOpen } from '@/shared/hooks/useModalOpen'

interface ChangelogEntry {
  version: string
  date: string
  items: string[]
}

function parseChangelog(text: string): ChangelogEntry[] {
  const sections = text.split('\n## ').slice(1)
  const entries: ChangelogEntry[] = []
  for (const section of sections) {
    const lines = section.split('\n')
    const header = lines[0] ?? ''
    const match = header.match(/^(.+?)\s+—\s+(\d{4}-\d{2}-\d{2})/)
    if (!match) continue
    const items = lines
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .filter(Boolean)
    entries.push({ version: match[1].trim(), date: match[2], items })
  }
  return entries
}

const ENTRIES = parseChangelog(raw)

interface ChangelogModalProps {
  open: boolean
  onClose: () => void
}

export function ChangelogModal({ open, onClose }: ChangelogModalProps) {
  useModalOpen(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="fixed inset-0" onClick={onClose} />
      <Card className="relative flex w-full max-w-lg max-h-[80vh] flex-col overflow-hidden p-0 shadow-2xl animate-scale-in mx-4">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="text-base font-semibold leading-tight">Что нового</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {ENTRIES.length === 0 ? (
            <p className="text-sm text-muted-foreground">Список изменений пуст</p>
          ) : (
            ENTRIES.map((entry) => (
              <div key={entry.version}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                    {entry.version}
                  </span>
                  <span className="text-xs text-muted-foreground">{entry.date}</span>
                  {entry.version === __APP_VERSION__ && (
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Текущая
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {entry.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>,
    document.body
  )
}

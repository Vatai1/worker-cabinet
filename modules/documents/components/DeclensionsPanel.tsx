import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronRight, RotateCcw, Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { apiGet, apiPut } from '@/shared/lib/apiClient'
import { getErrorMessage } from '@/shared/lib/utils'

interface Declension {
  name: string
  genitive: string | null
  suggestion: string
}

interface DepartmentDeclension extends Declension {
  id: number
  organization: string | null
}

const GRID = 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]'

function DeclensionRow<T extends Declension>({ item, onSave }: { item: T; onSave: (genitive: string) => Promise<void> }) {
  const current = item.genitive ?? item.suggestion
  const [value, setValue] = useState(current)
  const [saving, setSaving] = useState(false)

  useEffect(() => setValue(item.genitive ?? item.suggestion), [item])

  const save = async (genitive: string) => {
    setSaving(true)
    try {
      await onSave(genitive)
      toast.success('Сохранено')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const changed = value.trim() !== current

  return (
    <div className={`grid items-center gap-2 border-b border-border/40 px-4 py-2.5 ${GRID}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" title={item.name}>{item.name}</p>
        <p className="text-[11px] text-muted-foreground">{item.genitive ? 'задано вручную' : 'автоматически'}</p>
      </div>
      <Input
        aria-label={`${item.name} — родительный падеж`}
        className="h-9"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && changed && value.trim()) save(value) }}
      />
      <div className="flex justify-end gap-1">
        <Button size="sm" className={changed ? '' : 'invisible'} disabled={saving || !value.trim()} onClick={() => save(value)}>Сохранить</Button>
        {item.genitive && (
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => save('')} title={`Вернуть автоматическое: ${item.suggestion}`}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

function DeclensionSection<T extends Declension>({ title, column, emptyText, items, rowKey, groupOf, onSave }: {
  title: string
  column: string
  emptyText: string
  items: T[] | null
  rowKey: (item: T) => string | number
  groupOf?: (item: T) => string | null
  onSave: (item: T, genitive: string) => Promise<void>
}) {
  const multipleGroups = !!groupOf && new Set((items ?? []).map(groupOf)).size > 1
  const [open, setOpen] = useState(true)
  const manual = (items ?? []).filter((i) => i.genitive).length
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group space-y-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <h2 className="text-[15px] font-semibold">
          {title} {items && <span className="font-normal text-muted-foreground">{items.length}</span>}
        </h2>
        {manual > 0 && <span className="text-xs text-muted-foreground">· задано вручную: {manual}</span>}
      </summary>
      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card [&>div:last-child>div:last-child]:border-b-0">
        <div className={`hidden gap-2 border-b border-border/40 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground md:grid ${GRID}`}>
          <span>{column}</span>
          <span>Родительный падеж (кого? чего?)</span>
          <span className="w-[6.5rem]" />
        </div>
        {items === null ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          items.map((item, i) => (
            <div key={rowKey(item)}>
              {multipleGroups && groupOf!(item) !== (i > 0 ? groupOf!(items[i - 1]) : undefined) && (
                <p className="border-b border-border/40 bg-muted/20 px-4 py-1.5 text-xs font-semibold text-muted-foreground">{groupOf!(item) || 'Без организации'}</p>
              )}
              <DeclensionRow item={item} onSave={(genitive) => onSave(item, genitive)} />
            </div>
          ))
        )}
      </div>
    </details>
  )
}

export function DeclensionsPanel() {
  const [departments, setDepartments] = useState<DepartmentDeclension[] | null>(null)
  const [positions, setPositions] = useState<Declension[] | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    apiGet<{ departments: DepartmentDeclension[]; positions: Declension[] }>('/dictionaries/declensions')
      .then((data) => {
        setDepartments(data.departments)
        setPositions(data.positions)
      })
      .catch((err: unknown) => {
        toast.error(getErrorMessage(err))
        setDepartments([])
        setPositions([])
      })
  }, [])

  const q = search.trim().toLowerCase()
  const matches = (d: Declension) => !q || d.name.toLowerCase().includes(q) || (d.genitive ?? d.suggestion).toLowerCase().includes(q)
  const emptyText = (none: string) => (q ? 'Ничего не найдено' : none)

  const saveDepartment = async (item: DepartmentDeclension, genitive: string) => {
    const saved = await apiPut<DepartmentDeclension>(`/dictionaries/declensions/departments/${item.id}`, { genitive })
    setDepartments((list) => list?.map((x) => (x.id === saved.id ? saved : x)) ?? null)
  }

  const savePosition = async (item: Declension, genitive: string) => {
    const saved = await apiPut<Declension>('/dictionaries/declensions/positions', { name: item.name, genitive })
    setPositions((list) => list?.map((x) => (x.name === saved.name ? saved : x)) ?? null)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Названия в родительном падеже подставляются в шаблоны полями <code className="rounded bg-muted px-1 font-mono text-foreground">{'{department_gen}'}</code> и{' '}
        <code className="rounded bg-muted px-1 font-mono text-foreground">{'{position_gen}'}</code>, например «от <span className="text-foreground">ведущего специалиста отдела дизайна</span>».
        ФИО в родительном падеже (<code className="rounded bg-muted px-1 font-mono text-foreground">{'{full_name_gen}'}</code>) сотрудники указывают сами при первом
        формировании заявления или в <Link to="/settings" className="text-primary hover:underline">настройках</Link>.
      </div>

      <div className="relative w-full sm:w-80">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-9 pl-10" placeholder="Поиск отдела или должности..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <DeclensionSection
        title="Отделы"
        column="Отдел"
        emptyText={emptyText('Отделов пока нет')}
        items={departments && departments.filter(matches)}
        rowKey={(d) => d.id}
        groupOf={(d) => d.organization}
        onSave={saveDepartment}
      />

      <DeclensionSection
        title="Должности"
        column="Должность"
        emptyText={emptyText('Должностей пока нет — они появятся, когда их укажут в профилях работников')}
        items={positions && positions.filter(matches)}
        rowKey={(p) => p.name}
        onSave={savePosition}
      />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { RotateCcw, Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { apiGet, apiPut } from '@/shared/lib/apiClient'
import { getErrorMessage } from '@/shared/lib/utils'

interface DepartmentDeclension {
  id: number
  name: string
  organization: string | null
  genitive: string | null
  suggestion: string
}

function DepartmentRow({ item, onSaved }: { item: DepartmentDeclension; onSaved: (d: DepartmentDeclension) => void }) {
  const current = item.genitive ?? item.suggestion
  const [value, setValue] = useState(current)
  const [saving, setSaving] = useState(false)

  useEffect(() => setValue(item.genitive ?? item.suggestion), [item])

  const save = async (genitive: string) => {
    setSaving(true)
    try {
      onSaved(await apiPut<DepartmentDeclension>(`/dictionaries/declensions/departments/${item.id}`, { genitive }))
      toast.success('Сохранено')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const changed = value.trim() !== current

  return (
    <div className="grid items-center gap-2 border-b border-border/40 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
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

export function DeclensionsPanel() {
  const [departments, setDepartments] = useState<DepartmentDeclension[] | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    apiGet<{ departments: DepartmentDeclension[] }>('/dictionaries/declensions')
      .then((data) => setDepartments(data.departments))
      .catch((err: unknown) => {
        toast.error(getErrorMessage(err))
        setDepartments([])
      })
  }, [])

  const q = search.trim().toLowerCase()
  const visible = (departments ?? []).filter((d) => !q || d.name.toLowerCase().includes(q) || (d.genitive ?? d.suggestion).toLowerCase().includes(q))
  const multipleOrgs = new Set((departments ?? []).map((d) => d.organization)).size > 1
  const onSaved = (saved: DepartmentDeclension) => setDepartments((list) => list?.map((x) => (x.id === saved.id ? saved : x)) ?? null)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Названия отделов в родительном падеже подставляются в шаблоны полем <code className="rounded bg-muted px-1 font-mono text-foreground">{'{department_gen}'}</code>,
        например «сотрудника <span className="text-foreground">отдела дизайна</span>». ФИО в родительном падеже
        (<code className="rounded bg-muted px-1 font-mono text-foreground">{'{full_name_gen}'}</code>) сотрудники указывают сами при первом
        формировании заявления или в <Link to="/settings" className="text-primary hover:underline">настройках</Link>.
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">
          Отделы {departments && <span className="font-normal text-muted-foreground">{departments.length}</span>}
        </h2>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-10" placeholder="Поиск отдела..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card [&>div:last-child>div:last-child]:border-b-0">
        <div className="hidden gap-2 border-b border-border/40 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
          <span>Отдел</span>
          <span>Родительный падеж (кого? чего?)</span>
          <span className="w-[6.5rem]" />
        </div>
        {departments === null ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Загрузка…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">{q ? 'Ничего не найдено' : 'Отделов пока нет'}</p>
        ) : (
          visible.map((d, i) => (
            <div key={d.id}>
              {multipleOrgs && d.organization !== visible[i - 1]?.organization && (
                <p className="border-b border-border/40 bg-muted/20 px-4 py-1.5 text-xs font-semibold text-muted-foreground">{d.organization || 'Без организации'}</p>
              )}
              <DepartmentRow item={d} onSaved={onSaved} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

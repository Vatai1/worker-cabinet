import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Input } from '@/shared/components/ui/Input'
import { ChevronDown, ChevronRight, Building2, Check, Pin, Search, X } from 'lucide-react'
import { useOrgStore } from '@/shared/store/orgStore'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { SELECT_TRIGGER_CLASS } from '@/shared/lib/selectStyles'
import { buildOrganizationTree } from '@/shared/lib/organizationTree'
import type { Organization } from '@/shared/store/orgStore'

export function OrgSwitcher() {
  const { organizations, currentOrgId, setCurrentOrg, fetchOrgs, setOrgPinned, loading, error } = useOrgStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set())
  const [pinError, setPinError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const currentOrg = organizations.find(o => o.id === currentOrgId)

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input')
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
      trigger?.focus()
    }
  }, [open])

  if (organizations.length <= 1) return null

  const rows = buildOrganizationTree(organizations, collapsed, search)
  const pinned = organizations.filter(org => org.is_pinned && org.name.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')))

  const togglePin = async (org: Organization) => {
    if (loading || savingIds.has(org.id)) return
    setSavingIds(ids => new Set(ids).add(org.id))
    setPinError(null)
    try {
      await setOrgPinned(org.id, !org.is_pinned)
    } catch (err) {
      setPinError(getErrorMessage(err))
    } finally {
      setSavingIds(ids => { const next = new Set(ids); next.delete(org.id); return next })
    }
  }

  const renderRow = (org: Organization, depth = 0, hasChildren = false, inTree = false) => (
    <div key={org.id} className={cn('flex items-center rounded-xl pr-1', org.id === currentOrgId ? 'bg-primary/10' : 'hover:bg-muted/60')} style={{ paddingLeft: `${8 + depth * 20}px` }}>
      {inTree && (hasChildren ? (
        <button
          type="button"
          aria-label={`${collapsed.has(org.id) && !search.trim() ? 'Развернуть' : 'Свернуть'}: ${org.name}`}
          aria-expanded={!!search.trim() || !collapsed.has(org.id)}
          disabled={!!search.trim()}
          onClick={() => setCollapsed(ids => {
            const next = new Set(ids)
            if (next.has(org.id)) next.delete(org.id)
            else next.add(org.id)
            return next
          })}
          className="shrink-0 rounded-lg p-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
        >
          {collapsed.has(org.id) && !search.trim() ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ) : <span className="w-7 shrink-0" />)}
      <button
        type="button"
        onClick={() => { if (org.id !== currentOrgId) setCurrentOrg(org.id); setOpen(false) }}
        aria-current={org.id === currentOrgId ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-3 text-left focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className={cn('min-w-0 flex-1 break-words text-sm font-medium', org.id === currentOrgId && 'text-primary')}>{org.name}</span>
        {org.id === currentOrgId && <Check className="h-4 w-4 shrink-0 text-primary" />}
      </button>
      <button
        type="button"
        aria-label={`${org.is_pinned ? 'Открепить' : 'Закрепить'}: ${org.name}`}
        title={org.is_pinned ? 'Открепить организацию' : 'Закрепить организацию'}
        aria-pressed={org.is_pinned}
        disabled={loading || savingIds.has(org.id)}
        onClick={() => void togglePin(org)}
        className={cn('ml-1 shrink-0 rounded-lg p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40', org.is_pinned ? 'text-primary' : 'text-muted-foreground')}
      >
        <Pin className={cn('h-4 w-4', org.is_pinned && 'fill-current')} />
      </button>
    </div>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setSearch(''); setPinError(null); setOpen(true); fetchOrgs(true) }}
        className={cn(SELECT_TRIGGER_CLASS, 'gap-2', open && 'border-primary/50 ring-2 ring-primary/15')}
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[140px] truncate">{currentOrg?.name || 'Организация'}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[10vh]" onClick={() => setOpen(false)}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="org-switcher-title" className="mx-4 flex max-h-[75vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
              <h3 id="org-switcher-title" className="flex items-center gap-2 font-semibold"><Building2 className="h-5 w-5" />Выбор организации</h3>
              <button type="button" aria-label="Закрыть выбор организации" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="shrink-0 border-b border-border p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} aria-label="Поиск организации" placeholder="Поиск по названию..." className="pl-9" autoFocus />
              </div>
            </div>
            {(pinError || error) && <p role="alert" className="px-4 py-2 text-sm text-destructive">{pinError || error}</p>}
            <div className="scrollbar-thin min-h-0 flex-1 overflow-auto overscroll-contain p-2" aria-busy={loading}>
              {pinned.length > 0 && (
                <section aria-label="Закреплённые организации" className="mb-2 border-b border-border pb-2">
                  <h4 className="px-3 py-2 text-xs font-semibold text-muted-foreground">Закреплённые</h4>
                  {pinned.map(org => renderRow(org))}
                </section>
              )}
              <section aria-label="Дерево организаций">
                <h4 className="px-3 py-2 text-xs font-semibold text-muted-foreground">Все организации</h4>
                {rows.length ? rows.map(({ org, depth, hasChildren }) => renderRow(org, depth, hasChildren, true)) : <p className="py-8 text-center text-sm text-muted-foreground">Ничего не найдено</p>}
              </section>
            </div>
            <p className="shrink-0 border-t border-border p-3 text-center text-xs text-muted-foreground">Всего организаций: {organizations.length}</p>
          </div>
        </div>, document.body
      )}
    </>
  )
}

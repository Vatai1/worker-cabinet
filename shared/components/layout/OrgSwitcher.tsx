import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Building2, Check, Search, X } from 'lucide-react'
import { useOrgStore } from '@/shared/store/orgStore'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/components/ui/Input'

export function OrgSwitcher() {
  const { organizations, currentOrgId, setCurrentOrg, fetchOrgs } = useOrgStore()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const currentOrg = organizations.find(o => o.id === currentOrgId)

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [open])

  if (organizations.length <= 1) return null

  const filtered = organizations.filter((org) => {
    const q = search.toLowerCase()
    return !q || org.name.toLowerCase().includes(q)
  })

  return (
    <>
      <button
        onClick={() => { setOpen(true); fetchOrgs(true) }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                   hover:bg-accent/50 transition-colors border border-border/40"
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[140px] truncate">{currentOrg?.name || 'Орган.'}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-border flex flex-col max-h-[60vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h3 className="font-semibold flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Выбор организации
              </h3>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 border-b border-border shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по названию..."
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin overscroll-contain p-2 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Ничего не найдено
                </div>
              ) : (
                filtered.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => { setCurrentOrg(org.id); setOpen(false) }}
                    className={cn(
                      'flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-left transition-colors',
                      org.id === currentOrgId ? 'bg-primary/10' : 'hover:bg-muted/60'
                    )}
                  >
                    <div className={cn(
                      'p-2 rounded-lg shrink-0',
                      org.id === currentOrgId ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn('font-medium text-sm truncate', org.id === currentOrgId && 'text-primary')}>
                        {org.name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        {org.slug && <span className="font-mono">{org.slug}</span>}
                        {org.org_role && <span>· {org.org_role}</span>}
                      </div>
                    </div>
                    {org.id === currentOrgId && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                ))
              )}
            </div>

            {filtered.length > 0 && (
              <div className="p-3 border-t border-border shrink-0">
                <p className="text-xs text-muted-foreground text-center">
                  Найдено: {filtered.length} из {organizations.length}
                </p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

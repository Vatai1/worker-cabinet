import { useEffect, useState, useRef } from 'react'
import { ChevronDown, Building2, Check } from 'lucide-react'
import { useOrgStore } from '@/shared/store/orgStore'
import { cn } from '@/shared/lib/utils'

export function OrgSwitcher() {
  const { organizations, currentOrgId, setCurrentOrg, fetchOrgs } = useOrgStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentOrg = organizations.find(o => o.id === currentOrgId)

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (organizations.length <= 1) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                   hover:bg-accent/50 transition-colors border border-border/40"
      >
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[140px] truncate">{currentOrg?.name || 'Орган.'}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-border/40
                        bg-popover shadow-lg p-1.5 z-50">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => { setCurrentOrg(org.id); setOpen(false) }}
              className={cn(
                'flex items-center gap-2 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                org.id === currentOrgId ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
              )}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{org.name}</p>
                {org.org_role && (
                  <p className="text-[11px] text-muted-foreground capitalize">{org.org_role}</p>
                )}
              </div>
              {org.id === currentOrgId && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

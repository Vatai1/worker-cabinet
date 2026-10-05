import { Fragment, useState, useEffect } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { API_BASE_URL } from '@/shared/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Badge } from '@/shared/components/ui/Badge'
import { Switch } from '@/shared/components/ui/Switch'
import { Key, Loader2, Plus, Trash2, Edit3, Check, X, AlertTriangle } from 'lucide-react'
import type { AdminRole, AdminPermission } from '@/core/admin/types/admin'
import { ROLE_LABELS } from '@/core/admin/pages/tabs/shared'

const FULL_ACCESS_ROLE_NAMES = ['admin', 'superadmin']

const MATRIX_ROLE_ORDER = ['employee', 'manager', 'director', 'hr', 'onboarding', 'admin', 'superadmin']

const PERMISSION_GROUP_LABELS: Record<string, string> = {
  users: 'Сотрудники',
  hr: 'HR-панель',
  departments: 'Отделы и учреждение',
  admin: 'Администрирование',
}

export function RolesTab() {
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [permissions, setPermissions] = useState<AdminPermission[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null)
  const [editPerms, setEditPerms] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adminModules, setAdminModules] = useState<{ code: string; name: string; locked?: boolean; category?: string; sort_order?: number }[]>([])

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [rolesRes, permsRes, modsRes] = await Promise.all([
        fetchWithRetry(`${API_BASE_URL}/admin/roles`, { headers: getAuthHeaders() }),
        fetchWithRetry(`${API_BASE_URL}/admin/permissions`, { headers: getAuthHeaders() }),
        fetchWithRetry(`${API_BASE_URL}/admin/modules`, { headers: getAuthHeaders() }),
      ])
      if (rolesRes.ok) setRoles(await rolesRes.json())
      if (permsRes.ok) setPermissions(await permsRes.json())
      if (modsRes.ok) setAdminModules(await modsRes.json())
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  const modMap = new Map(adminModules.map(m => [m.code, m]))
  const isCoreMod = (code: string) => {
    const m = modMap.get(code)
    return m?.locked === true || m?.category === 'core' || m?.category === 'general'
  }
  const moduleName = (code: string) => {
    if (PERMISSION_GROUP_LABELS[code]) return PERMISSION_GROUP_LABELS[code]
    const m = modMap.get(code)
    return m?.name ? `Модуль "${m.name}"` : code.charAt(0).toUpperCase() + code.slice(1)
  }
  const matrixRoles = [...roles].sort((a, b) => {
    const rank = (r: AdminRole) => (FULL_ACCESS_ROLE_NAMES.includes(r.name) ? 2 : r.is_system ? 0 : 1)
    return rank(a) - rank(b) || (MATRIX_ROLE_ORDER.indexOf(a.name) + 1 || 99) - (MATRIX_ROLE_ORDER.indexOf(b.name) + 1 || 99)
  })

  const toggleMatrixCell = async (role: AdminRole, permissionId: number) => {
    const current = role.permissions.map((p) => p.id)
    const next = current.includes(permissionId) ? current.filter((id) => id !== permissionId) : [...current, permissionId]
    setRoles((prev) => prev.map((r) => (r.id === role.id
      ? { ...r, permissions: permissions.filter((p) => next.includes(p.id)) }
      : r)))
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/roles/${role.id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ permissionIds: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Не удалось сохранить права')
        fetchData()
      }
    } catch (err) {
      setError(getErrorMessage(err))
      fetchData()
    }
  }
  const modules = [...new Set(permissions.map((p) => p.module))].sort((a, b) => {
    const aCore = isCoreMod(a) ? 0 : 1
    const bCore = isCoreMod(b) ? 0 : 1
    if (aCore !== bCore) return aCore - bCore
    return (modMap.get(a)?.sort_order ?? 999) - (modMap.get(b)?.sort_order ?? 999)
  })

  const createRole = async () => {
    if (!newName.trim()) { setError('Название обязательно'); return }
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/roles`, {
        method: 'POST', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      })
      if (res.ok) {
        setShowCreate(false); setNewName(''); setNewDesc(''); fetchData()
      } else {
        const data = await res.json(); setError(data.error || 'Ошибка')
      }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const deleteRole = async (id: number) => {
    if (!await confirmDialog({ title: 'Удаление роли', message: 'Удалить эту роль?', confirmText: 'Удалить', variant: 'danger' })) return
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/roles/${id}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      })
      if (res.ok) fetchData()
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const savePermissions = async () => {
    if (!editingRole) return
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/roles/${editingRole.id}`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ permissionIds: editPerms }),
      })
      if (res.ok) { setEditingRole(null); fetchData() }
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
  }

  const togglePerm = (pid: number) => {
    setEditPerms((prev) => prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid])
  }

  const toggleModule = (module: string) => {
    const modulePermIds = permissions.filter((p) => p.module === module).map((p) => p.id)
    const allSelected = modulePermIds.every((id) => editPerms.includes(id))
    if (allSelected) {
      setEditPerms((prev) => prev.filter((id) => !modulePermIds.includes(id)))
    } else {
      setEditPerms((prev) => [...new Set([...prev, ...modulePermIds])])
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (editingRole) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" /> Настройка доступов: {ROLE_LABELS[editingRole.name] || editingRole.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
            </div>
          )}

          {FULL_ACCESS_ROLE_NAMES.includes(editingRole.name) && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">У этой роли всегда полный доступ — галочки на её права не влияют.</p>
          )}
          <div className="flex gap-2 mb-4">
            <Button onClick={savePermissions} disabled={FULL_ACCESS_ROLE_NAMES.includes(editingRole.name)}><Check className="h-4 w-4 mr-1" /> Сохранить</Button>
            <Button variant="outline" onClick={() => setEditingRole(null)}>Отмена</Button>
          </div>

          {modules.map((mod) => {
            const modPerms = permissions.filter((p) => p.module === mod)
            const allSelected = modPerms.every((p) => editPerms.includes(p.id))
            return (
              <div key={mod} className="border border-border/50 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Switch checked={allSelected} onCheckedChange={() => toggleModule(mod)} />
                  <span className="font-medium">{moduleName(mod)}</span>
                  <span className="text-xs text-muted-foreground">
                    ({modPerms.filter((p) => editPerms.includes(p.id)).length}/{modPerms.length})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 ml-9">
                  {modPerms.map((perm) => {
                    const checked = editPerms.includes(perm.id)
                    return (
                    <label key={perm.id} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-muted/30 cursor-pointer">
                      <span
                        role="checkbox"
                        aria-checked={checked}
                        tabIndex={0}
                        onClick={(e) => { e.preventDefault(); togglePerm(perm.id) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePerm(perm.id) } }}
                        className={cn(
                          'h-[18px] w-[18px] rounded-md flex items-center justify-center shrink-0 border-2 transition-colors',
                          checked
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground/25 hover:border-muted-foreground/40',
                        )}
                      >
                        {checked && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                      </span>
                      <span>{perm.name}</span>
                    </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> Роли и доступы</CardTitle>
            <CardDescription>Управление ролями и правами доступа</CardDescription>
          </div>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> Новая роль</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}

        {showCreate && (
          <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5">
            <Input placeholder="Название роли" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Описание" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <Button onClick={createRole}>Создать</Button>
            <Button variant="outline" onClick={() => { setShowCreate(false); setNewName(''); setNewDesc('') }}>Отмена</Button>
          </div>
        )}

        <div data-testid="permissions-matrix" className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="sticky left-0 z-10 min-w-[16rem] bg-muted/40 px-3 py-2 text-left font-medium">Право</th>
                {matrixRoles.map((role) => (
                  <th key={role.id} className="px-2 py-2 text-center text-xs font-medium whitespace-nowrap">
                    {ROLE_LABELS[role.name] || role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <Fragment key={mod}>
                  <tr className="bg-muted/20">
                    <td colSpan={matrixRoles.length + 1} className="sticky left-0 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {moduleName(mod)}
                    </td>
                  </tr>
                  {permissions.filter((p) => p.module === mod).map((perm) => (
                    <tr key={perm.id} className="border-t border-border/40">
                      <td className="sticky left-0 z-10 min-w-[16rem] bg-card px-3 py-2">{perm.name}</td>
                      {matrixRoles.map((role) => {
                        const locked = FULL_ACCESS_ROLE_NAMES.includes(role.name)
                        const checked = locked || role.permissions.some((p) => p.id === perm.id)
                        return (
                          <td key={role.id} className="px-2 py-2 text-center">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={checked}
                              aria-label={`${perm.name} — ${ROLE_LABELS[role.name] || role.name}`}
                              disabled={locked}
                              title={locked ? 'У этой роли всегда полный доступ' : undefined}
                              onClick={() => toggleMatrixCell(role, perm.id)}
                              className={cn(
                                'inline-flex h-[18px] w-[18px] items-center justify-center rounded-md border-2 transition-colors',
                                checked ? 'border-primary bg-primary' : 'border-muted-foreground/25 hover:border-muted-foreground/40',
                                locked && 'opacity-50 cursor-not-allowed',
                              )}
                            >
                              {checked && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Изменения применяются сразу. Разграничение по данным (например, руководитель работает только со своим отделом) остаётся прежним. Администратор и суперадмин всегда имеют полный доступ.</p>

        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 hover:border-border transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color || '#6366f1' }} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ROLE_LABELS[role.name] || role.name}</span>
                    {role.is_system && (
                      <span className="relative group">
                        <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 cursor-help">Системная</Badge>
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-popover border border-border text-xs text-popover-foreground shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-normal w-56 text-center z-50">
                          Встроенная роль для работы системы. Нельзя удалить, но можно настроить доступы.
                          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-border" />
                        </span>
                      </span>
                    )}
                  </div>
                  {role.description && <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{role.permissions.length} разрешений</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setEditingRole(role); setEditPerms(role.permissions.map((p) => p.id)) }}>
                  <Edit3 className="h-3.5 w-3.5 mr-1" /> Доступы
                </Button>
                {!role.is_system && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => deleteRole(role.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

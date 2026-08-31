import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Pencil, Save, X } from 'lucide-react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/shared/lib/apiClient'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { confirmDialog } from '@/shared/components/ConfirmDialog'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'

interface RoleMappingRule {
  id: number
  position_pattern: string
  org_role: 'employee' | 'manager' | 'hr' | 'admin'
  is_active: boolean
  created_at: string
  updated_at: string
}

const ROLE_CONFIG: Record<string, { label: string; className: string }> = {
  admin: { label: 'Администратор', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  hr: { label: 'HR', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  manager: { label: 'Менеджер', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  employee: { label: 'Сотрудник', className: 'bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400' },
}

export function AdminRoleMappings() {
  const [rules, setRules] = useState<RoleMappingRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pattern, setPattern] = useState('')
  const [role, setRole] = useState<string>('employee')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchRules = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRules(await apiGet<RoleMappingRule[]>('/admin/role-mappings'))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRules() }, [fetchRules])

  const handleSubmit = async () => {
    if (!pattern.trim()) { setError('Укажите должность'); return }
    setSaving(true)
    setError(null)
    try {
      if (editingId !== null) {
        await apiPut(`/admin/role-mappings/${editingId}`, { position_pattern: pattern.trim(), org_role: role })
        toast.success('Правило обновлено')
      } else {
        await apiPost('/admin/role-mappings', { position_pattern: pattern.trim(), org_role: role })
        toast.success('Правило добавлено')
      }
      setPattern('')
      setRole('employee')
      setEditingId(null)
      fetchRules()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (rule: RoleMappingRule) => {
    const confirmed = await confirmDialog({
      title: 'Удалить правило',
      message: `Удалить правило «${rule.position_pattern}» → ${ROLE_CONFIG[rule.org_role]?.label || rule.org_role}?`,
      confirmText: 'Удалить',
      variant: 'danger',
    })
    if (!confirmed) return
    try {
      await apiDelete(`/admin/role-mappings/${rule.id}`)
      toast.success('Правило удалено')
      fetchRules()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const startEdit = (rule: RoleMappingRule) => {
    setEditingId(rule.id)
    setPattern(rule.position_pattern)
    setRole(rule.org_role)
    setError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setPattern('')
    setRole('employee')
    setError(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Маппинг должностей → роли</CardTitle>
        <CardDescription>При первом входе сотрудника из Keycloak система автоматически назначит org_role по его должности</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Нет правил маппинга. Добавьте первое правило</div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Должность</th>
                  <th className="px-4 py-2.5 font-medium">Роль</th>
                  <th className="px-4 py-2.5 font-medium text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className={cn('border-t border-border transition-colors', editingId === rule.id ? 'bg-muted/40' : 'hover:bg-muted/30')}>
                    <td className="px-4 py-2.5 font-medium">{rule.position_pattern}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('px-2 py-0.5 rounded-md text-xs font-medium', ROLE_CONFIG[rule.org_role]?.className || ROLE_CONFIG.employee.className)}>
                        {ROLE_CONFIG[rule.org_role]?.label || rule.org_role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(rule)} disabled={editingId !== null && editingId !== rule.id}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(rule)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs text-muted-foreground block mb-1">Должность</label>
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="Начальник отдела"
                className="h-9 rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Роль</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="employee">Сотрудник</option>
                <option value="manager">Менеджер</option>
                <option value="hr">HR</option>
                <option value="admin">Администратор</option>
              </select>
            </div>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : editingId !== null
                  ? <Save className="h-4 w-4" />
                  : <Plus className="h-4 w-4" />}
              {editingId !== null ? 'Сохранить' : 'Добавить'}
            </Button>
            {editingId !== null && (
              <Button variant="outline" onClick={cancelEdit}>
                <X className="h-4 w-4" />
                Отмена
              </Button>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <p className="text-xs text-muted-foreground">Маппинг применяется только при первом входе сотрудника. Ручные изменения роли не затираются</p>
      </CardContent>
    </Card>
  )
}

import { useState, useEffect } from 'react'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'
import { fetchWithRetry } from '@/shared/lib/apiClient'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { API_BASE_URL } from '@/shared/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { openModelsModal } from '@/core/admin/components/ModelsModal'
import { Key, Loader2, Check, AlertTriangle, ChevronRight, RefreshCw, Sliders, Boxes, Save, Bot, Package } from 'lucide-react'
import type { SystemSetting } from '@/core/admin/types/admin'

export function SectionCard({ name, icon: Icon, desc, collapsed, onToggle, children }: {
  name: string; icon: React.ComponentType<{ className?: string }>; desc: string;
  collapsed: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <Card>
      <button onClick={onToggle} className="w-full text-left">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            <div>
              <CardTitle>{name}</CardTitle>
              <CardDescription>{desc}</CardDescription>
            </div>
          </div>
          <ChevronRight className={cn('h-4 w-4 text-muted-foreground/50 transition-transform duration-200 shrink-0', !collapsed && 'rotate-90')} />
        </CardHeader>
      </button>
      {!collapsed && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  )
}

export function AssistantSettingsTab() {
  const [settings, setSettings] = useState<SystemSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [agentStatus, setAgentStatus] = useState<'unknown' | 'running' | 'stopped'>('unknown')
  const [applyingAgent, setApplyingAgent] = useState(false)
  const [agentResult, setAgentResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    const raw = document.cookie
      .split('; ')
      .find((r) => r.startsWith('admin_sections='))
      ?.split('=')[1]
    if (raw) return new Set(JSON.parse(decodeURIComponent(raw)))
    return new Set()
  })
  const toggleSection = (name: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      document.cookie = `admin_sections=${encodeURIComponent(JSON.stringify([...next]))}; path=/; max-age=31536000; SameSite=Lax`
      return next
    })
  }

  useEffect(() => { fetchSettings(); checkAgent() }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/settings`, { headers: getAuthHeaders() })
      if (res.ok) {
        const all = await res.json()
        setSettings(all.filter((s: SystemSetting) => s.key.startsWith('assistant_')))
      }
    } catch {} finally { setLoading(false) }
  }

  const saveSettings = async () => {
    setSaving(true); setError(null); setSuccess(false)
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/settings`, {
        method: 'PUT', headers: getAuthHeadersWithContentType(),
        body: JSON.stringify({ settings: settings.map((s) => ({ key: s.key, value: s.value })) }),
      })
      if (res.ok) setSuccess(true)
      else { const data = await res.json(); setError(data.error || 'Ошибка') }
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSaving(false) }
  }

  const updateValue = (key: string, value: string) => {
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)))
  }
  const getValue = (key: string) => settings.find(s => s.key === key)?.value || ''

  const checkAgent = async () => {
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/assistant/agent-status`, { headers: getAuthHeaders() })
      const data = await res.json()
      setAgentStatus(data.status || 'stopped')
    } catch { setAgentStatus('stopped') }
  }

  const agentEnabled = getValue('assistant_agent_enabled') === 'true'
  const configured = !!getValue('assistant_api_url') && !!getValue('assistant_api_key')
  const temperature = parseFloat(getValue('assistant_temperature')) || 0.7

  const toggleAgent = async () => {
    const newVal = agentEnabled ? 'false' : 'true'
    updateValue('assistant_agent_enabled', newVal)
    if (newVal === 'true') {
      updateValue('assistant_api_url', 'http://127.0.0.1:8642/v1/chat')
    }
    try {
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/assistant/agent-toggle`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newVal === 'true' }),
      })
      const data = await res.json()
      if (!data.success) {
        setAgentResult({ ok: false, msg: data.message || 'Ошибка запуска контейнера' })
      }
      await checkAgent()
    } catch (err) {
      setAgentResult({ ok: false, msg: getErrorMessage(err) })
    }
  }

  const applyAgentConfig = async () => {
    setApplyingAgent(true); setAgentResult(null)
    try {
      await saveSettings()
      const res = await fetchWithRetry(`${API_BASE_URL}/admin/assistant/agent-config`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.success) {
        setAgentResult({ ok: true, msg: 'Контейнер перезапущен с новыми настройками' })
      } else {
        setAgentResult({ ok: false, msg: data.message || 'Ошибка перезапуска' })
      }
    } catch (err) { setAgentResult({ ok: false, msg: getErrorMessage(err) }) }
    finally { setApplyingAgent(false) }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 text-sm">
          <Check className="h-4 w-4" /> Настройки сохранены
        </div>
      )}

      <SectionCard name="Mini-Agent" icon={Boxes} desc="Локальный AI-агент (Ollama + инструменты)" collapsed={collapsedSections.has('Mini-Agent')} onToggle={() => toggleSection('Mini-Agent')}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Включить Mini-Agent</p>
            <p className="text-xs text-muted-foreground">Погода, крипта, инструменты через Ollama</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={checkAgent}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              {agentStatus === 'running' && <span className="text-emerald-600">Запущен</span>}
              {agentStatus === 'stopped' && <span className="text-red-500">Остановлен</span>}
              {agentStatus === 'unknown' && 'Проверить'}
            </button>
            <div
              onClick={toggleAgent}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-colors',
                agentEnabled ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span className={cn(
                'inline-block h-4 w-4 rounded-full bg-white transition-transform',
                agentEnabled ? 'translate-x-6' : 'translate-x-1'
              )} />
            </div>
          </div>
        </div>

        {agentEnabled && (
          <div className="grid gap-4 p-4 rounded-xl bg-muted/20 border border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium">Модель Ollama</p>
              </div>
              <div className="flex items-center gap-2">
                <Input value={getValue('assistant_agent_model')} readOnly className="sm:w-48 bg-muted cursor-pointer" placeholder="qwen2.5:3b" onClick={() => openModelsModal(getValue('assistant_agent_model'), (m) => updateValue('assistant_agent_model', m))} />
                <Button variant="outline" size="sm" onClick={() => openModelsModal(getValue('assistant_agent_model'), (m) => updateValue('assistant_agent_model', m))}>
                  <Package className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium">Ollama Base URL</p>
              </div>
              <Input value={getValue('assistant_agent_base_url')} onChange={(e) => updateValue('assistant_agent_base_url', e.target.value)} className="sm:w-96" placeholder="http://host.docker.internal:11434/v1" />
            </div>

            {agentResult && (
              <div className={cn(
                'flex items-center gap-2 p-2 rounded-lg text-sm',
                agentResult.ok ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'
              )}>
                {agentResult.ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                {agentResult.msg}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button onClick={applyAgentConfig} disabled={applyingAgent} size="sm">
                {applyingAgent ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard name="Параметры модели" icon={Sliders} desc="Настройки генерации ответов" collapsed={collapsedSections.has('Параметры модели')} onToggle={() => toggleSection('Параметры модели')}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium">Модель</p>
            <p className="text-xs text-muted-foreground">Идентификатор модели (зависит от провайдера)</p>
          </div>
          <Input value={getValue('assistant_model')} onChange={(e) => updateValue('assistant_model', e.target.value)} className="sm:w-64" placeholder="gpt-4o-mini" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Температура</p>
              <p className="text-xs text-muted-foreground">Ниже = точнее, выше = креативнее</p>
            </div>
            <span className="text-sm font-mono tabular-nums w-10 text-right">{temperature.toFixed(1)}</span>
          </div>
          <input
            type="range" min="0" max="2" step="0.1"
            value={temperature}
            onChange={(e) => updateValue('assistant_temperature', e.target.value)}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0.0 Точный</span><span>1.0 Баланс</span><span>2.0 Креативный</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium">Максимум токенов</p>
            <p className="text-xs text-muted-foreground">Длина ответа (256–16384)</p>
          </div>
          <Input type="number" min="256" max="16384" value={getValue('assistant_max_tokens')} onChange={(e) => updateValue('assistant_max_tokens', e.target.value)} className="sm:w-32" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium">Лимит истории</p>
            <p className="text-xs text-muted-foreground">Сколько последних сообщений отправлять в контекст</p>
          </div>
          <Input type="number" min="1" max="100" value={getValue('assistant_history_limit')} onChange={(e) => updateValue('assistant_history_limit', e.target.value)} className="sm:w-32" />
        </div>
      </SectionCard>

      <SectionCard name="API подключение" icon={Key} desc="OpenAI-совместимый API endpoint" collapsed={collapsedSections.has('API подключение')} onToggle={() => toggleSection('API подключение')}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium">API URL</p>
            <p className="text-xs text-muted-foreground font-mono">assistant_api_url</p>
          </div>
          <Input value={getValue('assistant_api_url')} onChange={(e) => updateValue('assistant_api_url', e.target.value)} className="sm:w-96" placeholder="http://127.0.0.1:8642/v1/chat/completions" />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex-1">
            <p className="text-sm font-medium">API ключ</p>
            <p className="text-xs text-muted-foreground font-mono">assistant_api_key</p>
          </div>
          <Input type="password" value={getValue('assistant_api_key')} onChange={(e) => updateValue('assistant_api_key', e.target.value)} className="sm:w-80" placeholder="sk-..." />
        </div>
      </SectionCard>

      <SectionCard name="Системный промпт" icon={Bot} desc="Инструкция для AI — определяет поведение и стиль ответов" collapsed={collapsedSections.has('Системный промпт')} onToggle={() => toggleSection('Системный промпт')}>
        <textarea
          value={getValue('assistant_system_prompt')}
          onChange={(e) => updateValue('assistant_system_prompt', e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          placeholder="Ты — кадровый ассистент..."
        />
      </SectionCard>

      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 text-sm ${configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
          <div className={`w-2 h-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {configured ? 'Подключено' : 'Не настроено — заполните API URL и API ключ'}
        </div>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
          Сохранить
        </Button>
      </div>
    </div>
  )
}

import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'

export type TelemetryActionType = 'click' | 'input' | 'nav' | 'api' | 'error'

export interface TelemetryAction {
  t: string
  type: TelemetryActionType
  text: string
  path: string
}

const MAX_ACTIONS = 100
const ERROR_ACTIONS = 30
const ERROR_DEDUPE_MS = 5 * 60 * 1000
const CLIENT_ERROR_URL = `${API_BASE_URL}/bug-reports/client-error`

const buffer: TelemetryAction[] = []
const reportedErrors = new Map<string, number>()
let installed = false

export function recordAction(type: TelemetryActionType, text: string) {
  buffer.push({ t: new Date().toISOString(), type, text: text.slice(0, 500), path: window.location.pathname })
  if (buffer.length > MAX_ACTIONS) buffer.shift()
}

export function getActions(limit = MAX_ACTIONS): TelemetryAction[] {
  return buffer.slice(-limit)
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

function fieldLabel(el: Field) {
  return clean(el.labels?.[0]?.innerText) || clean(el.getAttribute('aria-label')) ||
    clean(el.getAttribute('placeholder')) || clean(el.name) || clean(el.id) || el.tagName.toLowerCase()
}

function isSecret(el: Field) {
  if (el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'hidden')) return true
  const autocomplete = el.getAttribute('autocomplete') ?? ''
  return autocomplete.includes('password') || autocomplete.startsWith('cc-')
}

function fieldValue(el: Field) {
  if (el instanceof HTMLSelectElement) return Array.from(el.selectedOptions).map((o) => clean(o.text)).join(', ')
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? 'вкл' : 'выкл'
    if (el.type === 'file') return Array.from(el.files ?? []).map((f) => f.name).join(', ')
  }
  return el.value.slice(0, 200)
}

function describeClick(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const el = target.closest('button, a, summary, label, [role="button"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"]')
  if (!el) return null
  const label = clean(el.getAttribute('aria-label')) || clean((el as HTMLElement).innerText) ||
    clean(el.getAttribute('title')) || clean(el.getAttribute('data-testid'))
  if (!label) return null
  const kind = el.tagName === 'A' ? 'ссылка' : el.tagName === 'LABEL' ? 'поле' : 'кнопка'
  return `${kind} «${label}»`
}

function requestInfo(input: RequestInfo | URL, init?: RequestInit) {
  const url = input instanceof Request ? input.url : String(input)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  let path = url
  try { path = new URL(url, window.location.href).pathname } catch { /* keep raw */ }
  return { url, method, path }
}

export function reportClientError(message: string, stack?: string) {
  recordAction('error', message)
  const now = Date.now()
  if (now - (reportedErrors.get(message) ?? 0) < ERROR_DEDUPE_MS) return
  reportedErrors.set(message, now)
  fetch(CLIENT_ERROR_URL, {
    method: 'POST',
    headers: getAuthHeadersWithContentType(),
    credentials: 'include',
    body: JSON.stringify({ message, stack, path: window.location.pathname + window.location.search, actions: getActions(ERROR_ACTIONS) }),
  }).catch(() => {})
}

export function installTelemetry() {
  if (installed) return
  installed = true

  document.addEventListener('click', (e) => {
    const text = describeClick(e.target)
    if (text) recordAction('click', text)
  }, true)

  document.addEventListener('change', (e) => {
    const el = e.target
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return
    if (isSecret(el)) return
    recordAction('input', `${fieldLabel(el)} = ${fieldValue(el)}`)
  }, true)

  let lastPath = window.location.pathname + window.location.search
  const onNavigate = () => {
    const next = window.location.pathname + window.location.search
    if (next === lastPath) return
    lastPath = next
    recordAction('nav', `переход на ${next}`)
  }
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method].bind(history)
    history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args)
      onNavigate()
    }
  }
  window.addEventListener('popstate', onNavigate)

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const { url, method, path } = requestInfo(input, init)
    if (url === CLIENT_ERROR_URL) return originalFetch(input, init)
    try {
      const res = await originalFetch(input, init)
      if (!res.ok || (method !== 'GET' && !path.endsWith('/auth/refresh'))) recordAction('api', `${method} ${path} → ${res.status}`)
      return res
    } catch (err) {
      recordAction('api', `${method} ${path} → нет ответа`)
      throw err
    }
  }

  window.addEventListener('error', (e) => {
    if (!e.message) return
    reportClientError(e.message, e.error instanceof Error ? e.error.stack : `${e.filename}:${e.lineno}:${e.colno}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    if (reason instanceof Error && reason.name === 'AbortError') return
    reportClientError(reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined)
  })
}

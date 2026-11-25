export const ACTIVE_STATUSES = ['queued', 'running', 'recovery_required']
export const SETTINGS_KEYS = ['enabled', 'frontend_url', 'backend_health_url', 'health_timeout_seconds']

export function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !SETTINGS_KEYS.includes(key))) throw new Error('Некорректные настройки обновления')
  if (typeof value.enabled !== 'boolean') throw new Error('Укажите, разрешено ли обновление')
  if (!Number.isInteger(value.health_timeout_seconds) || value.health_timeout_seconds < 30 || value.health_timeout_seconds > 600) throw new Error('Время ожидания должно быть от 30 до 600 секунд')
  for (const key of ['frontend_url', 'backend_health_url']) {
    if (value[key] === '' && !value.enabled) continue
    let url
    try { url = new URL(value[key]) } catch { throw new Error('Укажите корректные адреса проверки серверов') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Адрес проверки должен быть HTTP(S) без пароля и параметров')
    if (key === 'frontend_url' && url.pathname !== '/') throw new Error('Укажите адрес сайта без пути')
  }
  return Object.fromEntries(SETTINGS_KEYS.map(key => [key, value[key]]))
}

export function validateRelease(value, repositories) {
  if (!value || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value.version) || !/^[a-f0-9]{7,40}$/.test(value.commit)) throw new Error('Некорректный манифест релиза')
  for (const key of ['frontend', 'backend']) {
    if (typeof value[key] !== 'string' || !value[key].startsWith(`${repositories[key]}@sha256:`) || !/^[a-f0-9]{64}$/.test(value[key].split('@sha256:')[1] || '')) throw new Error('Образ релиза не входит в разрешённый репозиторий или не закреплён по digest')
  }
  return { version: value.version, commit: value.commit, frontend: value.frontend, backend: value.backend }
}

export function requireDeploymentAdmin(req, res, next) {
  if (req.user?.role !== 'superadmin' || req.realUser || req.previewRole || req.impersonatedRealUser || req.impersonatedTestUser) return res.status(403).json({ error: 'Обновление доступно только суперадминистратору вне режима просмотра чужого профиля', code: 'FORBIDDEN' })
  next()
}

export function matchesRelease(observed, release) {
  return observed?.backend?.reference === release.backend && observed.backend.running && observed.backend.healthy === true && observed?.worker?.reference === release.backend && observed.worker.running && observed?.frontend?.reference === release.frontend && observed.frontend.running
}

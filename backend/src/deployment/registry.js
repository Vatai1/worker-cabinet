import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { validateRelease } from './validation.js'

const ACCEPT = ['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json', 'application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].join(', ')
const DIGEST = /^sha256:[a-f0-9]{64}$/
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function compareVersions(a, b) {
  const [leftMain, ...leftSuffix] = a.split('-')
  const [rightMain, ...rightSuffix] = b.split('-')
  const left = leftMain.split('.').map(BigInt)
  const right = rightMain.split('.').map(BigInt)
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] > right[index] ? -1 : 1
  if (!leftSuffix.length || !rightSuffix.length) return leftSuffix.length === rightSuffix.length ? 0 : leftSuffix.length ? 1 : -1
  const leftPre = leftSuffix.join('-').split('.')
  const rightPre = rightSuffix.join('-').split('.')
  for (let index = 0; index < Math.max(leftPre.length, rightPre.length); index++) {
    if (leftPre[index] === rightPre[index]) continue
    if (leftPre[index] === undefined || rightPre[index] === undefined) return leftPre[index] === undefined ? 1 : -1
    const leftNumeric = /^\d+$/.test(leftPre[index])
    const rightNumeric = /^\d+$/.test(rightPre[index])
    if (leftNumeric !== rightNumeric) return leftNumeric ? 1 : -1
    if (leftNumeric) return BigInt(leftPre[index]) > BigInt(rightPre[index]) ? -1 : 1
    return leftPre[index] > rightPre[index] ? -1 : 1
  }
  return 0
}

export function repositoryPath(repository) {
  if (!/^[a-z0-9][a-z0-9./:_-]+$/.test(repository) || repository.includes('@') || repository.includes('..')) throw new Error('Некорректный репозиторий образов')
  const parts = repository.split('/')
  if (parts.length > 1 && (parts[0].includes('.') || parts[0].includes(':') || parts[0] === 'localhost')) parts.shift()
  if (parts.some(part => !/^[a-z0-9][a-z0-9._-]*$/.test(part))) throw new Error('Некорректный путь репозитория')
  return parts.length === 1 ? `library/${parts[0]}` : parts.join('/')
}

export function registryServer(repository) {
  const first = repository.split('/')[0]
  if (['docker.io', 'index.docker.io', 'registry-1.docker.io'].includes(first)) return 'docker.io'
  return first.includes('.') || first.includes(':') || first === 'localhost' ? first : 'docker.io'
}

export function registryOrigin(repository) {
  const server = registryServer(repository)
  return server === 'docker.io' ? 'https://registry-1.docker.io' : `https://${server}`
}

async function bytes(response, limit = 4194304) {
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > limit) throw new Error('Слишком большой ответ реестра образов')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function checkedJson(data, digest) {
  if (digest && (!DIGEST.test(digest) || `sha256:${createHash('sha256').update(data).digest('hex')}` !== digest)) throw new Error('Контрольная сумма данных реестра не совпадает')
  return JSON.parse(data.toString('utf8'))
}

export class RegistryClient {
  constructor({ url, username = '', password = '', allowHttp = false, authOrigins = [], platform = 'linux/amd64', fetchImpl = fetch, signal, limit = 30 }) {
    this.base = new URL(url.endsWith('/') ? url : `${url}/`)
    if (!['https:', 'http:'].includes(this.base.protocol) || (this.base.protocol === 'http:' && !allowHttp) || this.base.username || this.base.password || this.base.search || this.base.hash) throw new Error('Некорректный адрес Docker Registry; для HTTP требуется явное разрешение')
    if (!/^linux\/(amd64|arm64)$/.test(platform) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Некорректные параметры поиска версий')
    this.basic = username ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : undefined
    this.authOrigins = new Set([this.base.origin, ...authOrigins])
    if (this.base.hostname === 'registry-1.docker.io') this.authOrigins.add('https://auth.docker.io')
    this.platform = platform
    this.fetch = fetchImpl
    this.signal = signal
    this.limit = limit
    this.tokens = new Map()
    this.configs = new Map()
  }

  endpoint(repository, suffix) { return new URL(`v2/${repositoryPath(repository)}/${suffix}`, this.base) }

  async fetchUrl(url, headers = {}, blob = false) {
    let current = new URL(url)
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (current.username || current.password || !['https:', 'http:'].includes(current.protocol) || (current.protocol === 'http:' && this.base.protocol !== 'http:')) throw new Error('Небезопасное перенаправление реестра')
      const response = await this.fetch(current, { headers, redirect: 'manual', signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) })
      if (![301, 302, 303, 307, 308].includes(response.status)) return response
      const next = new URL(response.headers.get('location'), current)
      await response.body?.cancel()
      if (!blob && next.origin !== current.origin) throw new Error('Реестр перенаправляет запрос на другой сервер')
      if (next.origin !== current.origin) headers = { Accept: headers.Accept || 'application/octet-stream' }
      current = next
    }
    throw new Error('Слишком много перенаправлений реестра')
  }

  async request(url, repository, blob = false) {
    const scope = `repository:${repositoryPath(repository)}:pull`
    const token = this.tokens.get(scope)
    const headers = { Accept: ACCEPT, ...(token ? { Authorization: `Bearer ${token}` } : this.basic ? { Authorization: this.basic } : {}) }
    let response = await this.fetchUrl(url, headers, blob)
    if (response.status === 401) {
      const challenge = response.headers.get('www-authenticate') || ''
      await response.body?.cancel()
      if (!/^Bearer\s/i.test(challenge)) throw new Error('Не удалось авторизоваться в Docker Registry')
      const fields = Object.fromEntries([...challenge.matchAll(/([a-z_]+)="([^"]*)"/gi)].map(match => [match[1].toLowerCase(), match[2]]))
      const realm = new URL(fields.realm)
      if (!this.authOrigins.has(realm.origin) || (realm.protocol !== 'https:' && realm.origin !== this.base.origin) || realm.username || realm.password) throw new Error('Сервер авторизации реестра не разрешён')
      realm.searchParams.set('scope', scope)
      if (fields.service) realm.searchParams.set('service', fields.service)
      const auth = await this.fetchUrl(realm, this.basic ? { Authorization: this.basic } : {})
      if (!auth.ok) { await auth.body?.cancel(); throw new Error('Ошибка авторизации в Docker Registry') }
      const result = checkedJson(await bytes(auth, 65536))
      const accessToken = result.token || result.access_token
      if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 32768) throw new Error('Реестр не вернул токен доступа')
      this.tokens.set(scope, accessToken)
      response = await this.fetchUrl(url, { Accept: ACCEPT, Authorization: `Bearer ${accessToken}` }, blob)
    }
    if (!response.ok) {
      const status = response.status
      await response.body?.cancel()
      throw Object.assign(new Error('Docker Registry недоступен или отказал в запросе'), { status })
    }
    return response
  }

  async tags(repository) {
    let url = this.endpoint(repository, 'tags/list?n=1000')
    const prefix = this.endpoint(repository, 'tags/list').pathname
    const tags = new Set()
    const seen = new Set()
    for (let page = 0; url && page < 50; page++) {
      if (url.origin !== this.base.origin || url.pathname !== prefix || seen.has(url.href)) throw new Error('Некорректная пагинация реестра')
      seen.add(url.href)
      const response = await this.request(url, repository)
      const list = checkedJson(await bytes(response))
      if (list.tags !== null && !Array.isArray(list.tags)) throw new Error('Некорректный список тегов реестра')
      for (const tag of list.tags || []) if (typeof tag === 'string' && tag.length <= 128 && VERSION.test(tag)) tags.add(tag)
      const link = response.headers.get('link')
      const next = link?.match(/<([^>]+)>;\s*rel="?next"?/i)?.[1]
      url = next ? new URL(next, url) : null
    }
    if (url) throw new Error('Превышен предел страниц каталога реестра')
    return tags
  }

  async manifest(repository, reference) {
    const response = await this.request(this.endpoint(repository, `manifests/${encodeURIComponent(reference)}`), repository)
    const data = await bytes(response)
    const digest = `sha256:${createHash('sha256').update(data).digest('hex')}`
    if (response.headers.get('docker-content-digest') && response.headers.get('docker-content-digest') !== digest) throw new Error('Digest манифеста реестра не совпадает')
    if (reference.startsWith('sha256:') && reference !== digest) throw new Error('Реестр вернул другой манифест')
    return { manifest: checkedJson(data), digest }
  }

  async image(repository, version) {
    const root = await this.manifest(repository, version)
    let manifest = root.manifest
    if (Array.isArray(manifest.manifests)) {
      const [os, architecture] = this.platform.split('/')
      const candidates = manifest.manifests.filter(item => item.platform?.os === os && item.platform?.architecture === architecture)
      if (candidates.length !== 1 || !DIGEST.test(candidates[0].digest)) return null
      manifest = (await this.manifest(repository, candidates[0].digest)).manifest
    }
    if (!DIGEST.test(manifest.config?.digest || '')) return null
    const key = `${repository}@${manifest.config.digest}`
    let config = this.configs.get(key)
    if (!config) {
      const response = await this.request(this.endpoint(repository, `blobs/${manifest.config.digest}`), repository, true)
      config = checkedJson(await bytes(response), manifest.config.digest)
      if (this.configs.size > 1000) this.configs.clear()
      this.configs.set(key, config)
    }
    if (`${config.os}/${config.architecture}` !== this.platform) return null
    const labels = config.config?.Labels || {}
    const commit = labels['org.opencontainers.image.revision']
    if (labels['org.opencontainers.image.version'] !== version || !/^[a-f0-9]{7,40}$/.test(commit || '')) return null
    return { image: `${repository}@${root.digest}`, commit }
  }

  async discover(repositories) {
    const [front, back] = await Promise.all([this.tags(repositories.frontend), this.tags(repositories.backend)])
    const versions = [...front].filter(version => back.has(version)).sort(compareVersions).slice(0, this.limit)
    const releases = []
    for (let offset = 0; offset < versions.length; offset += 4) {
      const found = await Promise.all(versions.slice(offset, offset + 4).map(async version => {
        try {
          const [frontend, backend] = await Promise.all([this.image(repositories.frontend, version), this.image(repositories.backend, version)])
          if (!frontend || !backend || frontend.commit !== backend.commit) return null
          return validateRelease({ version, commit: frontend.commit, frontend: frontend.image, backend: backend.image }, repositories)
        } catch (error) { if (error.status === 404) return null; throw error }
      }))
      releases.push(...found.filter(Boolean))
    }
    return releases
  }
}

export async function dockerCredentials(env, repository) {
  if (env.DEPLOY_REGISTRY_USERNAME) return { username: env.DEPLOY_REGISTRY_USERNAME, password: env.DEPLOY_REGISTRY_PASSWORD || '' }
  const host = new URL(env.DEPLOY_REGISTRY_URL || registryOrigin(repository)).host
  let config
  try { config = JSON.parse(await readFile(path.join(env.DOCKER_CONFIG || '/root/.docker', 'config.json'), 'utf8')) } catch { return {} }
  const entry = config.auths?.[registryServer(repository)] || config.auths?.[host] || (host === 'registry-1.docker.io' ? config.auths?.['https://index.docker.io/v1/'] : null)
  if (!entry?.auth) return {}
  const decoded = Buffer.from(entry.auth, 'base64').toString('utf8')
  const index = decoded.indexOf(':')
  return index < 0 ? {} : { username: decoded.slice(0, index), password: decoded.slice(index + 1) }
}

import { it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { RegistryClient, compareVersions, repositoryPath, registryServer, registryOrigin } from '../deployment/registry.js'

const servers = []
afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) } })
const hash = data => `sha256:${createHash('sha256').update(data).digest('hex')}`
const repositories = { frontend: 'example/frontend', backend: 'example/backend' }

async function fixture({ auth, badDigest = false, paginated = false, foreignNext, missing = false, mismatch = false, redirectBlob, platform = 'linux/amd64' } = {}) {
  const manifests = new Map()
  const blobs = new Map()
  for (const repo of Object.values(repositories)) {
    for (const version of ['2.4.9', '2.4.10', '2.4.11']) {
      const commit = mismatch && version === '2.4.11' && repo.endsWith('backend') ? 'bbbbbbb' : 'aaaaaaa'
      const config = JSON.stringify({ os: platform.split('/')[0], architecture: platform.split('/')[1], config: { Labels: { 'org.opencontainers.image.version': version, 'org.opencontainers.image.revision': commit } } })
      blobs.set(hash(config), config)
      const manifest = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { digest: hash(config) } })
      manifests.set(`${repo}@${hash(manifest)}`, manifest)
      const index = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: [{ digest: hash(manifest), platform: { os: platform.split('/')[0], architecture: platform.split('/')[1] } }] })
      manifests.set(`${repo}:${version}`, index)
    }
  }
  const requests = []
  let origin
  const server = createServer((req, res) => {
    const url = new URL(req.url, origin)
    requests.push({ path: url.pathname, authorization: req.headers.authorization })
    res.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/token') { res.end('{"token":"test-token"}'); return }
    if (auth === 'basic' && req.headers.authorization !== `Basic ${Buffer.from('user:private').toString('base64')}`) { res.writeHead(401); res.end('{}'); return }
    if (auth === 'bearer' && req.headers.authorization !== 'Bearer test-token') {
      res.writeHead(401, { 'WWW-Authenticate': `Bearer realm="${origin}/token",service="registry"` }); res.end('{}'); return
    }
    const match = url.pathname.match(/^\/v2\/(example\/(?:frontend|backend))\/(tags\/list|manifests\/(.+)|blobs\/(.+))$/)
    if (!match) { res.writeHead(404); res.end('{}'); return }
    const [, repo, action, encodedReference, digest] = match
    if (action === 'tags/list') {
      let tags = missing && repo.endsWith('backend') ? ['2.4.9', '2.4.11'] : ['latest', '2.4.9', '2.4.10', '2.4.11', '2.4.12-rc.1']
      if (foreignNext) res.setHeader('Link', `<${foreignNext}>; rel="next"`)
      if (paginated && !url.searchParams.has('last')) { tags = ['2.4.9']; res.setHeader('Link', `</v2/${repo}/tags/list?n=1000&last=2.4.9>; rel="next"`) }
      res.end(JSON.stringify({ name: repo, tags })); return
    }
    if (encodedReference) {
      const reference = decodeURIComponent(encodedReference)
      const data = manifests.get(`${repo}${reference.startsWith('sha256:') ? '@' : ':'}${reference}`)
      if (!data) { res.writeHead(404); res.end('{}'); return }
      res.setHeader('Docker-Content-Digest', badDigest ? `sha256:${'0'.repeat(64)}` : hash(data))
      res.end(data); return
    }
    if (redirectBlob) { res.writeHead(307, { Location: redirectBlob }); res.end(); return }
    const data = blobs.get(digest)
    if (!data) { res.writeHead(404); res.end('{}'); return }
    res.end(data)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  origin = `http://127.0.0.1:${server.address().port}`
  const client = new RegistryClient({ url: origin, allowHttp: true, ...(auth === 'basic' ? { username: 'user', password: 'private' } : {}) })
  return { client, requests, origin, blobs }
}

it('обнаруживает готовые пары через Registry V2 и сортирует версии численно', async () => {
  const { client } = await fixture({ paginated: true })
  const releases = await client.discover(repositories)
  assert.deepEqual(releases.map(release => release.version), ['2.4.11', '2.4.10', '2.4.9'])
  assert.ok(releases.every(release => release.commit === 'aaaaaaa' && release.backend.startsWith('example/backend@sha256:')))
  assert.equal(compareVersions('10.0.0', '2.99.999'), -1)
  assert.equal(compareVersions('2.4.10', '2.4.10-rc.1'), -1)
  assert.equal(compareVersions('2.4.10-rc.2', '2.4.10-rc.10'), 1)
})

it('не предлагает недопубликованные пары, prerelease, latest и образы разных коммитов', async () => {
  const { client } = await fixture({ missing: true, mismatch: true })
  assert.deepEqual((await client.discover(repositories)).map(release => release.version), ['2.4.9'])
})

it('поддерживает Basic-авторизацию Nexus', async () => {
  const { client, requests } = await fixture({ auth: 'basic' })
  assert.equal((await client.discover(repositories)).length, 3)
  assert.ok(requests.every(request => request.authorization?.startsWith('Basic ')))
})

it('поддерживает обмен Bearer-токеном Registry без GitHub', async () => {
  const { client, requests } = await fixture({ auth: 'bearer' })
  assert.equal((await client.discover(repositories)).length, 3)
  assert.ok(requests.some(request => request.path === '/token'))
  assert.ok(!requests.some(request => request.path.includes('github')))
})

it('отклоняет подменённые манифесты и неподходящую архитектуру', async () => {
  const corrupt = await fixture({ badDigest: true })
  await assert.rejects(corrupt.client.discover(repositories), /Digest/)
  const arm = await fixture({ platform: 'linux/arm64' })
  assert.deepEqual(await arm.client.discover(repositories), [])
})

it('не отправляет секреты на адрес из чужой ссылки пагинации или неразрешённый auth realm', async () => {
  const { client } = await fixture({ foreignNext: 'http://untrusted.example/v2/example/frontend/tags/list' })
  await assert.rejects(client.tags(repositories.frontend), /пагинация/)
  let count = 0
  const custom = new RegistryClient({ url: 'https://registry.example', username: 'user', password: 'private', fetchImpl: async () => {
    count++
    return new Response('{}', { status: 401, headers: { 'www-authenticate': 'Bearer realm="https://untrusted.example/token"' } })
  } })
  await assert.rejects(custom.tags(repositories.frontend), /не разрешён/)
  assert.equal(count, 1)
})

it('не пересылает Authorization при перенаправлении blob на другой origin', async () => {
  const calls = []
  const client = new RegistryClient({ url: 'https://registry.example', username: 'user', password: 'private', fetchImpl: async (url, options) => {
    calls.push({ url: String(url), headers: options.headers })
    return calls.length === 1 ? new Response(null, { status: 307, headers: { location: 'https://storage.example/config' } }) : new Response('{}')
  } })
  await client.request(new URL('https://registry.example/v2/example/frontend/blobs/sha256:abc'), repositories.frontend, true)
  assert.ok(calls[0].headers.Authorization)
  assert.equal(calls[1].headers.Authorization, undefined)
})

it('проверяет hash конфигурации, а не доверяет только меткам из ответа', async () => {
  const { client, blobs } = await fixture()
  for (const key of blobs.keys()) blobs.set(key, '{}')
  await assert.rejects(client.discover(repositories), /Контрольная сумма/)
})

it('не допускает HTTP без явного разрешения и небезопасные имена репозиториев', () => {
  assert.throws(() => new RegistryClient({ url: 'http://registry.example' }))
  assert.throws(() => repositoryPath('registry.example/../private'))
  assert.equal(repositoryPath('nexus.example:5000/vatai12/worker-cabinet-backend'), 'vatai12/worker-cabinet-backend')
  assert.equal(registryServer('nexus.example:443/vatai12/backend'), 'nexus.example:443')
  assert.equal(registryOrigin('docker.io/vatai12/backend'), 'https://registry-1.docker.io')
})

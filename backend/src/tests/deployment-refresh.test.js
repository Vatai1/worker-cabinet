import { it } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createDeploymentRouter } from '../routes/deployment.js'

it('автопоиск доступен только суперадминистратору и не создаёт задание обновления', async () => {
  let requested = false
  const writes = []
  const database = { query: async (sql) => {
    if (sql.startsWith('UPDATE')) { writes.push(sql); requested = true; return { rows: [] } }
    if (sql.includes('FROM deployment_state')) return { rows: [{ settings: {}, heartbeat_at: new Date(), observed: {}, catalog_error: null, host_error: null, catalog_refresh_requested: requested, catalog_checked_at: '2026-11-26T01:00:00Z', catalog_source: 'https://nexus.example' }] }
    return { rows: [] }
  } }
  const app = express()
  app.use(express.json())
  app.use(createDeploymentRouter({ database, authenticate: (req, res, next) => {
    if (!req.headers['x-role']) return res.status(401).json({ error: 'Требуется авторизация' })
    req.user = { id: 1, role: req.headers['x-role'] }
    if (req.headers['x-impersonated']) req.realUser = { id: 2 }
    next()
  } }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    for (const role of [null, 'employee', 'manager', 'hr', 'admin']) {
      const response = await fetch(`${base}/refresh`, { method: 'POST', headers: role ? { 'x-role': role } : {} })
      assert.equal(response.status, role ? 403 : 401)
    }
    const impersonated = await fetch(`${base}/refresh`, { method: 'POST', headers: { 'x-role': 'superadmin', 'x-impersonated': 'true' } })
    assert.equal(impersonated.status, 403)
    assert.equal(writes.length, 0)
    const response = await fetch(`${base}/refresh`, { method: 'POST', headers: { 'x-role': 'superadmin' } })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { catalog_refresh_requested: true })
    const state = await (await fetch(base, { headers: { 'x-role': 'superadmin' } })).json()
    assert.equal(state.catalog_source, 'https://nexus.example')
    assert.equal(state.catalog_checked_at, '2026-11-26T01:00:00Z')
    assert.equal(state.catalog_refresh_requested, true)
    assert.ok(writes.every(sql => sql.startsWith('UPDATE deployment_state')))
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})

import { randomUUID } from 'node:crypto'
import { ACTIVE_STATUSES } from './validation.js'
import { compareVersions } from './registry.js'

export const DEPLOY_LOCK = 187431502

export class DeploymentStore {
  constructor(db) { this.db = db }

  async state() {
    return (await this.db.query('SELECT * FROM deployment_state WHERE id = 1')).rows[0]
  }

  async releases() {
    return (await this.db.query('SELECT manifest FROM deployment_releases WHERE available ORDER BY published_at DESC, version DESC')).rows.map(row => row.manifest).sort((left, right) => compareVersions(left.version, right.version))
  }

  async jobs() {
    return (await this.db.query('SELECT * FROM deployment_jobs ORDER BY created_at DESC LIMIT 30')).rows
  }

  async event(id, stage, status, message) {
    const event = { stage, status, message, at: new Date().toISOString() }
    await this.db.query('UPDATE deployment_jobs SET stage = $2, events = events || $3::jsonb, updated_at = NOW() WHERE id = $1', [id, stage, JSON.stringify([event])])
  }

  async audit(client, user, action, id, details, ip) {
    await client.query(`INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, details, ip_address)
      VALUES ($1, $2, $3, 'deployment', $4, $5, $6)`, [user.id, [user.last_name, user.first_name].filter(Boolean).join(' '), action, id, JSON.stringify(details), ip || null])
  }

  async enqueue(client, user, version, ip) {
    await client.query('BEGIN')
    try {
      const state = (await client.query('SELECT * FROM deployment_state WHERE id = 1 FOR UPDATE')).rows[0]
      const active = (await client.query('SELECT * FROM deployment_jobs WHERE status = ANY($1::text[])', [ACTIVE_STATUSES])).rows[0]
      if (active) {
        if (active.release.version === version && active.status !== 'recovery_required') {
          await client.query('COMMIT')
          return { job: active, created: false }
        }
        throw Object.assign(new Error('Уже выполняется обновление или требуется восстановление предыдущего запуска'), { statusCode: 409 })
      }
      if (!state.settings.enabled) throw new Error('Обновление прода отключено в настройках')
      if (!state.heartbeat_at || Date.now() - new Date(state.heartbeat_at).getTime() > 30000 || state.catalog_error || state.host_error) throw Object.assign(new Error('Сервис деплоя, серверы или каталог релизов недоступны'), { statusCode: 503 })
      const release = (await client.query('SELECT manifest FROM deployment_releases WHERE version = $1 AND available', [version])).rows[0]?.manifest
      if (!release) throw new Error('Выбранный релиз не опубликован')
      const job = (await client.query(`INSERT INTO deployment_jobs (id, release, settings, initiated_by)
        VALUES ($1, $2, $3, $4) RETURNING *`, [randomUUID(), release, state.settings, user.id])).rows[0]
      await this.audit(client, user, 'deployment_start', job.id, { version }, ip)
      await client.query('COMMIT')
      return { job, created: true }
    } catch (error) { await client.query('ROLLBACK'); throw error }
  }
}

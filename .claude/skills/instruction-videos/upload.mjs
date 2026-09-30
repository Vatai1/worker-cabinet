import fs from 'node:fs'
import path from 'node:path'

const API = process.env.VIDEO_API_URL || 'http://localhost:5000/api'
const EMAIL = process.env.VIDEO_ADMIN_EMAIL || 'superadmin@example.com'
const PASSWORD = process.env.VIDEO_ADMIN_PASSWORD || 'password123'

const args = {}
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
for (const key of ['placement', 'audience', 'title', 'video', 'poster']) {
  if (!args[key]) throw new Error(`не указан --${key}`)
}

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!login.ok) throw new Error(`login ${login.status}: ${await login.text()}`)
const { token } = await login.json()
const auth = { Authorization: `Bearer ${token}` }

const existing = (await (await fetch(`${API}/instructions/admin`, { headers: auth })).json())
  .find((v) => v.placement === args.placement)

const file = (p, type) => new Blob([fs.readFileSync(p)], { type })
const form = new FormData()
form.append('title', args.title)
form.append('description', args.description || '')
form.append('audience', args.audience)
form.append('placement', args.placement)
if (args.sort) form.append('sortOrder', args.sort)
form.append('isActive', 'true')
form.append('video', file(args.video, 'video/mp4'), path.basename(args.video))
form.append('poster', file(args.poster, 'image/jpeg'), path.basename(args.poster))

const res = await fetch(`${API}/instructions/admin${existing ? `/${existing.id}` : ''}`, {
  method: existing ? 'PUT' : 'POST',
  headers: auth,
  body: form,
})
const body = await res.json().catch(() => null)
if (!res.ok) throw new Error(`upload ${res.status}: ${JSON.stringify(body)}`)
console.log(`${existing ? 'обновлено' : 'создано'}: #${body.id} «${body.title}» (${args.placement}, ${args.audience})`)

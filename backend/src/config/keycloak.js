const config = {
  url: process.env.KEYCLOAK_URL || 'http://localhost:8081',
  publicUrl: process.env.KEYCLOAK_PUBLIC_URL || process.env.KEYCLOAK_URL || 'http://localhost:8081',
  realm: process.env.KEYCLOAK_REALM || 'worker-cabinet',
  clientId: process.env.KEYCLOAK_CLIENT_ID || 'worker-cabinet',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  enabled: !!process.env.KEYCLOAK_URL,
}

export function getIssuer() {
  return `${config.url}/realms/${config.realm}`
}

export function getJwksUrl() {
  return `${getIssuer()}/protocol/openid-connect/certs`
}

export function getTokenEndpoint() {
  return `${getIssuer()}/protocol/openid-connect/token`
}

export function getPublicAuthUrl() {
  return `${config.publicUrl}/realms/${config.realm}/protocol/openid-connect/auth`
}

export function getPublicLogoutUrl(redirectUri) {
  return `${config.publicUrl}/realms/${config.realm}/protocol/openid-connect/logout?client_id=${config.clientId}&post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`
}

export function getAuthUrl() {
  return `${getIssuer()}/protocol/openid-connect/auth`
}

export function getLogoutUrl(redirectUri) {
  return `${getIssuer()}/protocol/openid-connect/logout?client_id=${config.clientId}&post_logout_redirect_uri=${encodeURIComponent(redirectUri)}`
}

export default config

let kcAdminToken = null
let kcAdminTokenExpiry = 0

async function getKcAdminToken() {
  if (kcAdminToken && Date.now() < kcAdminTokenExpiry) return kcAdminToken
  const res = await fetch(getTokenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  })
  if (!res.ok) throw new Error('Failed to get KC admin token')
  const data = await res.json()
  kcAdminToken = data.access_token
  kcAdminTokenExpiry = Date.now() + (data.expires_in - 10) * 1000
  return kcAdminToken
}

async function getKcUserId(guid) {
  const token = await getKcAdminToken()
  const res = await fetch(
    `${getIssuer()}/admin/realms/${config.realm}/users?exact=true&q=${encodeURIComponent(guid)}&fields=id`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
    console.error('[kc] search user by guid failed:', res.status)
    return null
  }
  const users = await res.json()
  if (!users.length) return null
  return users[0].id
}

async function updateKcUserRole(guid, newRole) {
  if (!config.enabled) return
  try {
    const userId = await getKcUserId(guid)
    if (!userId) { console.warn('[kc] user not found, guid:', guid); return }
    const token = await getKcAdminToken()
    const base = `${getIssuer()}/admin/realms/${config.realm}/users/${userId}/role-mappings/realm`

    const rolesRes = await fetch(`${getIssuer()}/admin/realms/${config.realm}/roles`, { headers: { Authorization: `Bearer ${token}` } })
    if (!rolesRes.ok) { console.error('[kc] failed to fetch realm roles'); return }
    const allRoles = await rolesRes.json()
    const removeBody = allRoles.map(r => ({ id: r.id, name: r.name }))

    const addRes = await fetch(`${getIssuer()}/admin/realms/${config.realm}/roles/${newRole}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!addRes.ok) { console.error('[kc] role not found:', newRole); return }
    const roleDef = await addRes.json()

    await fetch(base, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(removeBody),
    })

    const assignRes = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: roleDef.id, name: roleDef.name }]),
    })
    if (!assignRes.ok) console.error('[kc] failed to assign role:', assignRes.status)
    console.log('[kc] updated role to', newRole, 'for user', guid)
  } catch (err) {
    console.error('[kc] updateKcUserRole error:', err.message)
  }
}

export { getKcAdminToken, getKcUserId, updateKcUserRole }

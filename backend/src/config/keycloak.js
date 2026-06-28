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
  const masterTokenUrl = `${config.url}/realms/master/protocol/openid-connect/token`
  const res = await fetch(masterTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin123',
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
    `${getIssuer()}/admin/realms/${config.realm}/users?exact=true&q=${encodeURIComponent(guid)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
    console.error('[kc] search user failed:', res.status)
    return null
  }
  const users = await res.json()
  if (!users.length) return null
  return users[0].id
}

async function getKcUserIdByEmail(email) {
  const token = await getKcAdminToken()
  const res = await fetch(
    `${getIssuer()}/admin/realms/${config.realm}/users?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
    console.error('[kc] search by email failed:', res.status)
    return null
  }
  const users = await res.json()
  if (!users.length) return null
  return users[0].id
}

const KC_CUSTOM_ROLES = ['employee', 'manager', 'hr', 'admin', 'onboarding']

async function updateKcUserRole(kcUserId, newRole) {
  if (!config.enabled) return
  try {
    const token = await getKcAdminToken()
    const rolesUrl = `${config.url}/admin/realms/${config.realm}/roles`
    const userRolesUrl = `${config.url}/admin/realms/${config.realm}/users/${kcUserId}/role-mappings/realm`

    const rolesRes = await fetch(rolesUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!rolesRes.ok) { console.error('[kc] failed to fetch realm roles'); return }
    const allRoles = await rolesRes.json()

    const userRolesRes = await fetch(userRolesUrl, { headers: { Authorization: `Bearer ${token}` } })
    const userCurrentRoles = userRolesRes.ok ? await userRolesRes.json() : []

    const KC_DEFAULT_ROLES = [`default-roles-${config.realm}`, 'offline_access', 'uma_authorization']
    const removeBody = allRoles
      .filter(r =>
        KC_CUSTOM_ROLES.includes(r.name) ||
        (userCurrentRoles.some(ur => ur.name === r.name) && !KC_DEFAULT_ROLES.includes(r.name))
      )
      .map(r => ({ id: r.id, name: r.name }))

    if (removeBody.length > 0) {
      await fetch(userRolesUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(removeBody),
      })
    }

    let roleDef = allRoles.find(r => r.name === newRole)
    if (!roleDef) {
      const createRes = await fetch(rolesUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRole }),
      })
      if (!createRes.ok) { console.error('[kc] failed to create role:', newRole, createRes.status); return }
      const fetchRes = await fetch(`${rolesUrl}/${encodeURIComponent(newRole)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!fetchRes.ok) { console.error('[kc] failed to fetch created role:', newRole); return }
      roleDef = await fetchRes.json()
    }

    const assignRes = await fetch(userRolesUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: roleDef.id, name: roleDef.name }]),
    })
    if (!assignRes.ok) console.error('[kc] failed to assign role:', assignRes.status)
    console.log('[kc] updated role to', newRole, 'for user', kcUserId)
  } catch (err) {
    console.error('[kc] updateKcUserRole error:', err.message)
  }
}

async function updateKcUserProfile(kcGuid, { firstName, lastName, email }) {
  if (!config.enabled) return
  try {
    const token = await getKcAdminToken()
    const res = await fetch(
      `${config.url}/admin/realms/${config.realm}/users/${kcGuid}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email }),
      }
    )
    if (!res.ok) { console.error('[kc] failed to update profile:', kcGuid, res.status); return }
    console.log('[kc] updated profile for', kcGuid)
  } catch (err) {
    console.error('[kc] updateKcUserProfile error:', err.message)
  }
}

async function setKcUserEnabled(kcGuid, enabled) {
  if (!config.enabled) return
  try {
    const token = await getKcAdminToken()
    const res = await fetch(
      `${config.url}/admin/realms/${config.realm}/users/${kcGuid}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }
    )
    if (!res.ok) { console.error('[kc] failed to set enabled:', kcGuid, res.status); return }
    console.log('[kc] set enabled =', enabled, 'for', kcGuid)
  } catch (err) {
    console.error('[kc] setKcUserEnabled error:', err.message)
  }
}

async function resetKcUserPassword(kcGuid, newPassword) {
  if (!config.enabled) return
  try {
    const token = await getKcAdminToken()
    const res = await fetch(
      `${config.url}/admin/realms/${config.realm}/users/${kcGuid}/reset-password`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'password', value: newPassword, temporary: false }),
      }
    )
    if (!res.ok) { console.error('[kc] failed to reset password:', kcGuid, res.status); return }
    console.log('[kc] reset password for', kcGuid)
  } catch (err) {
    console.error('[kc] resetKcUserPassword error:', err.message)
  }
}

async function deleteKcRole(roleName) {
  if (!config.enabled) return
  try {
    const token = await getKcAdminToken()
    const res = await fetch(
      `${config.url}/admin/realms/${config.realm}/roles/${encodeURIComponent(roleName)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok && res.status !== 404) {
      console.error('[kc] failed to delete role:', roleName, res.status)
      return
    }
    console.log('[kc] deleted role', roleName)
  } catch (err) {
    console.error('[kc] deleteKcRole error:', err.message)
  }
}

export { getKcAdminToken, getKcUserId, getKcUserIdByEmail, updateKcUserRole, deleteKcRole, updateKcUserProfile, setKcUserEnabled, resetKcUserPassword }

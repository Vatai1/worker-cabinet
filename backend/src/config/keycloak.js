const config = {
  url: (process.env.KEYCLOAK_URL || 'http://localhost:8081').replace(/\/+$/, ''),
  publicUrl: (process.env.KEYCLOAK_PUBLIC_URL || process.env.KEYCLOAK_URL || 'http://localhost:8081').replace(/\/+$/, ''),
  realm: process.env.KEYCLOAK_REALM || 'worker-cabinet',
  clientId: process.env.KEYCLOAK_CLIENT_ID || 'worker-cabinet',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  enabled: !!process.env.KEYCLOAK_URL,
}

function kcLog(...args) { console.log('[KC]', ...args) }
function kcErr(...args) { console.error('[KC]', ...args) }

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
  if (kcAdminToken && Date.now() < kcAdminTokenExpiry) {
    kcLog('admin token: cached, expires in', Math.round((kcAdminTokenExpiry - Date.now()) / 1000), 's')
    return kcAdminToken
  }
  const masterTokenUrl = `${config.url}/realms/master/protocol/openid-connect/token`
  kcLog('admin token: requesting from', masterTokenUrl)
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
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    kcErr('admin token: failed', res.status, body)
    throw new Error('Failed to get KC admin token')
  }
  const data = await res.json()
  kcAdminToken = data.access_token
  kcAdminTokenExpiry = Date.now() + (data.expires_in - 10) * 1000
  kcLog('admin token: acquired, expires_in=', data.expires_in, 's, token_type=', data.token_type)
  return kcAdminToken
}

async function getKcUserId(guid) {
  kcLog('admin: search user by attribute guid =', guid)
  const token = await getKcAdminToken()
  const res = await fetch(
    `${getIssuer()}/admin/realms/${config.realm}/users?exact=true&q=${encodeURIComponent(guid)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
    kcErr('admin: search user by guid failed:', res.status)
    return null
  }
  const users = await res.json()
  if (!users.length) {
    kcLog('admin: user not found by guid', guid)
    return null
  }
  kcLog('admin: found user by guid', guid, '→ kcUserId=', users[0].id, 'username=', users[0].username)
  return users[0].id
}

async function getKcUserIdByEmail(email) {
  kcLog('admin: search user by email =', email)
  const token = await getKcAdminToken()
  const res = await fetch(
    `${getIssuer()}/admin/realms/${config.realm}/users?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
    kcErr('admin: search by email failed:', res.status)
    return null
  }
  const users = await res.json()
  if (!users.length) {
    kcLog('admin: user not found by email', email)
    return null
  }
  kcLog('admin: found user by email', email, '→ kcUserId=', users[0].id, 'username=', users[0].username)
  return users[0].id
}

const KC_CUSTOM_ROLES = ['employee', 'manager', 'hr', 'admin', 'onboarding']

async function updateKcUserRole(kcUserId, newRole) {
  if (!config.enabled) return
  kcLog('admin: update role for kcUserId=', kcUserId, 'newRole=', newRole)
  try {
    const token = await getKcAdminToken()
    const rolesUrl = `${config.url}/admin/realms/${config.realm}/roles`
    const userRolesUrl = `${config.url}/admin/realms/${config.realm}/users/${kcUserId}/role-mappings/realm`

    const rolesRes = await fetch(rolesUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!rolesRes.ok) { kcErr('admin: failed to fetch realm roles:', rolesRes.status); return }
    const allRoles = await rolesRes.json()
    kcLog('admin: realm roles available:', allRoles.map(r => r.name).join(','))

    const userRolesRes = await fetch(userRolesUrl, { headers: { Authorization: `Bearer ${token}` } })
    const userCurrentRoles = userRolesRes.ok ? await userRolesRes.json() : []
    kcLog('admin: current roles of user:', userCurrentRoles.map(r => r.name).join(','))

    const KC_DEFAULT_ROLES = [`default-roles-${config.realm}`, 'offline_access', 'uma_authorization']
    const removeBody = allRoles
      .filter(r =>
        KC_CUSTOM_ROLES.includes(r.name) ||
        (userCurrentRoles.some(ur => ur.name === r.name) && !KC_DEFAULT_ROLES.includes(r.name))
      )
      .map(r => ({ id: r.id, name: r.name }))

    if (removeBody.length > 0) {
      kcLog('admin: removing roles:', removeBody.map(r => r.name).join(','))
      await fetch(userRolesUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(removeBody),
      })
    }

    let roleDef = allRoles.find(r => r.name === newRole)
    if (!roleDef) {
      kcLog('admin: role', newRole, 'does not exist, creating')
      const createRes = await fetch(rolesUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRole }),
      })
      if (!createRes.ok) { kcErr('admin: failed to create role:', newRole, createRes.status); return }
      const fetchRes = await fetch(`${rolesUrl}/${encodeURIComponent(newRole)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!fetchRes.ok) { kcErr('admin: failed to fetch created role:', newRole); return }
      roleDef = await fetchRes.json()
    }

    const assignRes = await fetch(userRolesUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: roleDef.id, name: roleDef.name }]),
    })
    if (!assignRes.ok) {
      kcErr('admin: failed to assign role:', assignRes.status)
    } else {
      kcLog('admin: role assigned:', newRole, '→ kcUserId=', kcUserId)
    }
  } catch (err) {
    kcErr('admin: updateKcUserRole error:', err.message)
  }
}

async function updateKcUserProfile(kcGuid, { firstName, lastName, email }) {
  if (!config.enabled) return
  kcLog('admin: update profile for kcGuid=', kcGuid, '{ firstName:', firstName, 'lastName:', lastName, 'email:', email, '}')
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
    if (!res.ok) {
      kcErr('admin: failed to update profile:', kcGuid, res.status)
    } else {
      kcLog('admin: profile updated for kcGuid=', kcGuid)
    }
  } catch (err) {
    kcErr('admin: updateKcUserProfile error:', err.message)
  }
}

async function setKcUserEnabled(kcGuid, enabled) {
  if (!config.enabled) return
  kcLog('admin: set enabled =', enabled, 'for kcGuid=', kcGuid)
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
    if (!res.ok) {
      kcErr('admin: failed to set enabled:', kcGuid, res.status)
    } else {
      kcLog('admin: enabled =', enabled, 'applied to kcGuid=', kcGuid)
    }
  } catch (err) {
    kcErr('admin: setKcUserEnabled error:', err.message)
  }
}

async function resetKcUserPassword(kcGuid, newPassword) {
  if (!config.enabled) return
  kcLog('admin: reset password for kcGuid=', kcGuid)
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
    if (!res.ok) {
      kcErr('admin: failed to reset password:', kcGuid, res.status)
    } else {
      kcLog('admin: password reset for kcGuid=', kcGuid)
    }
  } catch (err) {
    kcErr('admin: resetKcUserPassword error:', err.message)
  }
}

async function unlockKcUser(kcGuid) {
  if (!config.enabled) return
  kcLog('admin: unlock user kcGuid=', kcGuid)
  try {
    const token = await getKcAdminToken()
    const delRes = await fetch(
      `${config.url}/admin/realms/${config.realm}/attack-detection/brute-force/users/${kcGuid}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
    kcLog('admin: brute-force reset status=', delRes.status, 'for kcGuid=', kcGuid)
    const enableRes = await fetch(
      `${config.url}/admin/realms/${config.realm}/users/${kcGuid}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }
    )
    kcLog('admin: enable status=', enableRes.status, 'for kcGuid=', kcGuid)
  } catch (err) {
    kcErr('admin: unlockKcUser error:', err.message)
  }
}

async function deleteKcRole(roleName) {
  if (!config.enabled) return
  kcLog('admin: delete role', roleName)
  try {
    const token = await getKcAdminToken()
    const res = await fetch(
      `${config.url}/admin/realms/${config.realm}/roles/${encodeURIComponent(roleName)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok && res.status !== 404) {
      kcErr('admin: failed to delete role:', roleName, res.status)
      return
    }
    kcLog('admin: role deleted:', roleName, 'status=', res.status)
  } catch (err) {
    kcErr('admin: deleteKcRole error:', err.message)
  }
}

export { getKcAdminToken, getKcUserId, getKcUserIdByEmail, updateKcUserRole, deleteKcRole, updateKcUserProfile, setKcUserEnabled, resetKcUserPassword, unlockKcUser }

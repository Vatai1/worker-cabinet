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

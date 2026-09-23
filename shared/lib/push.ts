import { API_BASE_URL } from '@/shared/lib/api'
import { getAuthHeaders, getAuthHeadersWithContentType } from '@/shared/lib/authHeaders'

export interface PushConfig {
  enabled: boolean
  publicKey: string
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export async function fetchPushConfig(): Promise<PushConfig> {
  const res = await fetch(`${API_BASE_URL}/push/config`, { headers: getAuthHeaders() })
  if (!res.ok) return { enabled: false, publicKey: '' }
  return res.json()
}

export async function fetchPushStatus(): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/push/status`, { headers: getAuthHeaders() })
  if (!res.ok) return false
  const data = await res.json()
  return Boolean(data.subscribed)
}

export async function isSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub !== null
}

export async function subscribePush(publicKey: string): Promise<void> {
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker не поддерживается')
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  })
  const json = subscription.toJSON()
  await fetch(`${API_BASE_URL}/push/subscribe`, {
    method: 'POST',
    headers: getAuthHeadersWithContentType(),
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  })
}

export async function unsubscribePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const subscription = await reg.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await fetch(`${API_BASE_URL}/push/unsubscribe`, {
    method: 'POST',
    headers: getAuthHeadersWithContentType(),
    body: JSON.stringify({ endpoint }),
  })
}

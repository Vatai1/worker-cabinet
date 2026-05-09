import { createAvatar } from '@dicebear/core'
import { notionistsNeutral } from '@dicebear/collection'

export function generateAvatarUrl(userId: string, _gender?: 'male' | 'female' | 'other'): string {
  const svg = createAvatar(notionistsNeutral, { seed: userId }).toString()
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

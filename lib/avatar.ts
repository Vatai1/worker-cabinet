import { createAvatar } from '@dicebear/core'
import { notionists, notionistsNeutral } from '@dicebear/collection'

export function generateAvatarUrl(userId: string, gender?: 'male' | 'female' | 'other'): string {
  if (!gender || gender === 'other') {
    const svg = createAvatar(notionistsNeutral, { seed: userId }).toString()
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  }

  const svg = createAvatar(notionists, { seed: userId }).toString()
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function searchTokens(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}

export function wordPrefixIndex(text: string, token: string): number {
  const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegex(token)})`, 'iu').exec(text)
  return match ? match.index + match[1].length : -1
}

export function matchesAllWordPrefixes(text: string, query: string): boolean {
  const tokens = searchTokens(query)
  return tokens.length > 0 && tokens.every((t) => wordPrefixIndex(text, t) !== -1)
}

export function matchesAnyWordPrefix(text: string, query: string): boolean {
  return searchTokens(query).some((t) => wordPrefixIndex(text, t) !== -1)
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const tokensOf = (q) => String(q || '').trim().split(/\s+/).filter(Boolean)

export function wordPrefixPatterns(q, maxTokens = 5) {
  return tokensOf(q).slice(0, maxTokens).map((token) => `\\m${escapeRegex(token)}`)
}

export function phrasePrefixPattern(q) {
  const tokens = tokensOf(q)
  return tokens.length > 0 ? `\\m${tokens.map(escapeRegex).join('\\s+')}` : null
}

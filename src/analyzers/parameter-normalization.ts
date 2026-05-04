const SYNONYM_GROUPS: string[][] = [
  ['ticker', 'symbol', 'stock'],
  ['id', 'identifier', 'key'],
  ['query', 'search', 'q', 'term'],
  ['limit', 'max', 'count', 'size'],
  ['offset', 'skip', 'page'],
  ['url', 'uri', 'endpoint', 'href'],
  ['user', 'username', 'user_id', 'userId'],
  ['date', 'timestamp', 'time', 'datetime'],
]

const GENERIC_PARAMETER_TOKENS = new Set(['id', 'identifier', 'key'])

const SYNONYM_CANONICALS = new Map(
  SYNONYM_GROUPS.flatMap(group => {
    const canonical = group[0].toLowerCase()
    return group.map(term => [term.toLowerCase(), canonical] as const)
  })
)

function singularizeToken(token: string): string {
  if (token === 'ids') return 'id'
  if (token.endsWith('ies') && token.length > 3) return `${token.slice(0, -3)}y`
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) return token.slice(0, -1)
  return token
}

export function normalizeParameterName(name: string): string {
  const exactCanonical = SYNONYM_CANONICALS.get(name.toLowerCase())
  if (exactCanonical) return exactCanonical

  const normalizedTokens = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(token => singularizeToken(token.toLowerCase()))
    .map(token => SYNONYM_CANONICALS.get(token) ?? token)
    .filter(token => !GENERIC_PARAMETER_TOKENS.has(token))

  if (normalizedTokens.length === 0) {
    return singularizeToken(name.toLowerCase())
  }

  return normalizedTokens.join('_')
}

export function orgFilter(req) {
  if (!req.org) return { clause: '', params: [] }
  return {
    clause: 'organization_id = $orgParam',
    params: [req.org.org_id]
  }
}

export function orgScopedQuery(baseSql, values = [], req) {
  let text, resultValues
  if (!req.org) {
    text = baseSql
    resultValues = values
  } else {
    const orgId = req.org.org_id
    const insertPos = baseSql.search(/\b(ORDER BY|GROUP BY|LIMIT|RETURNING)\b/i)
    const insertIdx = insertPos === -1 ? baseSql.length : insertPos
    const beforeInsert = baseSql.slice(0, insertIdx)
    let depth = 0
    let hasWhere = false
    for (let i = 0; i < beforeInsert.length; i++) {
      const ch = beforeInsert[i]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if (depth === 0 && /^\bWHERE\b/i.test(beforeInsert.slice(i))) {
        hasWhere = true
        break
      }
    }
    const connector = hasWhere ? 'AND' : 'WHERE'
    const orgClause = ` ${connector} organization_id = $${values.length + 1} `
    text = baseSql.slice(0, insertIdx) + orgClause + baseSql.slice(insertIdx)
    resultValues = [...values, orgId]
  }
  return {
    text,
    values: resultValues,
    *[Symbol.iterator]() { yield text; yield resultValues },
  }
}

export function currentOrgId(req) {
  return req.org?.org_id || null
}

interface TreeOrganization {
  id: number
  name: string
  parent_id: number | null
}

export function buildOrganizationTree<T extends TreeOrganization>(organizations: T[], collapsed: Set<number>, search = '') {
  const byId = new Map(organizations.map(org => [org.id, org]))
  const children = new Map<number, T[]>()
  const roots: T[] = []
  const visible = new Set<number>()
  const query = search.trim().toLocaleLowerCase('ru')

  for (const org of organizations) {
    if (!query || org.name.toLocaleLowerCase('ru').includes(query)) {
      const visited = new Set<number>()
      let current: T | undefined = org
      while (current && !visited.has(current.id)) {
        visited.add(current.id)
        visible.add(current.id)
        current = current.parent_id === null ? undefined : byId.get(current.parent_id)
      }
    }
    if (org.parent_id !== org.id && org.parent_id !== null && byId.has(org.parent_id)) {
      const siblings = children.get(org.parent_id) || []
      siblings.push(org)
      children.set(org.parent_id, siblings)
    } else {
      roots.push(org)
    }
  }

  const result: { org: T; depth: number; hasChildren: boolean }[] = []
  const visited = new Set<number>()
  const visit = (org: T, depth: number, hidden = false) => {
    if (visited.has(org.id)) return
    visited.add(org.id)
    if (!visible.has(org.id)) return
    const descendants = (children.get(org.id) || []).filter(child => visible.has(child.id))
    if (!hidden) result.push({ org, depth, hasChildren: descendants.length > 0 })
    for (const child of descendants.sort((a, b) => a.name.localeCompare(b.name, 'ru'))) {
      visit(child, depth + 1, hidden || (!query && collapsed.has(org.id)))
    }
  }
  const sorted = [...organizations].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  for (const org of roots.sort((a, b) => a.name.localeCompare(b.name, 'ru'))) visit(org, 0)
  for (const org of sorted) visit(org, 0)
  return result
}

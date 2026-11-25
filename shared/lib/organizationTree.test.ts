import { describe, expect, it } from 'vitest'
import { buildOrganizationTree } from './organizationTree'

const organizations = [
  { id: 3, name: 'Филиал', parent_id: 2 },
  { id: 1, name: 'Головная', parent_id: null },
  { id: 2, name: 'Управление', parent_id: 1 },
  { id: 4, name: 'Отдельная', parent_id: 99 },
]

const outline = (collapsed = new Set<number>(), search = '') => buildOrganizationTree(organizations, collapsed, search).map(({ org, depth }) => [org.id, depth])

describe('Дерево выбора организаций', () => {
  it('сохраняет иерархию и показывает организацию с недоступным родителем', () => {
    expect(outline()).toEqual([[1, 0], [2, 1], [3, 2], [4, 0]])
  })

  it('скрывает все вложенные организации при сворачивании ветки', () => {
    expect(outline(new Set([1]))).toEqual([[1, 0], [4, 0]])
  })

  it('находит организацию внутри свёрнутой ветки и показывает её предков', () => {
    expect(outline(new Set([1, 2]), '  ФИЛИАЛ ')).toEqual([[1, 0], [2, 1], [3, 2]])
    expect(outline(new Set(), 'Несуществующая')).toEqual([])
  })

  it('не теряет организации и не зацикливается при ошибочных связях', () => {
    const tree = buildOrganizationTree([
      { id: 1, name: 'А', parent_id: 2 },
      { id: 2, name: 'Б', parent_id: 1 },
      { id: 3, name: 'В', parent_id: 3 },
    ], new Set())
    expect(new Set(tree.map(row => row.org.id))).toEqual(new Set([1, 2, 3]))
    expect(tree).toHaveLength(3)
  })
})

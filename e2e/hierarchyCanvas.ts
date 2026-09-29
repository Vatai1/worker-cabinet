import { expect, type Locator, type Page } from '@playwright/test'

export function editorRoot(page: Page) {
  return page
    .locator('div.fixed.inset-0')
    .filter({ has: page.getByRole('heading', { name: 'Иерархия', exact: true }) })
    .first()
}

export function editorNodes(page: Page) {
  return editorRoot(page).locator('.react-flow__node:not([data-id^="org-"])')
}

export function editorEdges(page: Page) {
  return editorRoot(page).locator('.react-flow__edge:not([data-id^="e-orgedit-"])')
}

export async function openEditorFromSidebarHierarchy(page: Page, expectedNodes?: number) {
  await page.goto('/my-hierarchy')
  const edit = page.getByRole('button', { name: 'Редактировать', exact: true })
  await expect(edit).toBeVisible({ timeout: 15000 })
  await edit.click()
  await expect(editorRoot(page).locator('.react-flow')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(900)
  if (expectedNodes !== undefined) await expect(editorNodes(page)).toHaveCount(expectedNodes, { timeout: 10000 })
}

export async function canvasPoint(page: Page, fx: number, fy: number) {
  const box = await editorRoot(page).locator('.react-flow__pane').boundingBox()
  if (!box) throw new Error('no canvas pane')
  return { x: box.x + box.width * fx, y: box.y + box.height * fy }
}

async function dropPaletteItem(page: Page, label: string, fx: number, fy: number) {
  const root = editorRoot(page)
  const item = root.locator('div[draggable="true"]').filter({ hasText: label }).first()
  await expect(item).toBeVisible({ timeout: 10000 })
  const pt = await canvasPoint(page, fx, fy)
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await item.dispatchEvent('dragstart', { dataTransfer })
  await root.locator('.react-flow__pane').dispatchEvent('drop', { dataTransfer, clientX: pt.x, clientY: pt.y })
}

async function pickInModal(page: Page, title: string, searchPlaceholder: string, text: string) {
  const modal = editorRoot(page).locator('.animate-scale-in').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
  await expect(modal).toBeVisible({ timeout: 10000 })
  await modal.getByPlaceholder(searchPlaceholder).fill(text)
  await modal.locator('.overflow-y-auto button', { hasText: text }).first().click()
  await modal.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(modal).toBeHidden({ timeout: 5000 })
}

export async function addDepartment(page: Page, name: string, fx: number, fy: number) {
  const before = await editorNodes(page).count()
  await dropPaletteItem(page, 'Отдел', fx, fy)
  await pickInModal(page, 'Выберите отдел', 'Поиск отдела...', name)
  await expect(editorNodes(page)).toHaveCount(before + 1, { timeout: 10000 })
  return editorNodes(page).filter({ hasText: name }).first()
}

export async function addEmployee(page: Page, lastName: string, fx: number, fy: number) {
  const before = await editorNodes(page).count()
  await dropPaletteItem(page, 'Работник', fx, fy)
  await pickInModal(page, 'Выберите работника', 'Поиск работника...', lastName)
  await expect(editorNodes(page)).toHaveCount(before + 1, { timeout: 10000 })
  return editorNodes(page).filter({ hasText: lastName }).first()
}

export async function connect(page: Page, source: Locator, target: Locator) {
  const before = await editorEdges(page).count()
  const src = await source.locator('.react-flow__handle-bottom').boundingBox()
  const dst = await target.locator('.react-flow__handle-top').boundingBox()
  if (!src || !dst) throw new Error('no handles')
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2)
  await page.mouse.down()
  await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 15 })
  await page.mouse.up()
  const modal = edgeModal(page, 'Новая связь')
  await expect(modal).toBeVisible({ timeout: 10000 })
  return {
    modal,
    async save() {
      await modal.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 5000 })
      await expect(editorEdges(page)).toHaveCount(before + 1, { timeout: 10000 })
    },
  }
}

export function edgeModal(page: Page, title: 'Новая связь' | 'Связь') {
  return editorRoot(page).locator('.animate-scale-in').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
}

export function visibilitySwitch(modal: Locator, label: string) {
  return modal.locator('.rounded-lg.border', { hasText: label }).first().getByRole('switch').first()
}

export async function setVisibility(modal: Locator, label: string, on: boolean) {
  const sw = visibilitySwitch(modal, label)
  await expect(sw).toBeVisible({ timeout: 5000 })
  if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', String(on))
}

export async function openEdgeSettings(page: Page, index = 0) {
  const pt = await page.evaluate((i) => {
    let editor: Element | null = null
    document.querySelectorAll('div.fixed.inset-0').forEach((d) => {
      if (!editor && d.querySelector('h1')?.textContent?.trim() === 'Иерархия') editor = d
    })
    const edges: Element[] = []
    ;(editor ? editor.querySelectorAll('.react-flow__edge') : []).forEach((e) => {
      if (!(e.getAttribute('data-id') ?? '').startsWith('e-orgedit-')) edges.push(e)
    })
    const path = edges[i]?.querySelector('path')
    if (!path) return null
    const local = (path as SVGPathElement).getPointAtLength((path as SVGPathElement).getTotalLength() * 0.2)
    const screen = local.matrixTransform((path as SVGPathElement).getScreenCTM()!)
    return { x: screen.x, y: screen.y }
  }, index)
  if (!pt) throw new Error('no edge path')
  await page.mouse.click(pt.x, pt.y)
  const modal = edgeModal(page, 'Связь')
  await expect(modal).toBeVisible({ timeout: 10000 })
  return modal
}

export async function saveCanvas(page: Page) {
  const done = page.waitForResponse(
    (r) => r.url().endsWith('/api/hierarchy') && r.request().method() === 'PUT',
    { timeout: 15000 },
  )
  await editorRoot(page).getByRole('button', { name: 'Сохранить', exact: true }).click()
  const res = await done
  expect(res.status(), await res.text()).toBe(200)
}

export async function closeEditor(page: Page) {
  await editorRoot(page).locator('button').filter({ has: page.locator('svg.lucide-x') }).last().click()
}

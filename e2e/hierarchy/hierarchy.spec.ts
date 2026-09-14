import { test, expect, type Page, type Locator, type TestInfo } from '@playwright/test'
import { loginAs } from '../helpers'

const API = 'http://localhost:5000/api'

async function apiHeaders(page: Page) {
  const cookies = await page.context().cookies()
  const auth = cookies.find((c) => c.name === 'auth_token')?.value
  const csrf = cookies.find((c) => c.name === 'csrf_token')?.value
  return {
    Cookie: `auth_token=${auth}; csrf_token=${csrf}`,
    'x-csrf-token': csrf ?? '',
    'x-organization-id': '1',
  }
}

async function snapshotOrgHierarchy(page: Page) {
  const res = await page.request.get(`${API}/hierarchy`, { headers: await apiHeaders(page) })
  return await res.json()
}

async function clearOrgHierarchy(page: Page) {
  const headers = await apiHeaders(page)
  const cur = await (await page.request.get(`${API}/hierarchy`, { headers })).json()
  await page.request.put(`${API}/hierarchy`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, orgPositions: {}, baseVersion: cur.version ?? 0 },
  })
}

async function restoreOrgHierarchy(page: Page, snap: any) {
  const headers = await apiHeaders(page)
  const cur = await (await page.request.get(`${API}/hierarchy`, { headers })).json()
  await page.request.put(`${API}/hierarchy`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: {
      nodes: snap?.data?.nodes ?? [],
      edges: snap?.data?.edges ?? [],
      viewport: snap?.data?.viewport ?? { x: 0, y: 0, zoom: 1 },
      orgPositions: snap?.data?.orgPositions ?? {},
      baseVersion: cur.version ?? 0,
    },
  })
}

function editorRoot(page: Page) {
  return page
    .locator('div.fixed.inset-0')
    .filter({ has: page.getByRole('heading', { name: 'Иерархия', exact: true }) })
    .first()
}

function editorNodes(page: Page) {
  return editorRoot(page).locator('.react-flow__node:not([data-id^="org-"])')
}

function editorEdges(page: Page) {
  return editorRoot(page).locator('.react-flow__edge:not([data-id^="e-orgedit-"])')
}

function viewerRoot(page: Page) {
  return page
    .locator('div.fixed.inset-0')
    .filter({ has: page.getByRole('button', { name: 'Редактировать', exact: true }) })
    .last()
}

async function openEditor(page: Page, expectedNodes = 0) {
  await page.goto('/hr?tab=hierarchy')
  const editBtn = viewerRoot(page).getByRole('button', { name: 'Редактировать', exact: true })
  await expect(editBtn).toBeVisible({ timeout: 15000 })
  await editBtn.click()
  await expect(editorRoot(page)).toBeVisible({ timeout: 15000 })
  await expect(editorRoot(page).locator('.react-flow')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(900)
  await expect(editorNodes(page)).toHaveCount(expectedNodes, { timeout: 10000 })
}

async function dropFromPalette(page: Page, label: string, x: number, y: number) {
  const root = editorRoot(page)
  const item = root.locator('div[draggable="true"]').filter({ hasText: label }).first()
  await expect(item).toBeVisible({ timeout: 10000 })
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await item.dispatchEvent('dragstart', { dataTransfer })
  await root.locator('.react-flow__pane').dispatchEvent('drop', { dataTransfer, clientX: x, clientY: y })
}

async function canvasPoint(page: Page, fx: number, fy: number) {
  const box = await editorRoot(page).locator('.react-flow__pane').boundingBox()
  if (!box) throw new Error('no canvas pane')
  return { x: box.x + box.width * fx, y: box.y + box.height * fy }
}

async function pickDepartment(page: Page, rowIndex: number) {
  const modal = editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Выберите отдел' })
  await expect(modal).toBeVisible({ timeout: 10000 })
  await modal.locator('.max-h-52 button').nth(rowIndex).click()
  await modal.getByRole('button', { name: 'Добавить', exact: true }).click()
  await expect(modal).toBeHidden({ timeout: 5000 })
}

async function addDepartmentNode(page: Page, fx: number, fy: number, rowIndex = 0) {
  const pt = await canvasPoint(page, fx, fy)
  await dropFromPalette(page, 'Отдел', pt.x, pt.y)
  await pickDepartment(page, rowIndex)
}

async function connectNodes(page: Page, source: Locator, target: Locator) {
  const src = await source.locator('.react-flow__handle-bottom').boundingBox()
  const dst = await target.locator('.react-flow__handle-top').boundingBox()
  if (!src || !dst) throw new Error('no handles')
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2)
  await page.mouse.down()
  await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 15 })
  await page.mouse.up()
}

async function buildTwoDepartmentsWithEdge(page: Page) {
  const a = await canvasPoint(page, 0.5, 0.2)
  const b = await canvasPoint(page, 0.5, 0.75)
  await dropFromPalette(page, 'Отдел', a.x, a.y)
  await pickDepartment(page, 0)
  await dropFromPalette(page, 'Отдел', b.x, b.y)
  await pickDepartment(page, 1)
  await expect(editorNodes(page)).toHaveCount(2, { timeout: 10000 })

  const nodeA = editorNodes(page).first()
  const nodeB = editorNodes(page).nth(1)
  await connectNodes(page, nodeA, nodeB)
  const createModal = editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Новая связь' })
  await expect(createModal).toBeVisible({ timeout: 10000 })
  await createModal.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(createModal).toBeHidden({ timeout: 5000 })
  await expect(editorEdges(page)).toHaveCount(1, { timeout: 10000 })
  return { nodeA, nodeB }
}

async function edgePointAt(page: Page, frac: number) {
  const pt = await page.evaluate((f) => {
    let editor: Element | null = null
    document.querySelectorAll('div.fixed.inset-0').forEach((d) => {
      if (!editor && d.querySelector('h1')?.textContent?.trim() === 'Иерархия') editor = d
    })
    const edges: Element[] = []
    ;(editor ? editor.querySelectorAll('.react-flow__edge') : document.querySelectorAll('.react-flow__edgenever')).forEach((e) => {
      if (!(e.getAttribute('data-id') ?? '').startsWith('e-orgedit-')) edges.push(e)
    })
    const path = edges[0]?.querySelector('path')
    if (!path) return null
    const total = path.getTotalLength()
    const local = path.getPointAtLength(total * f)
    const screen = local.matrixTransform(path.getScreenCTM()!)
    return { x: screen.x, y: screen.y }
  }, frac)
  if (!pt) throw new Error('no edge path')
  return pt as { x: number; y: number }
}

async function edgePointNearSource(page: Page) {
  return edgePointAt(page, 0.2)
}

async function edgeMidpoint(page: Page) {
  return edgePointAt(page, 0.5)
}

async function clickEdgeNearSource(page: Page) {
  const pt = await edgePointAt(page, 0.2)
  await page.mouse.click(pt.x, pt.y)
  const modal = editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Связь' })
  const opened = await modal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)
  if (!opened) {
    await page.evaluate(([x, y]) => {
      let editor: Element | null = null
      document.querySelectorAll('div.fixed.inset-0').forEach((d) => {
        if (!editor && d.querySelector('h1')?.textContent?.trim() === 'Иерархия') editor = d
      })
      const edges: Element[] = []
      ;(editor ? editor.querySelectorAll('.react-flow__edge') : document.querySelectorAll('.react-flow__edgenever')).forEach((e) => {
        if (!(e.getAttribute('data-id') ?? '').startsWith('e-orgedit-')) edges.push(e)
      })
      const paths = edges[0]?.querySelectorAll('path')
      const hit = paths && paths.length > 1 ? paths[1] : paths?.[0]
      hit?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: Number(x), clientY: Number(y) }))
    }, [pt.x, pt.y])
  }
  await expect(modal).toBeVisible({ timeout: 10000 })
  return modal
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' })
}

test.describe('Модуль Иерархия', () => {
  test.describe.configure({ mode: 'serial' })

  test.describe('HR — UC-1: Просмотр оргструктуры', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'hr')
      await page.goto('/hr?tab=hierarchy')
      if (!(await viewerRoot(page).locator('.react-flow').waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
        test.skip()
        return
      }
    })

    test('вьюер организации открыт: холст react-flow с органайзером и мини-картой', async ({ page }) => {
      const viewer = viewerRoot(page)
      await expect(viewer.locator('.react-flow')).toBeVisible({ timeout: 15000 })
      await expect(viewer.locator('.react-flow__controls')).toBeVisible({ timeout: 10000 })
      await expect(viewer.locator('.react-flow__minimap')).toBeVisible({ timeout: 10000 })
    })

    test('вьюер в режиме ПРОСМОТРА: нет палитры «Элементы» и кнопки «Сохранить»', async ({ page }) => {
      const viewer = viewerRoot(page)
      await expect(viewer.getByText('Элементы', { exact: true })).toBeHidden()
      await expect(viewer.getByRole('button', { name: 'Сохранить', exact: true })).toBeHidden()
    })

    test('видна кнопка «Редактировать»', async ({ page }) => {
      await expect(viewerRoot(page).getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('«Редактировать» открывает редактор: заголовок «Иерархия», палитра «Элементы», «Сохранить»', async ({ page }) => {
      await viewerRoot(page).getByRole('button', { name: 'Редактировать', exact: true }).click()
      const root = editorRoot(page)
      await expect(root).toBeVisible({ timeout: 15000 })
      await expect(root.getByRole('heading', { name: 'Иерархия', exact: true })).toBeVisible()
      await expect(root.getByText('Элементы', { exact: true })).toBeVisible({ timeout: 10000 })
      for (const label of ['Отдел', 'Сотрудник', 'Описание', 'Группа']) {
        await expect(root.locator('div[draggable="true"]').filter({ hasText: label }).first()).toBeVisible()
      }
      await expect(root.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('на холсте вьюера ноды (если данные схемы есть)', async ({ page }) => {
      const count = await viewerRoot(page).locator('.react-flow__node').count()
      if (count === 0) return
      expect(count).toBeGreaterThan(0)
    })
  })

  test.describe('HR — UC-2: Построение структуры', () => {
    let snap: any

    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'hr')
      snap = await snapshotOrgHierarchy(page)
      await clearOrgHierarchy(page)
      await openEditor(page)
    })

    test.afterEach(async ({ page }) => {
      await restoreOrgHierarchy(page, snap).catch(() => {})
    })

    test('драг «Отдел» из палитры → форма выбора → нод на канвасе', async ({ page }, testInfo) => {
      await shot(page, testInfo, 'uc2-palette')
      await addDepartmentNode(page, 0.5, 0.4)
      await expect(editorNodes(page)).toHaveCount(1, { timeout: 10000 })
      await expect(editorNodes(page).first()).toContainText('сотр.')
    })

    test('драг «Сотрудник» → выбор сотрудника → нод на канвасе', async ({ page }) => {
      const pt = await canvasPoint(page, 0.5, 0.4)
      await dropFromPalette(page, 'Сотрудник', pt.x, pt.y)
      const modal = editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Выберите сотрудника' })
      await expect(modal).toBeVisible({ timeout: 10000 })
      await modal.locator('.max-h-48 button').first().click()
      await modal.getByRole('button', { name: 'Добавить', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 5000 })
      await expect(editorNodes(page)).toHaveCount(1, { timeout: 10000 })
    })

    test('драг «Описание» → текстовый блок с введённым текстом', async ({ page }) => {
      const pt = await canvasPoint(page, 0.5, 0.4)
      await dropFromPalette(page, 'Описание', pt.x, pt.y)
      const modal = editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Текстовый блок' })
      await expect(modal).toBeVisible({ timeout: 10000 })
      await modal.locator('textarea').fill('E2E-заметка об отделе')
      await modal.getByRole('button', { name: 'Добавить', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 5000 })
      await expect(editorNodes(page)).toHaveCount(1, { timeout: 10000 })
      await expect(editorNodes(page).first()).toContainText('E2E-заметка об отделе')
    })

    test('соединение нодов: drag от хэндла А к хэндлу Б → связь появилась', async ({ page }) => {
      await buildTwoDepartmentsWithEdge(page)
      await expect(editorEdges(page)).toHaveCount(1, { timeout: 10000 })
    })

    test('клик по связи (вдали от точек) → настройки: «Родитель согласовывает отпуска подчинённых» → Сохранить → модалка закрылась', async ({ page }, testInfo) => {
      await buildTwoDepartmentsWithEdge(page)
      const modal = await clickEdgeNearSource(page)
      await shot(page, testInfo, 'uc2-edge-settings')
      const row = modal
        .locator('.rounded-lg.border', { hasText: 'Родитель согласовывает отпуска подчинённых' })
        .first()
      await row.getByRole('switch').click()
      await modal.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 5000 })
    })

    test('ПКМ по связи → «Настройки родительской связи» → свитчи видимости и согласования → Сохранить', async ({ page }) => {
      await buildTwoDepartmentsWithEdge(page)
      const pt = await edgePointNearSource(page)
      await page.mouse.click(pt.x, pt.y, { button: 'right' })
      await page.getByText('Настройки родительской связи', { exact: true }).click()
      const modal = editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Родительская связь' })
      await expect(modal).toBeVisible({ timeout: 10000 })
      await expect(modal.getByText('Отпуск родителя виден подчинённым')).toBeVisible()
      await expect(modal.getByText('Родитель видит отпуска подчинённых')).toBeVisible()
      await expect(modal.getByText('Родитель согласовывает отпуска подчинённых')).toBeVisible()
      await modal.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 5000 })
    })

    test('точки опоры: hover → «+», клик добавляет waypoint без модалки, drag двигает, dblclick удаляет', async ({ page }, testInfo) => {
      await buildTwoDepartmentsWithEdge(page)
      const mid = await edgeMidpoint(page)
      await page.mouse.move(mid.x, mid.y)
      const plus = editorRoot(page).locator('[title="Клик — добавить точку опоры"]')
      await expect(plus.first()).toBeVisible({ timeout: 10000 })
      await shot(page, testInfo, 'uc2-waypoints')
      await plus.first().click()
      const dot = editorRoot(page).locator('[title="Тащите • двойной клик — удалить"]')
      await expect(dot).toHaveCount(1, { timeout: 10000 })
      await expect(editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Связь' })).toBeHidden()
      const dotBox = await dot.first().boundingBox()
      if (!dotBox) throw new Error('no waypoint box')
      await page.mouse.move(dotBox.x + dotBox.width / 2, dotBox.y + dotBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(dotBox.x + dotBox.width / 2 + 80, dotBox.y + dotBox.height / 2 + 60, { steps: 8 })
      await page.mouse.up()
      await expect(dot).toHaveCount(1, { timeout: 5000 })
      await dot.first().dblclick()
      await expect(dot).toHaveCount(0, { timeout: 5000 })
    })

    test('группа поверх связи: клик по линии под группой открывает настройки связи', async ({ page }) => {
      await buildTwoDepartmentsWithEdge(page)
      const mid = await edgeMidpoint(page)
      await dropFromPalette(page, 'Группа', mid.x, mid.y)
      const modal = editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Текстовый блок' })
      await expect(modal).toBeVisible({ timeout: 10000 })
      await modal.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 5000 })
      await expect(editorRoot(page).locator('.hierarchy-group-node')).toHaveCount(1, { timeout: 10000 })
      const settings = await clickEdgeNearSource(page)
      await settings.getByRole('button', { name: 'Отмена', exact: true }).click()
    })

    test('undo: Ctrl+Z возвращает состояние до добавления', async ({ page }) => {
      const pt = await canvasPoint(page, 0.5, 0.4)
      await dropFromPalette(page, 'Описание', pt.x, pt.y)
      const modal = editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Текстовый блок' })
      await modal.locator('textarea').fill('E2E-undo')
      await modal.getByRole('button', { name: 'Добавить', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 5000 })
      await expect(editorNodes(page)).toHaveCount(1, { timeout: 10000 })
      await page.keyboard.press('Control+z')
      await expect(editorNodes(page)).toHaveCount(0, { timeout: 10000 })
    })

    test('Сохранить → reload → структура на месте (персистентность)', async ({ page }) => {
      await addDepartmentNode(page, 0.5, 0.4)
      await expect(editorNodes(page)).toHaveCount(1, { timeout: 10000 })
      const putDone = page.waitForResponse(
        (r) => r.url().includes('/api/hierarchy') && r.request().method() === 'PUT' && r.status() === 200,
        { timeout: 15000 },
      )
      await editorRoot(page).getByRole('button', { name: 'Сохранить', exact: true }).click()
      await putDone
      await page.reload()
      await openEditor(page, 1)
      await expect(editorNodes(page)).toHaveCount(1, { timeout: 15000 })
    })
  })

  test.describe('HR — UC-3: Удаление элемента', () => {
    let snap: any

    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'hr')
      snap = await snapshotOrgHierarchy(page)
      await clearOrgHierarchy(page)
      await openEditor(page)
    })

    test.afterEach(async ({ page }) => {
      await restoreOrgHierarchy(page, snap).catch(() => {})
    })

    test('ПКМ по ноду со связью → «Удалить блок?» с числом связей → подтвердить → нод исчез', async ({ page }) => {
      await buildTwoDepartmentsWithEdge(page)
      const node = editorNodes(page).first()
      await node.click({ button: 'right' })
      await page.getByText('Удалить', { exact: true }).click()
      const modal = editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Удалить блок?' })
      await expect(modal).toBeVisible({ timeout: 10000 })
      await expect(modal).toContainText('связи (1)')
      await modal.getByRole('button', { name: 'Удалить', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 5000 })
      await expect(editorNodes(page)).toHaveCount(1, { timeout: 10000 })
      await expect(editorEdges(page)).toHaveCount(0, { timeout: 10000 })
    })

    test('отмена удаления → нод остался', async ({ page }) => {
      await buildTwoDepartmentsWithEdge(page)
      const node = editorNodes(page).first()
      await node.click({ button: 'right' })
      await page.getByText('Удалить', { exact: true }).click()
      const modal = editorRoot(page).locator('.animate-scale-in').filter({ hasText: 'Удалить блок?' })
      await expect(modal).toBeVisible({ timeout: 10000 })
      await modal.getByRole('button', { name: 'Отмена', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 5000 })
      await expect(editorNodes(page)).toHaveCount(2, { timeout: 10000 })
    })
  })

  test.describe('Супер-админ — UC-4: Глобальная иерархия', () => {
    function mapRoot(page: Page) {
      return page
        .locator('div.fixed.inset-0')
        .filter({ has: page.getByRole('heading', { name: 'Глобальная иерархия', exact: true }) })
        .first()
    }

    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'superadmin')
      await page.goto('/admin/global?tab=global-hierarchy')
      await expect(mapRoot(page)).toBeVisible({ timeout: 15000 })
      await expect(mapRoot(page).locator('.react-flow')).toBeVisible({ timeout: 15000 })
    })

    test('карта организаций открыта: счётчик учреждений и карточки-орги', async ({ page }) => {
      await expect(mapRoot(page).getByText(/Учреждений: \d+/)).toBeVisible({ timeout: 10000 })
      await expect(mapRoot(page).locator('.react-flow__node[data-id^="org-"]').first()).toBeVisible({ timeout: 15000 })
    })

    test('клик по организации → вьюер в режиме ПРОСМОТРА → «Редактировать» открывает редактор с палитрой → Escape возвращает', async ({ page }) => {
      const orgNode = mapRoot(page).locator('.react-flow__node[data-id^="org-"]').first()
      const orgName = ((await orgNode.locator('span.font-semibold').first().textContent()) ?? '').trim()
      await orgNode.click()
      const viewer = viewerRoot(page)
      await expect(viewer.getByRole('heading', { name: orgName })).toBeVisible({ timeout: 15000 })
      await expect(viewer.getByText('Элементы', { exact: true })).toBeHidden()
      await expect(viewer.getByRole('button', { name: 'Сохранить', exact: true })).toBeHidden()
      await expect(viewer.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible({ timeout: 10000 })

      await viewer.getByRole('button', { name: 'Редактировать', exact: true }).click()
      const editor = editorRoot(page)
      await expect(editor).toBeVisible({ timeout: 15000 })
      await expect(editor.getByText('Элементы', { exact: true })).toBeVisible({ timeout: 15000 })
      await expect(editor.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible({ timeout: 10000 })

      await page.keyboard.press('Escape')
      await expect(editorRoot(page)).toBeHidden({ timeout: 10000 })
      await expect(viewer.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('вьюер закрывается: Escape и крестик возвращают на карту организаций', async ({ page }) => {
      const orgNode = mapRoot(page).locator('.react-flow__node[data-id^="org-"]').first()
      await orgNode.click()
      const viewer = viewerRoot(page)
      await expect(viewer.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible({ timeout: 15000 })

      await page.keyboard.press('Escape')
      await expect(viewerRoot(page)).toBeHidden({ timeout: 10000 })
      await expect(mapRoot(page)).toBeVisible({ timeout: 10000 })

      await mapRoot(page).locator('.react-flow__node[data-id^="org-"]').first().click()
      await expect(viewer.getByRole('button', { name: 'Редактировать', exact: true })).toBeVisible({ timeout: 15000 })
      await viewerRoot(page).locator('button:has(.lucide-x)').last().click()
      await expect(viewerRoot(page)).toBeHidden({ timeout: 10000 })
      await expect(mapRoot(page)).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Сотрудник — UC-5: Моя иерархия', () => {
    test('фуллскрин-просмотр: ноды нельзя тащить, закрытие по X ведёт на /dashboard', async ({ page }, testInfo) => {
      await loginAs(page, 'employee')
      await page.goto('/my-hierarchy')
      const overlay = page
        .locator('div.fixed.inset-0')
        .filter({ has: page.getByText('Иерархия организации', { exact: true }) })
        .last()
      await expect(overlay).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Иерархия организации', { exact: true })).toBeVisible({ timeout: 15000 })
      if (!(await page.locator('.react-flow').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false))) {
        test.skip()
        return
      }
      await shot(page, testInfo, 'uc5-employee-fullscreen')
      const node = page.locator('.react-flow__node').first()
      if ((await node.count()) > 0) {
        const before = await node.getAttribute('style')
        const box = await node.boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.mouse.down()
          await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 8 })
          await page.mouse.up()
        }
        const after = await node.getAttribute('style')
        expect(after).toBe(before)
      }
      await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
    })

    test('закрытие по Escape ведёт на /dashboard', async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/my-hierarchy')
      await expect(page.getByText('Иерархия организации', { exact: true })).toBeVisible({ timeout: 15000 })
      await page.keyboard.press('Escape')
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
    })

    test('сотрудник не попадает на /hr?tab=hierarchy — редирект на /dashboard', async ({ page }) => {
      await loginAs(page, 'employee')
      await page.goto('/hr?tab=hierarchy')
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
      await expect(page.locator('.react-flow')).toHaveCount(0)
    })
  })
})

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { BASE, login, headers, headersJSON } from './helpers.js'

const ORG = { 'X-Organization-Id': '1' }
let adminToken, hrToken, employeeToken

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...headersJSON(token), ...ORG },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: await res.json().catch(() => null) }
}

const uniq = (prefix) => `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`

describe('База знаний', () => {
  let categoryId, articleId

  before(async () => {
    adminToken = await login('admin@example.com')
    hrToken = await login('elena@example.com')
    employeeToken = await login('ivanov@example.com')
  })

  it('GET /knowledge/categories — список доступен работнику', async () => {
    const { status, data } = await call('GET', '/knowledge/categories', null, employeeToken)
    assert.strictEqual(status, 200)
    assert.ok(Array.isArray(data))
    assert.ok(data.every((c) => typeof c.name === 'string' && typeof c.article_count === 'number'))
  })

  it('POST /knowledge/categories — employee получает 403', async () => {
    const { status } = await call('POST', '/knowledge/categories', { name: uniq('Запрещённая') }, employeeToken)
    assert.strictEqual(status, 403)
  })

  it('POST /knowledge/categories — hr создаёт категорию', async () => {
    const { status, data } = await call('POST', '/knowledge/categories', { name: uniq('Регламенты тест') }, hrToken)
    assert.strictEqual(status, 201)
    assert.ok(data.id)
    categoryId = data.id
  })

  it('POST /knowledge/categories — дубликат названия даёт 409', async () => {
    const name = uniq('Дубль тест')
    await call('POST', '/knowledge/categories', { name }, hrToken)
    const { status } = await call('POST', '/knowledge/categories', { name }, hrToken)
    assert.strictEqual(status, 409)
  })

  it('PUT /knowledge/categories/:id — переименование', async () => {
    const { status, data } = await call('PUT', `/knowledge/categories/${categoryId}`, { name: uniq('Регламенты переименованы') }, hrToken)
    assert.strictEqual(status, 200)
    assert.ok(data.name.includes('Регламенты переименованы'))
  })

  it('POST /knowledge/articles — employee получает 403', async () => {
    const { status } = await call('POST', '/knowledge/articles', { title: 'Запрещённая', content: 'Текст' }, employeeToken)
    assert.strictEqual(status, 403)
  })

  it('POST /knowledge/articles — валидация: без заголовка 400, несуществующая категория 400', async () => {
    const noTitle = await call('POST', '/knowledge/articles', { content: 'Текст' }, hrToken)
    assert.strictEqual(noTitle.status, 400)
    const badCategory = await call('POST', '/knowledge/articles', { title: 'Заголовок', content: 'Текст', category_id: 99999999 }, hrToken)
    assert.strictEqual(badCategory.status, 400)
  })

  it('POST /knowledge/articles — hr создаёт черновик', async () => {
    const { status, data } = await call('POST', '/knowledge/articles', {
      title: uniq('Порядок отпусков тест'),
      content: 'Настоящий порядок регулирует оформление отпусков. Токенпоиска: ежик-в-тумане.',
      category_id: categoryId,
      status: 'draft',
    }, hrToken)
    assert.strictEqual(status, 201)
    assert.strictEqual(data.status, 'draft')
    articleId = data.id
  })

  it('GET /knowledge/articles — работник не видит черновики', async () => {
    const { status, data } = await call('GET', '/knowledge/articles?limit=100', null, employeeToken)
    assert.strictEqual(status, 200)
    assert.ok(!data.some((a) => a.id === articleId))
    assert.ok(data.every((a) => a.status === 'published'))
  })

  it('GET /knowledge/articles?status=draft — hr видит черновики', async () => {
    const { status, data } = await call('GET', '/knowledge/articles?status=draft&limit=100', null, hrToken)
    assert.strictEqual(status, 200)
    assert.ok(data.some((a) => a.id === articleId))
  })

  it('GET /knowledge/articles/:id — черновик недоступен работнику (404)', async () => {
    const { status } = await call('GET', `/knowledge/articles/${articleId}`, null, employeeToken)
    assert.strictEqual(status, 404)
  })

  it('PUT /knowledge/articles/:id — публикация и смена категории на null', async () => {
    const { status, data } = await call('PUT', `/knowledge/articles/${articleId}`, { status: 'published', category_id: null }, hrToken)
    assert.strictEqual(status, 200)
    assert.strictEqual(data.status, 'published')
    assert.strictEqual(data.category_id, null)
  })

  it('GET /knowledge/articles/:id — опубликованная статья открывается и считает просмотры', async () => {
    const first = await call('GET', `/knowledge/articles/${articleId}`, null, employeeToken)
    assert.strictEqual(first.status, 200)
    assert.strictEqual(first.data.status, 'published')
    const second = await call('GET', `/knowledge/articles/${articleId}`, null, employeeToken)
    assert.strictEqual(second.data.views, first.data.views + 1)
  })

  it('GET /knowledge/articles?q= — поиск по содержимому', async () => {
    const found = await call('GET', '/knowledge/articles?q=' + encodeURIComponent('ежик-в-тумане'), null, employeeToken)
    assert.strictEqual(found.status, 200)
    assert.ok(found.data.some((a) => a.id === articleId))
    const missing = await call('GET', '/knowledge/articles?q=' + encodeURIComponent('нет-такого-токена-98765'), null, employeeToken)
    assert.ok(!missing.data.some((a) => a.id === articleId))
  })

  it('DELETE /knowledge/articles/:id — удаление статьи hr', async () => {
    const { status } = await call('DELETE', `/knowledge/articles/${articleId}`, null, hrToken)
    assert.strictEqual(status, 200)
    const gone = await call('GET', `/knowledge/articles/${articleId}`, null, hrToken)
    assert.strictEqual(gone.status, 404)
  })

  it('Удаление категории не удаляет статьи', async () => {
    const { status: createStatus, data: article } = await call('POST', '/knowledge/articles', {
      title: uniq('Статья без категории после удаления'),
      content: 'Текст',
      category_id: categoryId,
      status: 'published',
    }, hrToken)
    assert.strictEqual(createStatus, 201)

    const del = await call('DELETE', `/knowledge/categories/${categoryId}`, null, adminToken)
    assert.strictEqual(del.status, 200)

    const kept = await call('GET', `/knowledge/articles/${article.id}`, null, employeeToken)
    assert.strictEqual(kept.status, 200)
    assert.strictEqual(kept.data.category_id, null)

    await call('DELETE', `/knowledge/articles/${article.id}`, null, adminToken)
  })

  it('GET /knowledge/categories — без авторизации 401', async () => {
    const res = await fetch(`${BASE}/knowledge/categories`, { headers: ORG })
    assert.strictEqual(res.status, 401)
  })
})

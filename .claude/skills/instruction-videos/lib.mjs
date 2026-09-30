import fs from 'node:fs'
import path from 'node:path'

export const SKILL_DIR = path.dirname(new URL(import.meta.url).pathname)
export const REPO_DIR = path.resolve(SKILL_DIR, '../../..')
export const BASE = process.env.VIDEO_BASE_URL || 'http://localhost:3000'
export const OUT_DIR = process.env.VIDEO_OUT_DIR || path.join(SKILL_DIR, '.out')
const { chromium } = await import(path.join(REPO_DIR, 'node_modules/playwright/index.mjs'))
const SIZE = { width: 1440, height: 900 }

const overlayScript = () => {
  const install = () => {
    if (document.getElementById('__demo_cursor')) return
    const style = document.createElement('style')
    style.textContent = `
      #__demo_cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px;
        border-radius: 50%; background: rgba(239,68,68,.35); border: 2px solid rgba(239,68,68,.9);
        pointer-events: none; transition: transform .12s ease; left: -100px; top: -100px; }
      #__demo_cursor.down { transform: scale(.7); background: rgba(239,68,68,.6); }
      .__demo_ripple { position: fixed; z-index: 2147483646; width: 44px; height: 44px; margin: -22px 0 0 -22px;
        border-radius: 50%; border: 3px solid rgba(239,68,68,.8); pointer-events: none; animation: __demo_ripple .5s ease-out forwards; }
      @keyframes __demo_ripple { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
      #__demo_caption { position: fixed; z-index: 2147483645; left: 50%; bottom: 36px; transform: translateX(-50%);
        max-width: 82%; padding: 14px 26px; border-radius: 14px; background: rgba(15,23,42,.9); color: #fff;
        font: 600 22px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,.35); pointer-events: none; opacity: 0; transition: opacity .25s ease; }
      #__demo_caption.show { opacity: 1 }
      #__demo_caption.top { bottom: auto; top: 24px }
      #__demo_caption small { display: block; margin-top: 4px; font-weight: 400; font-size: 16px; opacity: .85 }
      html { scroll-behavior: smooth }
    `
    document.head.appendChild(style)
    const cursor = document.createElement('div')
    cursor.id = '__demo_cursor'
    document.body.appendChild(cursor)
    const caption = document.createElement('div')
    caption.id = '__demo_caption'
    document.body.appendChild(caption)
    const saved = sessionStorage.getItem('__demo_cursor_pos')
    if (saved) {
      const [x, y] = saved.split(',')
      cursor.style.left = x + 'px'
      cursor.style.top = y + 'px'
    }
    const savedCaption = sessionStorage.getItem('__demo_caption')
    if (savedCaption) {
      const c = JSON.parse(savedCaption)
      caption.innerHTML = c.html
      caption.className = c.cls
    }
    document.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px'
      cursor.style.top = e.clientY + 'px'
      sessionStorage.setItem('__demo_cursor_pos', e.clientX + ',' + e.clientY)
    }, true)
    document.addEventListener('mousedown', (e) => {
      cursor.classList.add('down')
      const r = document.createElement('div')
      r.className = '__demo_ripple'
      r.style.left = e.clientX + 'px'
      r.style.top = e.clientY + 'px'
      document.body.appendChild(r)
      setTimeout(() => r.remove(), 600)
    }, true)
    document.addEventListener('mouseup', () => cursor.classList.remove('down'), true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install)
  else install()
}

export async function startRecording(name, email) {
  const outDir = path.join(OUT_DIR, 'raw', name)
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  const browser = await chromium.launch({ args: ['--lang=ru-RU'] })
  const loginCtx = await browser.newContext()
  const loginRes = await loginCtx.request.post(`${BASE}/api/auth/login`, { data: { email, password: 'password123' } })
  if (!loginRes.ok()) throw new Error(`login failed: ${loginRes.status()} ${await loginRes.text()}`)
  await loginCtx.addCookies([
    { name: 'vacation_intro_seen', value: '1', url: BASE },
    { name: 'active_org_id', value: '1', url: BASE },
  ])
  const storageState = await loginCtx.storageState()
  await loginCtx.close()

  const ctx = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    storageState,
    locale: 'ru-RU',
    colorScheme: 'light',
    recordVideo: { dir: outDir, size: SIZE },
    acceptDownloads: true,
  })
  await ctx.addInitScript(overlayScript)
  const page = await ctx.newPage()
  let cursor = { x: SIZE.width / 2, y: SIZE.height / 2 }

  const pause = (ms) => page.waitForTimeout(ms)

  async function caption(text, sub, position = 'bottom') {
    await page.evaluate(([t, s, pos]) => {
      const el = document.getElementById('__demo_caption')
      if (!el) return
      el.innerHTML = ''
      el.append(document.createTextNode(t))
      if (s) {
        const small = document.createElement('small')
        small.textContent = s
        el.append(small)
      }
      el.className = 'show' + (pos === 'top' ? ' top' : '')
      sessionStorage.setItem('__demo_caption', JSON.stringify({ html: el.innerHTML, cls: el.className }))
    }, [text, sub || '', position])
  }

  async function hideCaption() {
    await page.evaluate(() => {
      document.getElementById('__demo_caption')?.classList.remove('show')
      sessionStorage.removeItem('__demo_caption')
    })
  }

  async function reveal(locator, block = 'center') {
    await locator.waitFor({ state: 'visible' })
    const inView = await locator.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return r.top >= 70 && r.bottom <= window.innerHeight - 150
    })
    if (!inView) {
      await locator.evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block)
      await pause(1100)
    }
  }

  async function moveTo(locator) {
    await reveal(locator)
    const box = await locator.boundingBox()
    if (!box) throw new Error('element has no box')
    const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const dist = Math.hypot(target.x - cursor.x, target.y - cursor.y)
    await page.mouse.move(target.x, target.y, { steps: Math.max(14, Math.round(dist / 16)) })
    cursor = target
  }

  async function clickOn(locator, options = {}) {
    await moveTo(locator)
    await pause(280)
    await page.mouse.down(options)
    await pause(90)
    await page.mouse.up(options)
  }

  async function typeInto(locator, text, delay = 55) {
    await clickOn(locator)
    await locator.pressSequentially(text, { delay })
  }

  async function smoothScrollTo(locator, block = 'start') {
    await locator.evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block)
    await pause(1300)
  }

  function dayCell(month, day) {
    return page
      .locator('[data-testid="month-card"]', { hasText: month })
      .first()
      .locator('[data-date-cell="true"]')
      .filter({ has: page.locator('span', { hasText: new RegExp(`^${day}$`) }) })
      .first()
  }

  async function open(pathname) {
    await page.goto(`${BASE}${pathname}`)
    await page.waitForLoadState('networkidle')
    await page.mouse.move(cursor.x, cursor.y)
    await pause(600)
  }

  async function finish(outFile) {
    await hideCaption()
    await pause(600)
    const raw = await page.video().path()
    await ctx.close()
    await browser.close()
    return { raw, outDir, outFile }
  }

  return { page, pause, caption, hideCaption, moveTo, clickOn, typeInto, reveal, smoothScrollTo, dayCell, open, finish, outDir }
}

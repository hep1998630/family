// Regression check: the full-tree view must scroll vertically.
//
//   npm run e2e:tree-scroll
//
// Starts an in-memory fake Supabase and a Next dev server pointed at it
// (never the real database), then checks with Playwright, at desktop and
// phone sizes, that the tree's scroll box fits the screen, is shorter than
// the tree, and that a mouse-wheel scroll moves it down.
import { chromium, devices } from 'playwright'
import { authCookie, checker, startApp } from './harness.mjs'
import { makeSeed } from './seed.mjs'

const seed = makeSeed()
const ROOT = seed.roots[0].id
const { check, finish } = checker()
const { app, stop } = await startApp({ seed })

try {
  const browser = await chromium.launch()
  for (const [label, opts] of [
    ['desktop 1280×800', { viewport: { width: 1280, height: 800 } }],
    ['phone 360×800', { ...devices['iPhone 13'], viewport: { width: 360, height: 800 } }],
    ['phone 412×860', { ...devices['iPhone 13'], viewport: { width: 412, height: 860 } }],
  ]) {
    for (const mode of ['view', 'edit']) {
      console.log(`── ${label} /${mode}`)
      const ctx = await browser.newContext(opts)
      if (mode === 'edit') await ctx.addCookies([authCookie()])
      await ctx.addInitScript(() => localStorage.setItem('family-tree:view', 'tree'))
      const page = await ctx.newPage()
      await page.goto(`${app}/${mode}?root=${ROOT}`)
      await page.waitForSelector('div.branch-scroll .person-node', { timeout: 60_000 })
      await page.waitForTimeout(500)

      const box = () => page.evaluate(() => {
        const s = document.querySelector('div.branch-scroll')
        return { client: s.clientHeight, scroll: s.scrollHeight, top: s.scrollTop, area: s.parentElement.clientHeight }
      })
      const before = await box()
      check(before.client <= before.area, `scroll box fits the screen (${before.client}px ≤ ${before.area}px)`)
      check(before.client < before.scroll, `tree is taller than the box, so it can scroll (${before.client} < ${before.scroll})`)

      const r = await page.locator('div.branch-scroll').boundingBox()
      await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2)
      await page.mouse.wheel(0, 500)
      await page.waitForTimeout(400)
      const after = await box()
      check(after.top > before.top, `mouse wheel scrolls down (scrollTop ${before.top} → ${after.top})`)
      await ctx.close()
    }
  }
  await browser.close()
} finally {
  await stop()
}
finish()

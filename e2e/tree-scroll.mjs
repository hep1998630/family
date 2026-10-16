// Regression check: the full-tree view must scroll vertically.
//
//   npm run e2e:tree-scroll
//
// Starts an in-memory fake Supabase and a Next dev server pointed at it
// (never the real database), then checks with Playwright, at desktop and
// phone sizes, that the tree's scroll box fits the screen, is shorter than
// the tree, and that a mouse-wheel scroll moves it down.
import { spawn } from 'node:child_process'
import { chromium, devices } from 'playwright'
import { startMockSupabase, TOKEN, USER } from './mock-supabase.mjs'
import { makeSeed } from './seed.mjs'

const MOCK_PORT = 54329
const APP_PORT = 3109
const APP = `http://localhost:${APP_PORT}`

const seed = makeSeed()
const ROOT = seed.roots[0].id
const mock = await startMockSupabase({ port: MOCK_PORT, seed })

const dev = spawn('npx', ['next', 'dev', '-p', String(APP_PORT)], {
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${MOCK_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
  },
  stdio: 'ignore',
  detached: true,
})
const stop = () => {
  try { process.kill(-dev.pid) } catch { /* already gone */ }
  mock.close()
}

/** Cookie @supabase/ssr reads as a signed-in session for the fake's user. */
function authCookie() {
  const session = {
    access_token: TOKEN, refresh_token: 'e2e-refresh-token', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER,
  }
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  return { name: 'sb-localhost-auth-token', value, domain: 'localhost', path: '/' }
}

const failures = []
const check = (ok, msg) => {
  console.log(ok ? '  ✓' : '  ✗', msg)
  if (!ok) failures.push(msg)
}

try {
  // Wait for the dev server (first compile can take a while).
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${APP}/view`)).ok) break } catch { /* not up yet */ }
    if (i > 120) throw new Error('dev server did not start')
    await new Promise(r => setTimeout(r, 1000))
  }

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
      await page.goto(`${APP}/${mode}?root=${ROOT}`)
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
  stop()
}

console.log(failures.length ? `\nFAILED:\n${failures.join('\n')}` : '\nALL PASSED')
process.exit(failures.length ? 1 : 0)

// Saved views («عروض مختارة»): landing-page cards, the view page, the tab,
// partner filter, share button, phone widths, and a missing-table fallback.
//
//   npm run e2e:saved-views            (add --shots to save screenshots)
//
// Runs against an in-memory fake Supabase — never the real database.
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { authCookie, checker, startApp } from './harness.mjs'
import { savedViewsScenario } from './scenario.mjs'

// Screenshots go to a temp dir while the dev server runs (files written
// inside the project make it recompile mid-run) and into docs/ at the end.
const SHOTS_DEST = 'docs/screenshots/saved-views/'
const SHOTS = process.argv.includes('--shots') ? fs.mkdtempSync(path.join(os.tmpdir(), 'saved-views-')) + '/' : null

const { seed, founder, mohammed, sara, mona, salma, qasim, viewSara, viewKids } = savedViewsScenario()

const { check, finish } = checker()
const phone = width => ({ ...devices['iPhone 13'], viewport: { width, height: 800 }, deviceScaleFactor: 2 })
const realNodeNames = page => page.locator('[data-testid=saved-view] .person-node:not(.reference)').allTextContents()
const waitCards = page => page.locator('[data-view-card]').first().waitFor()
const pageFits = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

let { app, stop } = await startApp({ seed })
const launched = await chromium.launch()
// First visits compile pages in the dev server, which can take a while.
const browser = {
  newContext: async opts => {
    const ctx = await launched.newContext(opts)
    ctx.setDefaultTimeout(60_000)
    return ctx
  },
  close: () => launched.close(),
}
try {
  // ── 1. Landing page → one tap → the view ──
  for (const width of [360, 390, 412]) {
    console.log(`── landing → view at ${width}px`)
    const ctx = await browser.newContext(phone(width))
    await ctx.addInitScript(() => {
      // Record what the phone share sheet would be given.
      navigator.share = async data => { window.__shared = data }
    })
    const page = await ctx.newPage()
    await page.goto(app)
    const cards = page.locator('[data-view-card]')
    await waitCards(page)
    check(await page.getByRole('heading', { name: 'عروض مختارة' }).isVisible(), 'landing page shows «عروض مختارة»')
    const titles = await cards.evaluateAll(els => els.map(e => e.querySelector('span span').textContent))
    check(JSON.stringify(titles) === JSON.stringify([viewSara.name, viewKids.name]), `cards in the admins' order (${titles.join(' | ')})`)
    check(await pageFits(page), 'landing page fits the screen width')

    await cards.first().click() // the one tap
    const panel = page.getByTestId('saved-view')
    await panel.waitFor()
    await page.locator(`#person-${mohammed.id}`).waitFor()
    await page.waitForTimeout(600)
    await page.waitForURL(`**/view?view=${viewSara.id}`, { timeout: 15_000 }).catch(() => {})
    check(page.url().endsWith(`/view?view=${viewSara.id}`), `URL is the shareable view link (${new URL(page.url()).search})`)
    check(await panel.getByRole('heading', { name: viewSara.name }).isVisible(), 'view name is the heading')
    const names = await realNodeNames(page)
    check(names.some(n => n.includes('سارة')) && !names.some(n => n.includes('منى')), 'only the chosen wife beside him')
    check(!names.some(n => n.includes('سلمى')), "the other wife's daughter is not shown")
    check(!names.some(n => n.includes('قاسم')), 'the son with no recorded mother is not shown…')
    check(await panel.getByRole('note').textContent().then(x => x.includes('ابن واحد بدون والد/والدة مسجلة لم يُعرضوا')), '…and the note says one child was left out')
    check(await page.locator(`#person-${founder.id}`).count() === 0, 'the founder (above the top person) is not in the view')
    const box = await page.locator(`#person-${mohammed.id}`).boundingBox()
    check(Math.abs(box.x + box.width / 2 - width / 2) < 4, `top person centered (${(box.x + box.width / 2).toFixed(0)} vs ${width / 2})`)
    check(await page.getByRole('button', { name: 'ملاءمة الشاشة' }).isVisible(), 'zoom / fit buttons are there')
    check(await pageFits(page), 'view page fits the screen width')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}view-${width}.png` })

    await panel.getByRole('button', { name: 'مشاركة' }).click()
    const shared = await page.evaluate(() => window.__shared)
    check(shared?.url === `${app}/view?view=${viewSara.id}` && shared?.title === viewSara.name, 'مشاركة opens the phone share sheet with the view link')
    await ctx.close()
  }

  // Full-page shots get their own context: Chromium drops touch emulation
  // after a full-page screenshot, which would skew the share check above.
  for (const width of SHOTS ? [360, 390, 412] : []) {
    const ctx = await browser.newContext(phone(width))
    const page = await ctx.newPage()
    await page.goto(app)
    await waitCards(page)
    await page.waitForTimeout(800) // fade-in
    await page.screenshot({ path: `${SHOTS}landing-${width}.png`, fullPage: true })
    await ctx.close()
  }

  // ── 2. Depth 1 view, the tab, and the full tree untouched ──
  console.log('── tabs and depth (desktop)')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await ctx.newPage()
    await page.goto(`${app}/view`)
    await page.getByRole('heading', { name: 'عروض مختارة' }).waitFor()
    check(true, 'branch picker shows «عروض مختارة» under the branch cards')

    const gone = await ctx.newPage()
    await gone.goto(`${app}/view?view=00000000-0000-4000-8000-00000000dead`)
    await gone.getByRole('alert').filter({ hasText: 'لم يعد هذا العرض متاحاً' }).waitFor()
    check(await gone.locator('[data-view-card]').count() === 2, 'a deleted view\'s link explains itself and offers the other views')
    await gone.close()
    await page.locator('[data-view-card]', { hasText: viewKids.name }).click()
    await page.getByTestId('saved-view').waitFor()
    await page.waitForTimeout(500)
    const names = await realNodeNames(page)
    check(names.some(n => n.includes('محمد')) && !names.some(n => n.includes('يوسف')), 'depth «الأبناء فقط»: children, no grandchildren')
    check(await page.locator('[data-testid=saved-view] button', { hasText: 'عرض أجيال إضافية' }).count() === 0, 'no "show more generations" buttons in a saved view')

    await page.getByTestId('saved-view').getByRole('button', { name: 'مشاركة' }).click()
    await page.getByRole('status').waitFor()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    check(copied === `${app}/view?view=${viewKids.id}`, `desktop مشاركة copies the link (${copied})`)

    await page.getByRole('button', { name: 'كل العروض' }).click()
    // Let the URL change (and the page's server re-render) finish: it must not reset the tab.
    await page.waitForURL(u => u.search.startsWith('?root='), { timeout: 15_000 })
    await page.waitForTimeout(1500)
    check(await page.locator('[data-view-card]').count() === 2, '«كل العروض» lists both views, and stays there after the URL updates')
    check(await page.getByRole('button', { name: 'العروض', exact: true }).getAttribute('aria-pressed') === 'true', 'third tab «العروض» is selected')

    await page.getByRole('button', { name: 'الشجرة', exact: true }).click()
    await page.locator(`#person-${mona.id}`).waitFor()
    check(await page.locator(`#person-${salma.id}`).count() === 1 && await page.locator(`#person-${qasim.id}`).count() === 1,
      'the full tree still shows everyone (both wives, all children)')
    // The URL updates through a Next navigation, which can trail the UI.
    const leftView = await page.waitForURL(u => !u.search.includes('view='), { timeout: 15_000 }).then(() => true, () => false)
    check(leftView, `leaving the views drops ?view= from the URL (${new URL(page.url()).search})`)
    await ctx.close()
  }

  // ── 3. Edit mode names the children to fix ──
  console.log('── edit mode')
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await ctx.addCookies([authCookie()])
    const page = await ctx.newPage()
    await page.goto(`${app}/edit?view=${viewSara.id}`)
    const note = page.getByTestId('saved-view').getByRole('note')
    await note.waitFor()
    check((await note.textContent()).includes('قاسم'), 'admins see which child to fix (قاسم)')
    await ctx.close()
  }
} finally {
  await browser.close()
  await stop()
}

// ── 4. Before migration 005: pages still load, just without views ──
console.log('── saved_views table missing')
;({ app, stop } = await startApp({ seed, missingTables: ['saved_views'] }))
try {
  for (const path of ['/', '/view', `/view?view=${viewSara.id}`]) {
    const res = await fetch(app + path)
    const html = await res.text()
    check(res.status === 200 && !html.includes('عروض مختارة'), `${path} loads (HTTP ${res.status}) without views`)
  }
} finally {
  await stop()
}
if (SHOTS) {
  fs.mkdirSync(SHOTS_DEST, { recursive: true })
  for (const f of fs.readdirSync(SHOTS)) fs.copyFileSync(SHOTS + f, SHOTS_DEST + f)
}
finish()

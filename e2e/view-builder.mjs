// Admin view builder: create (with live preview), edit, reorder, delete,
// the profile shortcut, unsaved people, a failed save, and a 360px phone.
//
//   npm run e2e:view-builder            (add --shots to save screenshots)
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
const SHOTS_DEST = 'docs/screenshots/view-builder/'
const SHOTS = process.argv.includes('--shots') ? fs.mkdtempSync(path.join(os.tmpdir(), 'view-builder-')) + '/' : null

const { seed, founder, mohammed, sara, mona, salma, viewSara, viewKids } = savedViewsScenario()
const ROOT = seed.roots[0].id
const { check, finish } = checker()
const { app, mockUrl, stop } = await startApp({ seed })
const db = async () => (await (await fetch(`${mockUrl}/__mock/state`)).json()).db
const failNext = (table, method) => fetch(`${mockUrl}/__mock/fail`, { method: 'POST', body: JSON.stringify({ table, method, mode: 'before' }) })

const launched = await chromium.launch()
const newPage = async opts => {
  const ctx = await launched.newContext(opts)
  ctx.setDefaultTimeout(60_000) // first visits compile pages in the dev server
  await ctx.addCookies([authCookie()])
  await ctx.addInitScript(() => localStorage.setItem('family-tree:view', 'tree'))
  return ctx.newPage()
}

try {
  const page = await newPage({ viewport: { width: 1280, height: 860 } })
  const builder = page.getByTestId('view-builder')
  const manager = page.getByTestId('view-manager')
  await page.goto(`${app}/edit?root=${ROOT}`)
  await page.locator(`#person-${founder.id}`).waitFor()

  // ── 1. Create a view, watching the live preview ──
  console.log('── create')
  await page.getByRole('button', { name: 'العروض', exact: true }).click()
  await manager.getByRole('button', { name: '+ إنشاء عرض جديد' }).click()
  await builder.getByLabel('يبدأ العرض من').fill('محمد')
  const option = builder.getByRole('option', { name: /محمد مصطفى/ })
  check(await option.isVisible(), 'search shows lineage names («محمد مصطفى»)')
  await option.click()
  const partnerSelect = builder.getByLabel('من الزوجة')
  check(await partnerSelect.isEnabled(), 'partner select is enabled for a married man')
  const partnerOptions = await partnerSelect.locator('option').allTextContents()
  check(partnerOptions[0] === 'الكل' && partnerOptions.length === 3, `partner choices: ${partnerOptions.join(' / ')}`)
  const preview = builder.locator('.person-node:not(.reference)')
  await page.locator(`[data-testid=view-builder] [id="person-${mohammed.id}"]`).waitFor()
  let shown = await preview.allTextContents()
  check(shown.some(t => t.includes('منى')) && shown.some(t => t.includes('سارة')), 'preview: both wives with «الكل»')

  await partnerSelect.selectOption({ label: 'منى' })
  await page.waitForTimeout(300)
  shown = await preview.allTextContents()
  check(shown.some(t => t.includes('سلمى')) && !shown.some(t => t.includes('سارة')), 'preview updates live: only منى and her daughter')
  check((await builder.getByRole('note').textContent()).includes('قاسم'), 'preview names the child left out (قاسم)')
  check(await builder.getByLabel('اسم العرض').inputValue() === 'ذرية محمد مصطفى من منى', 'name is suggested from the choices')
  await builder.getByRole('radio', { name: 'الأبناء فقط' }).click()
  await page.waitForTimeout(300)
  check(!(await preview.allTextContents()).some(t => t.includes('يوسف')), 'preview follows the depth')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}builder-desktop.png` })

  // A failed save keeps the form and says why; retrying works.
  await failNext('saved_views', 'POST')
  await builder.getByRole('button', { name: 'حفظ العرض' }).click()
  const alert = builder.getByRole('alert')
  await alert.waitFor()
  check((await alert.textContent()).includes('تعذّر حفظ العرض'), 'a failed save shows an Arabic error with the reason')
  await builder.getByRole('button', { name: 'حفظ العرض' }).dblclick()
  await page.getByTestId('saved-view').waitFor()
  let views = (await db()).saved_views
  const created = views.find(v => v.name === 'ذرية محمد مصطفى من منى')
  check(views.length === 3, `saved once despite the double click (${views.length} views)`)
  check(created?.top_person_id === mohammed.id && created.partner_id === mona.id && created.depth === 1 && created.sort_order === 2,
    'stored: top person, partner, depth 1, last in the list')
  check(await page.getByTestId('saved-view').getByRole('heading', { name: 'ذرية محمد مصطفى من منى' }).isVisible(), 'the new view opens after saving')

  // ── 2. Edit it ──
  console.log('── edit')
  await page.getByTestId('saved-view').getByRole('button', { name: 'تعديل' }).click()
  check(await builder.getByLabel('من الزوجة').inputValue() === mona.id, 'edit opens with the saved settings')
  await builder.getByRole('radio', { name: 'كل الذرية' }).click()
  await builder.getByLabel('اسم العرض').fill('ذرية محمد من منى')
  await builder.getByRole('button', { name: 'حفظ العرض' }).click()
  await page.getByTestId('saved-view').getByRole('heading', { name: 'ذرية محمد من منى' }).waitFor()
  const edited = (await db()).saved_views.find(v => v.id === created.id)
  check(edited.name === 'ذرية محمد من منى' && edited.depth === null, 'edit saved (new name, all generations)')

  // ── 3. Reorder and delete ──
  console.log('── reorder and delete')
  await page.getByRole('button', { name: 'كل العروض' }).click()
  const order = async () => manager.locator('[data-view-row]').evaluateAll(rows => rows.map(r => r.querySelector('[data-view-card] span span').textContent))
  check(JSON.stringify(await order()) === JSON.stringify([viewSara.name, viewKids.name, 'ذرية محمد من منى']), 'list starts in sort order')
  await manager.locator(`[data-view-row="${created.id}"]`).getByRole('button', { name: 'تحريك لأعلى' }).click()
  await page.waitForTimeout(300)
  const afterMove = await order()
  check(JSON.stringify(afterMove) === JSON.stringify([viewSara.name, "ذرية محمد من منى", viewKids.name]), "moved up one place")
  views = (await db()).saved_views
  const sortOf = id => views.find(v => v.id === id).sort_order
  check(sortOf(viewSara.id) < sortOf(created.id) && sortOf(created.id) < sortOf(viewKids.id), 'new order stored')

  const row = manager.locator(`[data-view-row="${viewKids.id}"]`)
  await row.getByRole('button', { name: 'حذف' }).click()
  await row.getByRole('button', { name: 'إلغاء' }).click()
  check((await db()).saved_views.length === 3, 'cancelling the delete keeps the view')
  await row.getByRole('button', { name: 'حذف' }).click()
  await row.getByRole('button', { name: 'حذف' }).click() // confirm
  await row.waitFor({ state: 'detached' })
  check(!(await db()).saved_views.some(v => v.id === viewKids.id), 'confirmed delete removes it')

  // ── 4. Shortcut from a person's profile ──
  console.log('── profile shortcut')
  await page.getByRole('button', { name: 'الشجرة', exact: true }).click()
  const node = page.locator(`#person-${salma.id}`)
  await node.click() // first click shows the add buttons
  await node.click() // second opens the profile
  await page.getByRole('button', { name: 'إنشاء عرض لذرية هذا الشخص' }).click()
  await builder.waitFor()
  check((await builder.getByTestId('vb-top').textContent()).includes('سلمى محمد'), 'builder opens prefilled with that person')
  check(await builder.getByLabel('من الزوج').isDisabled(), 'partner select is disabled when there is no partner')
  check(await builder.getByLabel('من الزوج').locator('option').first().textContent() === 'لا يوجد أزواج مسجلون', '…and says so')
  await builder.getByRole('button', { name: 'إلغاء' }).click()

  // ── 5. Someone not saved yet can't be the top of a saved view ──
  console.log('── unsaved person')
  await page.getByRole('button', { name: 'الشجرة', exact: true }).click()
  await node.click()
  await node.getByRole('button', { name: 'شريك' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'أضف شخصاً جديداً' }).click()
  await dialog.getByPlaceholder('الاسم الكامل').fill('خالد')
  await dialog.getByRole('button', { name: 'إضافة شريك' }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'العروض', exact: true }).click()
  await manager.getByRole('button', { name: '+ إنشاء عرض جديد' }).click()
  await builder.getByLabel('يبدأ العرض من').fill('سلمى')
  await builder.getByRole('option', { name: /سلمى/ }).click()
  await builder.getByLabel('من الزوج').selectOption({ label: 'خالد' })
  await builder.getByRole('button', { name: 'حفظ العرض' }).click()
  check((await builder.getByRole('alert').textContent()).includes('اضغط «حفظ» في الأعلى أولاً'), 'asks to save the tree first')
  check((await db()).saved_views.length === 2, 'nothing was written')
  await page.getByRole('button', { name: 'حفظ', exact: true }).click()
  await page.getByRole('button', { name: 'حفظ', exact: true }).isDisabled()
  await page.waitForFunction(() => !document.body.innerText.includes('جارٍ الحفظ'))
  await page.waitForTimeout(500)
  await builder.getByRole('button', { name: 'حفظ العرض' }).click()
  await page.getByTestId('saved-view').waitFor()
  check((await db()).saved_views.some(v => v.top_person_id === salma.id), 'after saving the tree, the view saves')
  await page.context().close()

  // ── 6. Phone (360px) ──
  console.log('── 360px phone')
  const phone = await newPage({ ...devices['iPhone 13'], viewport: { width: 360, height: 800 }, deviceScaleFactor: 2 })
  await phone.goto(`${app}/edit?root=${ROOT}`)
  await phone.getByRole('button', { name: 'العروض', exact: true }).click()
  const phoneManager = phone.getByTestId('view-manager')
  await phoneManager.waitFor()
  const fits = () => phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  check(await fits(), 'views list fits 360px')
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}manager-360.png` })
  await phoneManager.getByRole('button', { name: '+ إنشاء عرض جديد' }).click()
  const phoneBuilder = phone.getByTestId('view-builder')
  await phoneBuilder.getByLabel('يبدأ العرض من').fill('محمد')
  await phoneBuilder.getByRole('option', { name: /محمد مصطفى/ }).click()
  await phoneBuilder.getByLabel('من الزوجة').selectOption({ label: 'سارة' })
  check(await fits(), 'builder fits 360px')
  const saveBox = await phoneBuilder.getByRole('button', { name: 'حفظ العرض' }).boundingBox()
  check(saveBox.width >= 150 && saveBox.height >= 48, `save button is a big target (${saveBox.width.toFixed(0)}×${saveBox.height.toFixed(0)})`)
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}builder-360.png` })
  await phoneBuilder.locator('[aria-label="معاينة"]').scrollIntoViewIfNeeded()
  check(await phoneBuilder.locator(`[id="person-${mohammed.id}"]`).isVisible(), 'preview is reachable below the form')
  if (SHOTS) await phone.screenshot({ path: `${SHOTS}builder-preview-360.png` })
  check(!(await phoneBuilder.locator('.person-node').allTextContents()).some(t => t.includes('منى')), 'preview at 360px honours the partner')
  await phone.context().close()
} finally {
  await launched.close()
  await stop()
}
if (SHOTS) {
  fs.mkdirSync(SHOTS_DEST, { recursive: true })
  for (const f of fs.readdirSync(SHOTS)) fs.copyFileSync(SHOTS + f, SHOTS_DEST + f)
}
finish()

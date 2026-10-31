// Search, tree layout and form checks, against the fake Supabase (never the
// real database):
//  1. Arabic search finds names however hamza / ة / ى are typed;
//  2. the edit page opens no live (realtime) connection; the view page does;
//  3. form labels are linked to their fields (login, profile);
//  4. no «عرض أجيال إضافية» button covers a card, in the real page;
//  5. searching for someone five generations down shows and highlights them.
//
//   npm run e2e:search-layout
import { chromium } from 'playwright'
import { authCookie, checker, startApp } from './harness.mjs'
import { makeSeed } from './seed.mjs'

const t = '2026-01-01T00:00:00.000Z'
const seed = makeSeed()
const ROOT = seed.roots[0].id
const base = seed.people[0]
let n = 0
const id = () => `00000000-0000-4000-8000-0000000e${String(++n).padStart(4, '0')}`
const add = (name, gender, parentIds, extra = {}) => {
  const p = { ...base, id: id(), name, gender, mother_id: null, photo_url: null, created_at: t, ...extra }
  seed.people.push(p)
  for (const parent of parentIds) seed.parent_child.push({ id: id(), parent_id: parent, child_id: p.id, created_at: t })
  return p
}
// Under يوسف (محمد's son, generation 2): two children, each with a child of
// their own — at the default depth (3) both are cut off and stacked, each
// with a «عرض أجيال إضافية» button under it.
const mohammed = seed.people.find(p => p.name === 'محمد')
const yusuf = seed.people.find(p => p.name === 'يوسف' && seed.parent_child.some(r => r.parent_id === mohammed.id && r.child_id === p.id))
const g3a = add('حمزة', 'male', [yusuf.id])
const g3b = add('رقية', 'female', [yusuf.id])
add('ابن حمزة', 'male', [g3a.id])
const deep = add('ابنة رقية', 'female', [g3b.id]) // generation 4: hidden at depth 3

const { check, finish } = checker()
const { app, stop } = await startApp({ seed })
const browser = await chromium.launch()
try {
  // ── 1. Arabic search (view page) ──
  const view = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const sockets = []
  view.on('websocket', ws => sockets.push(ws.url()))
  await view.addInitScript(() => localStorage.setItem('family-tree:view', 'tree'))
  await view.goto(`${app}/view?root=${ROOT}`)
  const search = view.getByRole('combobox', { name: 'البحث في أفراد العائلة' }).or(view.getByLabel('البحث في أفراد العائلة')).first()
  for (const [typed, expected] of [['احمد', 'أحمد'], ['فاطمه', 'فاطمة'], ['مصطفي', 'مصطفى'], ['ابراهيم', 'إبراهيم']]) {
    await search.fill(typed)
    const hit = view.locator('mark', { hasText: expected }).first()
    await hit.waitFor({ timeout: 5000 }).catch(() => {})
    check(await hit.isVisible(), `«${typed}» finds «${expected}» (highlighted)`)
  }
  await search.fill('')

  // ── 4. no button covers a card ──
  await view.waitForSelector('.person-node')
  const overlap = await view.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].filter(b => b.textContent.includes('عرض أجيال إضافية'))
    const nodes = [...document.querySelectorAll('.person-node')]
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    return { buttons: buttons.length, overlaps: buttons.filter(b => nodes.some(nd => hit(b.getBoundingClientRect(), nd.getBoundingClientRect()))).length }
  })
  check(overlap.buttons >= 2, `there are «عرض أجيال إضافية» buttons (${overlap.buttons})`)
  check(overlap.overlaps === 0, `none of them covers a card (${overlap.overlaps} overlap)`)

  // ── 5. search for someone hidden below the depth cap ──
  check(await view.locator(`#person-${deep.id}`).count() === 0, 'generation 4 is hidden at first')
  await search.fill('ابنه رقيه')
  await view.locator('[role="option"], li button, ul button').filter({ hasText: 'ابنة رقية' }).first().click()
  await view.locator(`#person-${deep.id}`).waitFor({ timeout: 10_000 }).catch(() => {})
  check(await view.locator(`#person-${deep.id}`).count() === 1, 'searching for her shows her node')
  await view.waitForFunction(i => document.getElementById(`person-${i}`)?.classList.contains('person-node--highlighted'), deep.id, { timeout: 5000 }).catch(() => {})
  check(await view.locator(`#person-${deep.id}.person-node--highlighted`).count() === 1, 'and highlights it')

  // ── 2. live connection: view page yes, edit page no ──
  check(sockets.some(u => u.includes('/realtime/')), `the view page opens a live connection (${sockets.length})`)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addCookies([authCookie()])
  await ctx.addInitScript(() => localStorage.setItem('family-tree:view', 'family'))
  const edit = await ctx.newPage()
  const editSockets = []
  edit.on('websocket', ws => editSockets.push(ws.url()))
  await edit.goto(`${app}/edit?root=${ROOT}&focus=${mohammed.id}`)
  await edit.getByTestId('family-view').waitFor()
  await edit.waitForTimeout(3000)
  check(editSockets.filter(u => u.includes('/realtime/')).length === 0, `the edit page opens none (${editSockets.length})`)

  // ── people list search (edit page) ──
  await edit.getByRole('button', { name: 'قائمة الأشخاص' }).click()
  await edit.getByPlaceholder('ابحث بالاسم…').fill('خديجه')
  check(await edit.getByText('خديجة', { exact: true }).count() > 0, '«خديجه» in the people list finds «خديجة»')
  await edit.keyboard.press('Escape')
  await edit.getByRole('button', { name: 'إغلاق' }).click().catch(() => {})

  // ── 3. labels are linked to their fields ──
  await edit.getByRole('button', { name: 'تعديل', exact: true }).click()
  const dialog = edit.getByRole('dialog')
  check(await dialog.getByLabel('الاسم').inputValue() === 'محمد', 'profile: «الاسم» labels its field')
  check(await dialog.getByLabel('الأب').evaluate(el => el.tagName) === 'SELECT', 'profile: «الأب» labels its list')
  await dialog.getByLabel('الاسم').fill('')
  await dialog.getByRole('button', { name: 'حفظ', exact: true }).click()
  const nameField = dialog.getByLabel('الاسم')
  const described = await nameField.getAttribute('aria-describedby')
  check(await nameField.getAttribute('aria-invalid') === 'true' && !!described
    && (await edit.locator(`[id="${described}"]`).textContent()) === 'الاسم مطلوب', 'profile: the error is linked to its field')

  const login = await browser.newPage()
  await login.goto(`${app}/login`)
  await login.getByText('البريد الإلكتروني').click()
  check(await login.evaluate(() => document.activeElement?.getAttribute('type')) === 'email', 'login: tapping «البريد الإلكتروني» focuses the field')
  check(await login.getByLabel('كلمة المرور').getAttribute('type') === 'password', 'login: «كلمة المرور» labels its field')
} finally {
  await browser.close()
  await stop()
}
finish()

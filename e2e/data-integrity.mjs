// Data-safety checks on the edit page, against the fake Supabase (never the
// real database):
//  1. editing only a bio keeps BOTH parent links (parents without gender);
//  2. a child added from a married-in mother's card joins the father's branch;
//  3. «has children» also counts a child linked only by mother_id;
//  4. deleting a person is one step (delete_person); if it fails, nothing is
//     deleted and «إلغاء الحذف» brings the person back so the rest saves;
//  5. logging out / leaving with unsaved changes asks first;
//  6. more than 1000 people are all loaded (page by page).
//
//   npm run e2e:data-integrity
import { chromium } from 'playwright'
import { authCookie, checker, startApp } from './harness.mjs'
import { makeSeed } from './seed.mjs'

const t = '2026-01-01T00:00:00.000Z'
const seed = makeSeed()
const ROOT = seed.roots[0].id
const base = seed.people[0]
let n = 0
const id = () => `00000000-0000-4000-8000-0000000d${String(++n).padStart(4, '0')}`
const add = (name, extra = {}) => {
  const p = { ...base, id: id(), name, gender: null, mother_id: null, photo_url: null, created_at: t, ...extra }
  seed.people.push(p); return p
}
const link = (parent, child) => seed.parent_child.push({ id: id(), parent_id: parent.id, child_id: child.id, created_at: t })
const marry = (a, b) => seed.partnerships.push({ id: id(), person_a_id: a.id, person_b_id: b.id, created_at: t })

// 1. Two parents whose gender was never set, and their child.
const p1 = add('والد غير محدد'), p2 = add('والدة غير محددة')
marry(p1, p2)
const kid = add('نور', { gender: 'female' })
link(p1, kid); link(p2, kid)
// 2. هند from another branch married علي (this branch).
const B = '00000000-0000-4000-8000-0000000db000'
seed.roots.push({ id: B, name: 'عائلة هند', canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t })
const ali = seed.people.find(p => p.name === 'علي')
const hind = add('هند', { gender: 'female', root_id: B })
marry(ali, hind)
// 3. سلمى's son is linked to her only by mother_id (an older row).
const salma = add('سلمى', { gender: 'female' })
add('ابن سلمى', { gender: 'male', mother_id: salma.id })
// 4. Someone deletable: married, no children.
const lone = add('وحيد', { gender: 'male' })
const loneWife = add('زوجة وحيد', { gender: 'female' })
marry(lone, loneWife)
// 6. A big unconnected branch: more than 1000 people in all.
const BIG = '00000000-0000-4000-8000-0000000dc000'
seed.roots.push({ id: BIG, name: 'فرع كبير', canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t })
for (let i = 0; i < 1100; i++) add(`شخص-${i}`, { root_id: BIG, created_at: `2026-02-01T00:00:00.000Z` })

const { check, finish } = checker()
const { app, mockUrl, stop } = await startApp({ seed })
const db = async () => (await (await fetch(`${mockUrl}/__mock/state`)).json()).db
const browser = await chromium.launch()
try {
  // ── 6. all people loaded ──
  const html = await (await fetch(`${app}/view?root=${BIG}`)).text()
  check(html.includes('شخص-1099') && html.includes('شخص-0'), `more than 1000 people: all ${seed.people.length} are loaded`)

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  ctx.setDefaultTimeout(60_000)
  await ctx.addCookies([authCookie()])
  await ctx.addInitScript(() => localStorage.setItem('family-tree:view', 'family'))
  const page = await ctx.newPage()
  const open = async person => {
    await page.goto(`${app}/edit?root=${person.root_id}&focus=${person.id}`)
    await page.getByTestId('family-view').waitFor()
  }
  const save = async () => {
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await page.waitForFunction(() => !document.body.innerText.includes('جارٍ الحفظ'))
    await page.waitForTimeout(300)
  }

  // ── 1. edit only the bio of a child with two ungendered parents ──
  await open(kid)
  await page.getByRole('button', { name: 'تعديل', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('textarea').fill('تحب القراءة')
  await dialog.getByRole('button', { name: 'حفظ', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await save()
  let d = await db()
  const kidLinks = d.parent_child.filter(r => r.child_id === kid.id).map(r => r.parent_id).sort()
  check(d.people.find(p => p.id === kid.id).bio === 'تحب القراءة', 'the bio was saved')
  check(JSON.stringify(kidLinks) === JSON.stringify([p1.id, p2.id].sort()), `both parent links kept (${kidLinks.length} of 2)`)

  // ── 2. add a child from هند's card, father علي ──
  await open(hind)
  await page.getByRole('button', { name: '+ ابن/ابنة' }).click()
  const addDialog = page.getByRole('dialog')
  await addDialog.getByPlaceholder('الاسم الكامل').fill('سارة')
  const fatherSelect = addDialog.locator('select').first()
  if (await fatherSelect.count()) await fatherSelect.selectOption(ali.id).catch(() => {})
  await addDialog.getByRole('button', { name: 'إضافة ابن/ابنة' }).click()
  await addDialog.waitFor({ state: 'detached' })
  await save()
  d = await db()
  const sara = d.people.find(p => p.name === 'سارة' && d.parent_child.some(r => r.child_id === p.id && r.parent_id === hind.id))
  check(sara?.root_id === ali.root_id, `the child joined the father's branch (${sara?.root_id === ROOT ? 'علي’s' : 'هند’s'})`)

  // ── 3. delete guard counts mother_id-only children ──
  await open(salma)
  await page.getByRole('button', { name: 'تعديل', exact: true }).click()
  check(await page.getByRole('dialog').getByText('لا يمكن الحذف — لديه أبناء').count() > 0, 'سلمى (child only via mother_id) can’t be deleted')
  await page.keyboard.press('Escape')

  // ── 4. delete fails → nothing deleted → «إلغاء الحذف» brings him back ──
  await open(lone)
  await page.getByRole('button', { name: 'تعديل', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'حذف الشخص' }).click()
  await page.getByRole('button', { name: 'نعم، احذف' }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
  await fetch(`${mockUrl}/__mock/fail`, { method: 'POST', body: JSON.stringify({ table: 'rpc', method: 'delete_person' }) })
  await save()
  d = await db()
  check(d.people.some(p => p.id === lone.id) && d.partnerships.some(p => p.person_a_id === lone.id || p.person_b_id === lone.id),
    'a failed delete leaves the person and his marriage untouched')
  const banner = page.getByRole('alert').filter({ hasText: 'تعذّر حذف' })
  check(await banner.isVisible(), 'the error names the delete and offers «إلغاء الحذف»')
  await banner.getByRole('button', { name: 'إلغاء الحذف' }).click()
  check(!(await banner.isVisible()), 'the error goes away')
  check(!(await page.getByRole('button', { name: 'حفظ', exact: true }).isEnabled()), 'nothing left to save')
  const heading = page.getByTestId('family-view').getByRole('heading', { name: 'وحيد', exact: true })
  await heading.waitFor({ timeout: 5000 }).catch(() => {})
  check(await heading.isVisible(), 'he is back on the page, without reloading')

  // ...and a real delete: person and marriage gone in one request.
  await page.getByRole('button', { name: 'تعديل', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'حذف الشخص' }).click()
  await page.getByRole('button', { name: 'نعم، احذف' }).click()
  await save()
  d = await db()
  check(!d.people.some(p => p.id === lone.id) && !d.partnerships.some(p => p.person_a_id === lone.id || p.person_b_id === lone.id),
    'deleted: the person and his marriage, together')

  // ── 5. unsaved changes: logout and leaving ask first ──
  await open(kid)
  await page.getByRole('button', { name: 'تعديل', exact: true }).click()
  await page.getByRole('dialog').locator('textarea').fill('تغيير لم يُحفظ')
  await page.getByRole('dialog').getByRole('button', { name: 'حفظ', exact: true }).click()
  await page.getByRole('button', { name: /^الحساب/ }).click()
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click()
  check(await page.getByText('لديك تغييرات لم تُحفظ').isVisible(), 'logout with unsaved changes asks first')
  await page.getByRole('button', { name: 'البقاء' }).click()
  check(page.url().includes('/edit'), '«البقاء» stays on the page')
  let asked = false
  page.on('dialog', dlg => { asked = dlg.type() === 'beforeunload'; dlg.dismiss() })
  await page.close({ runBeforeUnload: true })
  await new Promise(r => setTimeout(r, 1000))
  check(asked, 'closing the tab with unsaved changes asks first')
} finally {
  await browser.close()
  await stop()
}
finish()

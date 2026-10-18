// An EDITOR correcting a father and removing a marriage — before and
// after migration 006 — plus the confirm dialog for removing a marriage.
//
//   npm run e2e:editor-permissions
//
// "Before 006" is simulated like the real database behaves: RLS refuses
// the link deletes, and the request still "succeeds" with 0 rows.
// Runs against an in-memory fake Supabase — never the real database.
import { chromium } from 'playwright'
import { authCookie, checker, startApp } from './harness.mjs'
import { makeSeed } from './seed.mjs'
import { USER } from './mock-supabase.mjs'

const seed = makeSeed()
const ROOT = seed.roots[0].id
const t = '2026-01-01T00:00:00.000Z'
const childrenOf = id => seed.parent_child.filter(r => r.parent_id === id).map(r => seed.people.find(p => p.id === r.child_id))
const byName = name => seed.people.find(p => p.name === name)
const mohammed = byName('محمد'), ahmad = byName('أحمد'), ali = byName('علي')
// A cousin marriage: محمد's son عمر marries أحمد's daughter زينب. She has her
// own place in the tree, so beside him she's a reference card with «إزالة الشراكة».
const omar = childrenOf(mohammed.id).find(p => p.name === 'عمر')
const zainab = childrenOf(ahmad.id).find(p => p.name === 'زينب')
seed.partnerships.push({ id: '00000000-0000-4000-8000-0000000000c1', person_a_id: omar.id, person_b_id: zainab.id, created_at: t })
seed.admins = [{ id: USER.id, role: 'editor', name: 'محرر', created_at: t }]
// The son whose father we "correct" from محمد to علي.
const son = childrenOf(mohammed.id).find(p => p.name === 'يوسف')

const { check, finish } = checker()
const PERMISSION = 'لم يتم الحفظ: ليس لديك صلاحية لهذا التعديل'

async function run(label, refuse) {
  console.log(`── editor, ${label}`)
  const { app, mockUrl, stop } = await startApp({ seed: structuredClone(seed), refuse })
  const db = async () => (await (await fetch(`${mockUrl}/__mock/state`)).json()).db
  const parentsOf = async id => (await db()).parent_child.filter(r => r.child_id === id).map(r => r.parent_id)
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    ctx.setDefaultTimeout(60_000)
    await ctx.addCookies([authCookie()])
    await ctx.addInitScript(() => localStorage.setItem('family-tree:view', 'tree'))
    const page = await ctx.newPage()
    await page.goto(`${app}/edit?root=${ROOT}`)
    const save = page.getByRole('button', { name: 'حفظ', exact: true })
    const saveAndWait = async () => {
      await save.click()
      await page.waitForFunction(() => !document.body.innerText.includes('جارٍ الحفظ'))
      await page.waitForTimeout(300)
    }

    // ── 1. Correct the son's father: محمد → علي ──
    const before = await parentsOf(son.id)
    const node = page.locator(`#person-${son.id}`)
    await node.scrollIntoViewIfNeeded()
    await node.click(); await node.click() // activate, then open the profile
    const dialog = page.getByRole('dialog')
    await dialog.locator('xpath=.//label[normalize-space()="الأب"]/following-sibling::select').selectOption(ali.id)
    await dialog.getByRole('button', { name: 'حفظ', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await saveAndWait()
    const after = await parentsOf(son.id)
    const alert = page.getByRole('alert').filter({ hasText: 'لم يتم الحفظ' })
    if (refuse.length) {
      check(await alert.isVisible() && (await alert.textContent()).includes(PERMISSION), 'the save says «لم يتم الحفظ: ليس لديك صلاحية لهذا التعديل»')
      check(after.includes(mohammed.id) && !after.includes(ali.id), `no extra father added (parents before ${before.length}, after ${after.length})`)
    } else {
      check(!(await alert.isVisible()), 'no permission error')
      check(after.includes(ali.id) && !after.includes(mohammed.id), 'father corrected: محمد unlinked, علي linked')
      check(after.length <= before.length, `no extra parent (${before.length} → ${after.length})`)
    }

    // ── 2. Remove the cousin marriage, with confirmation ──
    if (refuse.length) await page.reload() // drop the refused change, as the message says
    await page.locator(`#person-${omar.id}`).waitFor()
    const ref = page.locator('.person-node.reference', { hasText: 'زينب' }).first()
    await ref.scrollIntoViewIfNeeded()
    await ref.click()
    await ref.getByRole('button', { name: 'إزالة الشراكة' }).click()
    const confirm = page.getByRole('dialog')
    check((await confirm.textContent()).includes('هل تريد إزالة هذا الزواج؟') && (await confirm.textContent()).includes('لن يُحذف أي شخص'),
      'asks «هل تريد إزالة هذا الزواج؟ … لن يُحذف أي شخص»')
    await confirm.getByRole('button', { name: 'إلغاء' }).click()
    await confirm.waitFor({ state: 'detached' })
    check(await page.locator('.person-node.reference', { hasText: 'زينب' }).count() > 0, 'cancel keeps the marriage')

    await ref.click()
    await ref.getByRole('button', { name: 'إزالة الشراكة' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'إزالة الزواج' }).click()
    await saveAndWait()
    const married = (await db()).partnerships.some(p => [p.person_a_id, p.person_b_id].sort().join() === [omar.id, zainab.id].sort().join())
    if (refuse.length) {
      check(await alert.isVisible(), 'refused removal is reported, not shown as saved')
      check(married, 'marriage still stored')
    } else {
      check(!(await alert.isVisible()) && !married, 'marriage removed, both people kept')
      check((await db()).people.some(p => p.id === zainab.id) && (await db()).people.some(p => p.id === omar.id), 'nobody deleted')
    }
    await ctx.close()
  } finally {
    await browser.close()
    await stop()
  }
}

await run('BEFORE migration 006 (link deletes refused)', [['parent_child', 'DELETE'], ['partnerships', 'DELETE']])
await run('AFTER migration 006', [])
finish()

// «تصدير العائلة»: export from the account menu, then open the downloaded
// zip and check what's inside. Also: unsaved changes block the export.
//
//   npm run e2e:family-export
//
// Runs against an in-memory fake Supabase — never the real database.
import { chromium, devices } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { parse } from 'gedcom'
import { authCookie, checker, startApp } from './harness.mjs'
import { PNG_1PX } from './mock-supabase.mjs'
import { makeSeed } from './seed.mjs'

// --shots: screenshots go to a temp dir during the run (writing inside the
// project makes the dev server recompile) and into docs/ at the end.
const SHOTS_DEST = 'docs/screenshots/family-export/'
const SHOTS = process.argv.includes('--shots') ? fs.mkdtempSync(path.join(os.tmpdir(), 'family-export-')) + '/' : null
const MOCK = 'http://localhost:54329'
const t = '2026-01-01T00:00:00.000Z'
const seed = makeSeed()
const ROOT = seed.roots[0].id
const byName = name => seed.people.find(p => p.name === name)
const founder = seed.people[0]
const mohammed = byName('محمد')
const omar = seed.people.find(p => p.name === 'عمر' && seed.parent_child.some(r => r.parent_id === mohammed.id && r.child_id === p.id))

// A second branch; its daughter سارة marries عمر — in branch A she's a shortcut row.
const B = '00000000-0000-4000-8000-0000000000b0'
const person = (id, name, gender, root, extra = {}) => ({ ...founder, id, name, gender, root_id: root, mother_id: null, photo_url: null, created_at: t, ...extra })
seed.roots.push({ id: B, name: 'عائلة يوسف', canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t })
const yusuf = person('00000000-0000-4000-8000-0000000000b1', 'يوسف', 'male', B, { created_at: '2025-06-01T00:00:00.000Z' })
const sara = person('00000000-0000-4000-8000-0000000000b2', 'سارة', 'female', B, {
  photo_url: `${MOCK}/storage/v1/object/public/avatars/missing-sara.png` })
const saraShortcut = person('00000000-0000-4000-8000-0000000000b3', 'سارة', 'female', ROOT, { is_shortcut: true, original_person_id: sara.id })
const baby = person('00000000-0000-4000-8000-0000000000b4', 'ليلى', 'female', ROOT, { mother_id: saraShortcut.id, birth_date: 'حوالي 2010' })
seed.people.push(yusuf, sara, saraShortcut, baby)
seed.partnerships.push({ id: '00000000-0000-4000-8000-0000000000b5', person_a_id: omar.id, person_b_id: saraShortcut.id, created_at: t })
seed.parent_child.push(
  { id: '00000000-0000-4000-8000-0000000000b6', parent_id: yusuf.id, child_id: sara.id, created_at: t },
  { id: '00000000-0000-4000-8000-0000000000b7', parent_id: omar.id, child_id: baby.id, created_at: t },
  { id: '00000000-0000-4000-8000-0000000000b8', parent_id: saraShortcut.id, child_id: baby.id, created_at: t },
)
founder.photo_url = `${MOCK}/storage/v1/object/public/avatars/${founder.id}.png`
mohammed.photo_url = `${MOCK}/storage/v1/object/public/avatars/${mohammed.id}.png`
// Their files exist; سارة's (missing-sara.png) was never uploaded, so it 404s.
seed.files = Object.fromEntries([founder, mohammed].map(p => [`avatars/${p.id}.png`, { body: PNG_1PX, type: 'image/png' }]))
const realPeople = seed.people.filter(p => !p.is_shortcut)

const { check, finish } = checker()
const { app, stop } = await startApp({ seed, photoDelayMs: 400 })
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, acceptDownloads: true })
  ctx.setDefaultTimeout(60_000)
  await ctx.addCookies([authCookie()])
  await ctx.addInitScript(() => localStorage.setItem('family-tree:view', 'tree'))
  const page = await ctx.newPage()
  const jszipRequests = []
  // The lazily loaded export code (with JSZip) comes in its own chunk.
  page.on('request', r => { if (/jszip|runExport/i.test(r.url())) jszipRequests.push(r.url()) })
  await page.goto(`${app}/edit?root=${ROOT}`)
  await page.locator(`#person-${founder.id}`).waitFor()
  check(jszipRequests.length === 0, 'the zip library is not loaded with the page')

  // ── Export ──
  console.log('── export (390px phone)')
  await page.getByRole('button', { name: /^الحساب/ }).click()
  const exportButton = page.getByRole('button', { name: 'تصدير العائلة' })
  check(await exportButton.isVisible(), '«تصدير العائلة» is in the account menu')
  if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}menu-390.png` }) }
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const status = page.getByTestId('export-status')
  await status.filter({ hasText: 'صورة' }).waitFor()
  const progress = await status.textContent()
  check(/جارٍ تجهيز الملف… [٠-٩]+ \/ ٣ صورة/.test(progress), `progress in Arabic digits («${progress.trim()}»)`)
  const download = await downloadPromise
  const name = download.suggestedFilename()
  check(/^family-export-\d{4}-\d{2}-\d{2}\.zip$/.test(name), `file name ${name}`)
  await status.filter({ hasText: 'تم تنزيل الملف' }).waitFor()
  check((await status.textContent()).includes('تعذّر تنزيل ١ صورة'), 'tells which photos failed')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}done-390.png` })

  // ── What's inside ──
  console.log('── zip contents')
  const zip = await JSZip.loadAsync(fs.readFileSync(await download.path()))
  const files = Object.keys(zip.files).filter(f => !zip.files[f].dir).sort()
  check(['README.txt', 'family.ged', 'family.json'].every(f => files.includes(f)), `files: ${files.join(', ')}`)
  const photos = files.filter(f => f.startsWith('photos/'))
  check(photos.length === 2 && photos.includes(`photos/${founder.id}.png`), `2 photos in photos/ (${photos.length})`)

  const json = JSON.parse(await zip.file('family.json').async('string'))
  check(json.format === 'family-tree-export' && json.version === 1, 'family.json: format + version')
  check(json.people.length === realPeople.length, `family.json: ${json.people.length} people (the shortcut row isn't one)`)
  const jp = id => json.people.find(p => p.id === id)
  check(jp(founder.id).photo === `photos/${founder.id}.png`, 'photo path points into the zip')
  check(jp(sara.id).photo === null && jp(sara.id).photo_missing_url === sara.photo_url, 'failed photo recorded with its URL')
  check(jp(baby.id).father_id === omar.id && jp(baby.id).mother_id === sara.id, 'cross-branch child: father عمر, mother the real سارة')
  check(json.marriages.some(m => m.partner_ids.includes(omar.id) && m.partner_ids.includes(sara.id)), 'cross-branch marriage resolved to the real person')
  check(json.branches.length === 2 && json.branches.every(b => b.founder_id), 'both branches with founders')
  check(!JSON.stringify(json).includes('canvas_x') && !JSON.stringify(json).includes('is_shortcut'), 'no app internals')

  const ged = await zip.file('family.ged').async('string')
  const tree = parse(ged)
  const indis = tree.children.filter(r => r.type === 'INDI')
  const ids = new Set(tree.children.map(r => r.data?.xref_id).filter(Boolean))
  const pointers = tree.children.flatMap(function walk(n) { return [...(n.data?.pointer ? [n.data.pointer] : []), ...n.children.flatMap(walk)] })
  check(indis.length === realPeople.length, `family.ged: ${indis.length} INDI`)
  check(pointers.every(p => ids.has(p)), `family.ged: all ${pointers.length} references resolve`)
  check(ged.includes('1 CHAR UTF-8') && ged.includes('1 NAME مصطفى') && ged.includes('2 DATE ABT 2010'), 'family.ged: UTF-8, Arabic names, dates')

  const readme = await zip.file('README.txt').async('string')
  check(readme.includes('MyHeritage') && readme.includes('تصدير شجرة العائلة') && readme.includes('missing-sara.png'), 'README in Arabic + English, lists the failed photo')
  check(jszipRequests.length > 0, 'the zip library loads only when exporting')
  await ctx.close()

  // ── Unsaved changes ──
  console.log('── unsaved changes')
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  ctx2.setDefaultTimeout(60_000)
  await ctx2.addCookies([authCookie()])
  await ctx2.addInitScript(() => localStorage.setItem('family-tree:view', 'tree'))
  const p2 = await ctx2.newPage()
  await p2.goto(`${app}/edit?root=${ROOT}`)
  const node = p2.locator(`#person-${baby.id}`)
  await node.click()
  await node.getByRole('button', { name: 'شريك' }).click()
  const dialog = p2.getByRole('dialog')
  await dialog.getByRole('button', { name: 'أضف شخصاً جديداً' }).click()
  await dialog.getByPlaceholder('الاسم الكامل').fill('سامي')
  await dialog.getByRole('button', { name: 'إضافة شريك' }).click()
  await dialog.waitFor({ state: 'detached' })
  await p2.getByRole('button', { name: /^الحساب/ }).click()
  await p2.getByRole('button', { name: 'تصدير العائلة' }).click()
  const alert = p2.getByTestId('export-status')
  await alert.waitFor()
  check((await alert.textContent()).includes('اضغط «حفظ» أولاً'), 'unsaved changes: asks to save first, no download')
  await ctx2.close()
} finally {
  await browser.close()
  await stop()
}
if (SHOTS) {
  fs.mkdirSync(SHOTS_DEST, { recursive: true })
  for (const f of fs.readdirSync(SHOTS)) fs.copyFileSync(SHOTS + f, SHOTS_DEST + f)
}
finish()

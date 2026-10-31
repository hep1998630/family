// Changing a profile photo through the crop step, on a 360px phone.
//
//   npm run e2e:photo-crop
//
// Checks that:
//  - the crop code is downloaded only once a photo is picked, and a failed
//    download shows an error and keeps the page and the unsaved draft;
//  - keyboard: focus moves into the crop step, Tab stays inside, Enter on
//    a button doesn't save the profile underneath, focus comes back after;
//  - cancelling while the crop is being prepared drops the result;
//  - replacing a photo gives a new URL, while the OLD URL and a shortcut
//    row's copy of it still load (no photo file is ever deleted);
//  - the saved image is 512×512 and upright even for a sideways phone photo.
//
// Runs against an in-memory fake Supabase (database AND storage) — never
// the real project. E2E_SHOTS=<dir> also saves screenshots there.
import { chromium, devices } from 'playwright'
import { authCookie, checker, installPhotoHelpers, sidewaysPhotoFile, startApp } from './harness.mjs'
import { PNG_1PX } from './mock-supabase.mjs'
import { makeSeed } from './seed.mjs'

const MOCK = 'http://localhost:54329'
const t = '2026-01-01T00:00:00.000Z'
const seed = makeSeed()
const ROOT = seed.roots[0].id
const maryam = seed.people.find(p => p.name === 'مريم')
// Her photo from before (the old `<id>.jpg` naming)…
const LEGACY = `${maryam.id}.jpg`
const LEGACY_URL = `${MOCK}/storage/v1/object/public/avatars/${LEGACY}`
maryam.photo_url = LEGACY_URL
seed.files = { [`avatars/${LEGACY}`]: { body: PNG_1PX, type: 'image/png' } }
// …and a shortcut row in another branch that copied that URL.
const B = '00000000-0000-4000-8000-0000000000b0'
seed.roots.push({ id: B, name: 'عائلة يوسف', canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t })
const shortcut = { ...maryam, id: '00000000-0000-4000-8000-0000000000b1', root_id: B, is_shortcut: true, original_person_id: maryam.id }
seed.people.push(shortcut)
const shots = process.env.E2E_SHOTS

const { check, finish } = checker()
const { app, mockUrl, stop } = await startApp({ seed })
const state = async () => (await fetch(`${mockUrl}/__mock/state`)).json()
const status = async url => (await fetch(url)).status
const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 360, height: 760 } })
  ctx.setDefaultTimeout(60_000)
  await ctx.addCookies([authCookie()])
  await ctx.addInitScript(() => localStorage.setItem('family-tree:view', 'family'))
  const page = await ctx.newPage()
  const cropChunks = []
  page.on('request', r => { if (/easy-crop|PhotoCropper/i.test(r.url())) cropChunks.push(r.url()) })

  await page.goto(`${app}/edit?root=${ROOT}&focus=${maryam.id}`)
  await page.getByRole('button', { name: 'تعديل', exact: true }).click()
  const dialog = page.getByRole('dialog').first()
  const input = dialog.getByTestId('photo-input')
  await input.waitFor({ state: 'attached' })
  check(cropChunks.length === 0, `the crop code is not downloaded before a photo is picked (${cropChunks.length} requests)`)
  const file = await sidewaysPhotoFile(page)
  const cropper = page.getByTestId('photo-cropper')
  const preview = dialog.getByTestId('profile-photo-preview')

  // ── 1. the crop code fails to download (offline / new version deployed) ──
  const nickname = dialog.getByPlaceholder('مثلاً: أبو أحمد')
  await nickname.fill('أم يوسف') // an unsaved edit in the profile
  await page.route(/PhotoCropper/, route => route.abort())
  await input.setInputFiles(file)
  await cropper.getByText('تعذّر تحميل أداة قص الصورة', { exact: false }).waitFor()
  check(true, 'a failed download shows an error in the crop step')
  if (shots) await page.screenshot({ path: `${shots}/photo-crop-load-failed.png` })
  await page.unroute(/PhotoCropper/)
  await cropper.getByRole('button', { name: 'حاول مرة أخرى' }).click()
  await cropper.locator('.reactEasyCrop_CropArea').waitFor()
  check(true, '«حاول مرة أخرى» then loads it, without reloading the page')
  await cropper.getByRole('button', { name: 'إلغاء' }).click()
  await cropper.waitFor({ state: 'detached' })
  check(await nickname.inputValue() === 'أم يوسف', 'the unsaved edit in the profile is still there')

  // ── 2. keyboard ──
  const before = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 60))
  await input.setInputFiles(file)
  await cropper.locator('.reactEasyCrop_CropArea').waitFor()
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="photo-cropper"]'))
  check(await inside(), 'focus moves into the crop step')
  let trapped = true
  for (let i = 0; i < 8; i++) { await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab'); trapped &&= await inside() }
  check(trapped, 'Tab and Shift+Tab stay inside the crop step')
  await page.keyboard.press('Escape')
  await cropper.waitFor({ state: 'detached' })
  check(await dialog.isVisible(), 'Escape closes only the crop step, not the profile')
  const after = await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 60))
  check(after === before, 'focus goes back where it was')

  // ── 3. cancelling while the crop is being prepared drops the result ──
  const previewBefore = await preview.getAttribute('src')
  await input.setInputFiles(file)
  await cropper.locator('.reactEasyCrop_CropArea').waitFor()
  await page.evaluate(() => {
    // Make preparing the crop slow, as on an old phone.
    const real = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (cb, ...rest) { real.call(this, b => setTimeout(() => cb(b), 1500), ...rest) }
    window.__restoreToBlob = () => { HTMLCanvasElement.prototype.toBlob = real }
  })
  await cropper.getByRole('button', { name: 'حفظ الصورة' }).click()
  await cropper.getByRole('button', { name: 'جارٍ التجهيز…' }).waitFor()
  await cropper.getByRole('button', { name: 'إلغاء' }).click()
  await cropper.waitFor({ state: 'detached' })
  await page.waitForTimeout(4000) // until the slow crop has long finished
  check(await preview.getAttribute('src') === previewBefore, '«إلغاء» while preparing: the late result is ignored')
  await page.evaluate(() => window.__restoreToBlob())

  // ── 4. crop and save; Enter on «حفظ الصورة» doesn't save the profile ──
  await input.setInputFiles(file)
  await cropper.locator('.reactEasyCrop_CropArea').waitFor()
  await cropper.getByRole('slider', { name: 'تكبير الصورة' }).fill('2')
  const patchesBefore = (await state()).log.filter(l => l.table === 'people').length
  await cropper.getByRole('button', { name: 'حفظ الصورة' }).focus()
  await page.keyboard.press('Enter')
  await cropper.waitFor({ state: 'detached' })
  check((await preview.getAttribute('src')).startsWith('blob:'), 'the profile shows the cropped photo')
  check(await dialog.isVisible() && (await state()).log.filter(l => l.table === 'people').length === patchesBefore,
    'Enter in the crop step did not save the profile underneath')

  const saveAll = async () => {
    await dialog.getByRole('button', { name: 'حفظ', exact: true }).click()
    await page.getByRole('button', { name: 'حفظ', exact: true }).click()
    await page.waitForFunction(() => !document.body.innerText.includes('جارٍ الحفظ'))
    await page.waitForTimeout(500)
    return (await state()).db.people.find(p => p.id === maryam.id).photo_url
  }
  const first = await saveAll()
  check(new RegExp(`/avatars/${maryam.id}\\.webp\\?cacheNonce=[0-9a-f]{16}$`).test(first), `saved as her one photo file, with a fingerprinted URL: …${first.slice(-48)}`)
  check(first !== LEGACY_URL, 'the URL changed')

  const s1 = await state()
  check(!s1.log.some(l => l.table === 'storage' && l.method === 'DELETE'), 'no photo file was deleted')
  check(await status(LEGACY_URL) === 200, 'the old URL still loads')
  check(await status(s1.db.people.find(p => p.id === shortcut.id).photo_url) === 200, 'the shortcut row’s photo still loads')

  await installPhotoHelpers(page)
  const out = await page.evaluate(async url => e2ePhoto.inspect(await (await fetch(url)).blob(), [0.2, 0.8]), first)
  check(out.type === 'image/webp' && out.width === 512 && out.height === 512, `uploaded 512×512 WebP (${out.type} ${out.width}×${out.height}, ${out.bytes} bytes)`)
  check(out.colours[0] === 'red' && out.colours[1] === 'blue', `the sideways phone photo came out upright (top ${out.colours[0]}, bottom ${out.colours[1]})`)
  await page.waitForFunction(u => document.body.innerHTML.includes(encodeURIComponent(u)) || document.body.innerHTML.includes(u.replaceAll('&', '&amp;')), first)
  check(true, 'the page shows the new photo')

  // ── 5. replace it again: new URL again; the previous ones still load ──
  await page.getByRole('button', { name: 'تعديل', exact: true }).click()
  await page.getByRole('dialog').first().getByTestId('photo-input').setInputFiles(file)
  await cropper.locator('.reactEasyCrop_CropArea').waitFor()
  await cropper.getByRole('slider', { name: 'تكبير الصورة' }).fill('3') // a different crop
  await cropper.getByRole('button', { name: 'حفظ الصورة' }).click()
  await cropper.waitFor({ state: 'detached' })
  const second = await saveAll()
  const s2 = await state()
  check(second !== first && second.split('?')[0] === first.split('?')[0], 'a new crop: same file, new URL')
  check(await status(first) === 200 && await status(LEGACY_URL) === 200, 'the earlier URLs still load')
  check(s2.files.filter(f => f.startsWith(`avatars/${maryam.id}`)).length === 2, `one file per person (+ the old .jpg): ${s2.files.join(', ')}`)
  check(cropChunks.length > 0, 'the crop code was downloaded once a photo was picked')
} finally {
  await browser.close()
  await stop()
}
finish()

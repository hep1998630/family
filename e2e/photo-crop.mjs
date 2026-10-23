// Changing a profile photo through the crop step, on a 360px phone:
// choose a (sideways) phone photo → crop → «حفظ الصورة» → save. The new
// photo gets a new file name and URL, the old file is deleted, and the
// cropping library is only downloaded once a photo is picked.
//
//   npm run e2e:photo-crop
//
// Runs against an in-memory fake Supabase (database AND storage) — never
// the real project. E2E_SHOTS=<dir> also saves screenshots there.
import { chromium, devices } from 'playwright'
import { authCookie, checker, startApp } from './harness.mjs'
import { PNG_1PX } from './mock-supabase.mjs'
import { makeSeed } from './seed.mjs'

const MOCK = 'http://localhost:54329'
const seed = makeSeed()
const ROOT = seed.roots[0].id
const maryam = seed.people.find(p => p.name === 'مريم')
const OLD = `${maryam.id}.jpg` // the old fixed-name style
const OLD_URL = `${MOCK}/storage/v1/object/public/avatars/${OLD}`
maryam.photo_url = OLD_URL
seed.files = { [`avatars/${OLD}`]: { body: PNG_1PX, type: 'image/png' } }
const shots = process.env.E2E_SHOTS

const { check, finish } = checker()
const { app, mockUrl, stop } = await startApp({ seed })
const state = async () => (await fetch(`${mockUrl}/__mock/state`)).json()
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
  await dialog.getByTestId('photo-input').waitFor({ state: 'attached' })
  check(cropChunks.length === 0, `the crop code is not downloaded before a photo is picked (${cropChunks.length} requests)`)

  // A phone photo stored sideways (EXIF orientation 6): 1200×800 pixels,
  // red left half / blue right half — upright it is red on top, blue below.
  const photo = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 800
    const x = c.getContext('2d')
    x.fillStyle = '#ff0000'; x.fillRect(0, 0, 600, 800)
    x.fillStyle = '#0000ff'; x.fillRect(600, 0, 600, 800)
    const jpeg = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95))).arrayBuffer())
    const app1 = [0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8,
      0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]
    return [...jpeg.slice(0, 2), ...app1, ...jpeg.slice(2)]
  })
  const file = { name: 'IMG_2041.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo) }

  // ── 1. «إلغاء» leaves the photo as it was ──
  await dialog.getByTestId('photo-input').setInputFiles(file)
  const cropper = page.getByTestId('photo-cropper')
  await cropper.waitFor()
  check(cropChunks.length > 0, 'the crop code is downloaded once a photo is picked')
  const previewBefore = await dialog.getByTestId('profile-photo-preview').getAttribute('src')
  await cropper.getByRole('button', { name: 'إلغاء' }).click()
  await cropper.waitFor({ state: 'detached' })
  check(await dialog.isVisible(), '«إلغاء» closes only the crop step, not the profile')
  check(await dialog.getByTestId('profile-photo-preview').getAttribute('src') === previewBefore, '«إلغاء» keeps the old photo')

  // ── 2. crop and save ──
  await dialog.getByTestId('photo-input').setInputFiles(file)
  await cropper.waitFor()
  await cropper.locator('img').first().waitFor()
  const frame = await cropper.locator('[data-testid="cropper"], .reactEasyCrop_CropArea').first().boundingBox()
  check(frame && Math.abs(frame.width - frame.height) < 2 && frame.width > 200, `round square frame fills the phone width (${Math.round(frame?.width)}×${Math.round(frame?.height)})`)
  const round = await cropper.locator('.reactEasyCrop_CropArea').evaluate(el => el.classList.contains('reactEasyCrop_CropAreaRound'))
  check(round, 'the frame is a circle, like every avatar')
  await cropper.getByRole('slider', { name: 'تكبير الصورة' }).fill('2')
  const buttons = await cropper.getByRole('button').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))
  check(buttons.every(h => h >= 56), `big buttons (${buttons.join(', ')}px tall)`)
  if (shots) await page.screenshot({ path: `${shots}/photo-crop-step.png` })

  await cropper.getByRole('button', { name: 'حفظ الصورة' }).click()
  await cropper.waitFor({ state: 'detached' })
  const preview = dialog.getByTestId('profile-photo-preview')
  check((await preview.getAttribute('src')).startsWith('blob:'), 'the profile shows the cropped photo')
  if (shots) await dialog.screenshot({ path: `${shots}/photo-crop-preview.png` })

  await dialog.getByRole('button', { name: 'حفظ', exact: true }).click()
  await page.getByRole('button', { name: 'حفظ', exact: true }).click()
  await page.waitForFunction(() => !document.body.innerText.includes('جارٍ الحفظ'))
  await page.waitForTimeout(500)

  const s = await state()
  const saved = s.db.people.find(p => p.id === maryam.id).photo_url
  const name = saved.split('/').pop()
  check(new RegExp(`^${maryam.id}-[0-9a-f]{12}\\.webp$`).test(name), `saved under a new name: ${name}`)
  check(saved !== OLD_URL, 'so the URL changed (no stale cached photo)')
  check(s.files.includes(`avatars/${name}`), 'the new file is in storage')
  check(!s.files.includes(`avatars/${OLD}`), `the old file ${OLD} was deleted`)
  check(s.log.some(l => l.table === 'storage' && l.method === 'DELETE' && l.paths?.includes(OLD)), 'deleted only after the new photo was saved')
  const order = s.log.filter(l => l.table === 'storage' || l.table === 'people').map(l => `${l.table}:${l.method}`)
  check(order.indexOf('storage:DELETE') > order.lastIndexOf('people:PATCH'), `order: upload → photo_url → delete old (${order.join(' → ')})`)

  // The uploaded file itself: 512×512 WebP, upright.
  const out = await page.evaluate(async url => {
    const blob = await (await fetch(url)).blob()
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0)
    const at = y => { const [r, , b] = x.getImageData(bmp.width / 2, y, 1, 1).data; return r > 200 && b < 60 ? 'red' : b > 200 && r < 60 ? 'blue' : `${r},${b}` }
    return { type: blob.type, w: bmp.width, h: bmp.height, bytes: blob.size, top: at(bmp.height * 0.2), bottom: at(bmp.height * 0.8) }
  }, saved)
  check(out.type === 'image/webp' && out.w === 512 && out.h === 512, `uploaded 512×512 WebP (${out.type} ${out.w}×${out.h}, ${out.bytes} bytes)`)
  check(out.top === 'red' && out.bottom === 'blue', `the sideways phone photo came out upright (top ${out.top}, bottom ${out.bottom})`)

  await page.waitForFunction(n => document.body.innerHTML.includes(n), name)
  check(true, 'the page now shows the new photo')
  if (shots) {
    await page.getByRole('dialog').first().waitFor({ state: 'detached' }).catch(() => {})
    await page.screenshot({ path: `${shots}/photo-crop-saved.png` })
  }
} finally {
  await browser.close()
  await stop()
}
finish()

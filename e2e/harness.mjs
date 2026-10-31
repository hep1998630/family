// Shared e2e harness: an in-memory fake Supabase plus a Next dev server
// pointed at it — never the real database.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { startMockSupabase, TOKEN, USER } from './mock-supabase.mjs'

/**
 * Starts the fake (with `seed`) and `next dev`, and waits until the app
 * answers. Returns the app URL, the fake's URL and a `stop()`.
 */
export async function startApp({ seed, missingTables = [], refuse = [], photoDelayMs = 0, mockPort = 54329, appPort = 3109 } = {}) {
  const app = `http://localhost:${appPort}`
  if (await isUp(app)) throw new Error(`port ${appPort} is already in use — is another e2e run still going?`)
  const mock = await startMockSupabase({ port: mockPort, seed, missingTables, refuse, photoDelayMs })
  const dev = spawn('npx', ['next', 'dev', '-p', String(appPort)], {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${mockPort}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key',
    },
    // E2E_DEV_LOG=<file> keeps the dev server's output for debugging.
    stdio: process.env.E2E_DEV_LOG
      ? ['ignore', fs.openSync(process.env.E2E_DEV_LOG, 'a'), fs.openSync(process.env.E2E_DEV_LOG, 'a')]
      : 'ignore',
    detached: true,
  })
  const exited = new Promise(resolve => dev.once('exit', resolve))
  // Waits until the dev server is really gone: the next run's server
  // shares `.next`, and one still writing there makes the other read
  // half-written files ("Unexpected end of JSON input").
  const stop = async () => {
    try { process.kill(-dev.pid, 'SIGTERM') } catch { /* already gone */ }
    const done = await Promise.race([exited.then(() => true), sleep(10_000).then(() => false)])
    if (!done) try { process.kill(-dev.pid, 'SIGKILL') } catch { /* already gone */ }
    for (let i = 0; i < 50 && await isUp(app); i++) await sleep(200)
    mock.close()
  }

  try {
    // First compile can take a while.
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${app}/view`)).ok) break } catch { /* not up yet */ }
      if (i > 120) throw new Error('dev server did not start')
      await new Promise(r => setTimeout(r, 1000))
    }
  } catch (e) {
    await stop()
    throw e
  }
  return { app, mockUrl: `http://localhost:${mockPort}`, stop }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const isUp = url => fetch(url, { method: 'HEAD' }).then(() => true, () => false)

/** Cookie @supabase/ssr reads as a signed-in session for the fake's admin. */
export function authCookie() {
  const session = {
    access_token: TOKEN, refresh_token: 'e2e-refresh-token', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: USER,
  }
  const value = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
  return { name: 'sb-localhost-auth-token', value, domain: 'localhost', path: '/' }
}

/** Tiny assertion log: prints ✓/✗ and remembers failures. */
export function checker() {
  const failures = []
  const check = (ok, msg) => {
    console.log(ok ? '  ✓' : '  ✗', msg)
    if (!ok) failures.push(msg)
  }
  const finish = () => {
    console.log(failures.length ? `\nFAILED:\n${failures.join('\n')}` : '\nALL PASSED')
    process.exit(failures.length ? 1 : 0)
  }
  return { check, finish, failures }
}

// ── Photo fixtures, shared by the photo checks ──────────────────────────────

/**
 * In-page helpers, defined on `window.e2ePhoto` by installPhotoHelpers():
 *  - halves(w, h, type): a picture with a red left half and a blue right half;
 *  - withOrientation6(jpeg): the same JPEG tagged "turn 90° clockwise to
 *    show" (EXIF orientation 6), as phones store portrait photos — so shown
 *    upright it is red on top, blue below;
 *  - inspect(blob, at?): type, size, and the colour (red / blue / rgb) at the
 *    horizontal centre and heights `at` (fractions, default [0.5]).
 */
const PHOTO_HELPERS = `window.e2ePhoto = {
  halves(w, h, type) {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const x = c.getContext('2d')
    x.fillStyle = '#ff0000'; x.fillRect(0, 0, w / 2, h)
    x.fillStyle = '#0000ff'; x.fillRect(w / 2, 0, w / 2, h)
    return new Promise(r => c.toBlob(r, type, 0.95))
  },
  async withOrientation6(blob) {
    const b = new Uint8Array(await blob.arrayBuffer())
    const app1 = [0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8,
      0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]
    return new Blob([b.slice(0, 2), new Uint8Array(app1), b.slice(2)], { type: 'image/jpeg' })
  },
  async inspect(blob, at = [0.5]) {
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0)
    const colour = f => {
      const [r, g, b] = x.getImageData(bmp.width / 2, Math.floor(bmp.height * f), 1, 1).data
      return r > 200 && b < 60 ? 'red' : b > 200 && r < 60 ? 'blue' : 'rgb(' + r + ',' + g + ',' + b + ')'
    }
    return { type: blob.type, width: bmp.width, height: bmp.height, bytes: blob.size, colours: at.map(colour) }
  },
}`

/** Defines window.e2ePhoto in `page` (see PHOTO_HELPERS). */
export async function installPhotoHelpers(page) {
  await page.evaluate(PHOTO_HELPERS)
}

/**
 * A sideways phone photo as a file for setInputFiles: stored 1200×800 (red
 * left / blue right) with EXIF orientation 6, i.e. upright red over blue.
 */
export async function sidewaysPhotoFile(page, name = 'IMG_2041.jpg') {
  await installPhotoHelpers(page)
  const bytes = await page.evaluate(async () => {
    const jpeg = await e2ePhoto.withOrientation6(await e2ePhoto.halves(1200, 800, 'image/jpeg'))
    return [...new Uint8Array(await jpeg.arrayBuffer())]
  })
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(bytes) }
}

// Browser tests for the crop helper (lib/photos/cropImage.ts): output size
// and format, and that a sideways phone photo (EXIF orientation) comes out
// upright. They need a real canvas, so they run in Chromium, not vitest.
//
//   npm run e2e:crop-image
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { checker } from './harness.mjs'

const { outputFiles } = await build({
  entryPoints: ['lib/photos/cropImage.ts'], bundle: true, write: false, format: 'iife', globalName: 'cropImage',
})
const { check, finish } = checker()
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><title>crop</title>')
  await page.addScriptTag({ content: outputFiles[0].text })
  await page.addScriptTag({ content: `
    // Draws a test picture: left half red, right half blue.
    window.halves = async (w, h, type) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const x = c.getContext('2d')
      x.fillStyle = '#ff0000'; x.fillRect(0, 0, w / 2, h)
      x.fillStyle = '#0000ff'; x.fillRect(w / 2, 0, w / 2, h)
      return new Promise(r => c.toBlob(r, type, 0.95))
    }
    // The same JPEG with an EXIF tag saying "turn 90° clockwise to show"
    // (orientation 6), as phones store portrait photos.
    window.withOrientation6 = async blob => {
      const b = new Uint8Array(await blob.arrayBuffer())
      const app1 = [0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8,
        0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0]
      return new Blob([b.slice(0, 2), new Uint8Array(app1), b.slice(2)], { type: 'image/jpeg' })
    }
    // Size, type and the colour at the centre of an output image.
    window.inspect = async blob => {
      const bmp = await createImageBitmap(blob)
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
      const x = c.getContext('2d'); x.drawImage(bmp, 0, 0)
      const [r, g, b] = x.getImageData(bmp.width / 2, bmp.height / 2, 1, 1).data
      return { type: blob.type, width: bmp.width, height: bmp.height, colour: r > 200 && b < 60 ? 'red' : b > 200 && r < 60 ? 'blue' : \`rgb(\${r},\${g},\${b})\` }
    }
  ` })

  // ── a big photo → 512×512 WebP ──
  const big = await page.evaluate(async () => {
    const src = URL.createObjectURL(await halves(1600, 1200, 'image/jpeg'))
    const out = await cropImage.cropToBlob(src, { x: 1000, y: 200, width: 600, height: 600 })
    return { ...(await inspect(out)), bytes: out.size, file: cropImage.croppedFile(out).name }
  })
  check(big.width === 512 && big.height === 512, `output is 512×512 (${big.width}×${big.height})`)
  check(big.type === 'image/webp' && big.file === 'photo.webp', `output is WebP (${big.type}, ${big.file})`)
  check(big.colour === 'blue', `it is the chosen part of the photo (right half → ${big.colour})`)
  check(big.bytes < 60_000, `output is small (${big.bytes} bytes)`)

  // ── a crop that strays a pixel past the edge still works ──
  const edge = await page.evaluate(async () => {
    const src = URL.createObjectURL(await halves(400, 300, 'image/png'))
    return inspect(await cropImage.cropToBlob(src, { x: 101.4, y: -0.6, width: 300.4, height: 300.4 }))
  })
  check(edge.width === 512, `a crop rounding past the edge is kept inside (${edge.width}px)`)

  // ── sideways phone photo comes out upright ──
  const turned = await page.evaluate(async () => {
    // Stored 200×100 (red left, blue right); shown upright it is 100×200,
    // red on top and blue below.
    const src = URL.createObjectURL(await withOrientation6(await halves(200, 100, 'image/jpeg')))
    const img = await cropImage.loadImage(src)
    const top = await inspect(await cropImage.cropToBlob(src, { x: 0, y: 0, width: 100, height: 100 }))
    const bottom = await inspect(await cropImage.cropToBlob(src, { x: 0, y: 100, width: 100, height: 100 }))
    return { size: `${img.naturalWidth}×${img.naturalHeight}`, top: top.colour, bottom: bottom.colour }
  })
  check(turned.size === '100×200', `a portrait phone photo is measured upright (${turned.size})`)
  check(turned.top === 'red' && turned.bottom === 'blue', `and cropped upright (top ${turned.top}, bottom ${turned.bottom})`)

  // ── a browser that can't write WebP gets a JPEG ──
  const fallback = await page.evaluate(async () => {
    const real = HTMLCanvasElement.prototype.toBlob
    // Like such browsers: asked for WebP, they quietly produce PNG.
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
      return real.call(this, cb, type === 'image/webp' ? 'image/png' : type, q)
    }
    try {
      const src = URL.createObjectURL(await halves(300, 300, 'image/png'))
      const out = await cropImage.cropToBlob(src, { x: 0, y: 0, width: 300, height: 300 })
      return { ...(await inspect(out)), file: cropImage.croppedFile(out).name }
    } finally {
      HTMLCanvasElement.prototype.toBlob = real
    }
  })
  check(fallback.type === 'image/jpeg' && fallback.file === 'photo.jpg', `without WebP it falls back to JPEG (${fallback.type}, ${fallback.file})`)
  check(fallback.width === 512, `still 512×512 (${fallback.width})`)
} finally {
  await browser.close()
}
finish()

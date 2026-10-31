// Browser tests for the crop helper (lib/photos/cropImage.ts): output size
// and format, and that a sideways phone photo (EXIF orientation) comes out
// upright. They need a real canvas, so they run in Chromium, not vitest.
//
//   npm run e2e:crop-image
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { checker, installPhotoHelpers } from './harness.mjs'

const { outputFiles } = await build({
  entryPoints: ['lib/photos/cropImage.ts'], bundle: true, write: false, format: 'iife', globalName: 'cropImage',
})
const { check, finish } = checker()
const browser = await chromium.launch()

async function newPage(beforeLoad) {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><title>crop</title>')
  if (beforeLoad) await page.evaluate(beforeLoad)
  await page.addScriptTag({ content: outputFiles[0].text })
  await installPhotoHelpers(page)
  // Count the canvas encodes, by canvas size.
  await page.evaluate(() => {
    window.encodes = []
    const real = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
      encodes.push(`${this.width}:${type}`)
      return real.call(this, cb, type, q)
    }
  })
  return page
}

try {
  const page = await newPage()

  // ── a big photo → 512×512 WebP ──
  const big = await page.evaluate(async () => {
    const src = URL.createObjectURL(await e2ePhoto.halves(1600, 1200, 'image/jpeg'))
    encodes.length = 0
    const out = await cropImage.cropToBlob(src, { x: 1000, y: 200, width: 600, height: 600 })
    return { ...(await e2ePhoto.inspect(out)), file: cropImage.croppedFile(out).name, encodes: [...encodes] }
  })
  check(big.width === 512 && big.height === 512, `output is 512×512 (${big.width}×${big.height})`)
  check(big.type === 'image/webp' && big.file === 'photo.webp', `output is WebP (${big.type}, ${big.file})`)
  check(big.colours[0] === 'blue', `it is the chosen part of the photo (right half → ${big.colours[0]})`)
  check(big.bytes < 60_000, `output is small (${big.bytes} bytes)`)
  check(big.encodes.filter(e => e.startsWith('512:')).length === 1, `the photo is encoded once (${big.encodes.join(', ')})`)

  // ── the WebP check is done once per page, not per photo ──
  const again = await page.evaluate(async () => {
    const src = URL.createObjectURL(await e2ePhoto.halves(400, 400, 'image/png'))
    encodes.length = 0
    await cropImage.cropToBlob(src, { x: 0, y: 0, width: 400, height: 400 })
    return [...encodes]
  })
  check(again.length === 1 && again[0] === '512:image/webp', `second photo: one encode, no WebP probe (${again.join(', ')})`)

  // ── a crop that strays past the edge, or isn't quite square, is fixed ──
  const edge = await page.evaluate(async () => {
    const src = URL.createObjectURL(await e2ePhoto.halves(400, 300, 'image/png'))
    return e2ePhoto.inspect(await cropImage.cropToBlob(src, { x: 101.4, y: -0.6, width: 300.4, height: 299.2 }))
  })
  check(edge.width === 512 && edge.height === 512, `a crop rounding past the edge is kept inside and square (${edge.width}×${edge.height})`)

  // ── sideways phone photo comes out upright — from a URL or from the
  //    <img> the crop step already decoded ──
  const turned = await page.evaluate(async () => {
    const src = URL.createObjectURL(await e2ePhoto.withOrientation6(await e2ePhoto.halves(200, 100, 'image/jpeg')))
    const img = await cropImage.loadImage(src)
    const top = await e2ePhoto.inspect(await cropImage.cropToBlob(src, { x: 0, y: 0, width: 100, height: 100 }))
    const bottom = await e2ePhoto.inspect(await cropImage.cropToBlob(img, { x: 0, y: 100, width: 100, height: 100 }))
    return { size: `${img.naturalWidth}×${img.naturalHeight}`, top: top.colours[0], bottom: bottom.colours[0] }
  })
  check(turned.size === '100×200', `a portrait phone photo is measured upright (${turned.size})`)
  check(turned.top === 'red' && turned.bottom === 'blue', `and cropped upright, from a URL or a decoded <img> (top ${turned.top}, bottom ${turned.bottom})`)

  // ── a browser that can't write WebP gets a JPEG, encoded once ──
  const noWebp = await newPage(() => {
    // Like such browsers: asked for WebP, they quietly produce PNG.
    const real = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
      return real.call(this, cb, type === 'image/webp' ? 'image/png' : type, q)
    }
  })
  const fallback = await noWebp.evaluate(async () => {
    const src = URL.createObjectURL(await e2ePhoto.halves(300, 300, 'image/png'))
    encodes.length = 0
    const out = await cropImage.cropToBlob(src, { x: 0, y: 0, width: 300, height: 300 })
    const first = [...encodes]
    encodes.length = 0
    await cropImage.cropToBlob(src, { x: 0, y: 0, width: 300, height: 300 })
    return { ...(await e2ePhoto.inspect(out)), file: cropImage.croppedFile(out).name, first, second: [...encodes] }
  })
  check(fallback.type === 'image/jpeg' && fallback.file === 'photo.jpg', `without WebP it falls back to JPEG (${fallback.type}, ${fallback.file})`)
  check(fallback.width === 512, `still 512×512 (${fallback.width})`)
  check(fallback.second.length === 1 && fallback.second[0] === '512:image/jpeg',
    `and never makes a throwaway PNG of the photo (first: ${fallback.first.join(', ')}; then: ${fallback.second.join(', ')})`)
} finally {
  await browser.close()
}
finish()

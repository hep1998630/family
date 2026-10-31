// Turns the part of a photo picked in the crop step into a small square
// image: 512×512, WebP (JPEG where the browser can't write WebP).
//
// Phone photos are often stored sideways with an EXIF "orientation" tag.
// Browsers apply that tag when they show or draw an <img>, and the crop step
// measures the image the same way, so drawing it onto a canvas gives upright
// pixels — and the new file carries no tag that could turn it again.

export const AVATAR_SIZE = 512
export const AVATAR_QUALITY = 0.85

export interface PixelArea {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Keeps a crop square and inside the image: rounding can push it a pixel
 * past an edge, and both sides shrink to whichever limit is smaller.
 */
export function clampArea(area: PixelArea, imageWidth: number, imageHeight: number): PixelArea {
  const side = Math.max(1, Math.min(Math.round(area.width), Math.round(area.height), imageWidth, imageHeight))
  const x = Math.min(Math.max(0, Math.round(area.x)), imageWidth - side)
  const y = Math.min(Math.max(0, Math.round(area.y)), imageHeight - side)
  return { x, y, width: side, height: side }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('could not read the image'))
    img.src = src
  })
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))

// Asked for WebP, a browser that can't write it silently hands back a PNG.
// Found out once per page (on a 1×1 canvas), not by encoding every photo twice.
let webpSupport: Promise<boolean> | null = null
function canEncodeWebp(): Promise<boolean> {
  if (!webpSupport) {
    const probe = document.createElement('canvas')
    probe.width = probe.height = 1
    webpSupport = toBlob(probe, 'image/webp', AVATAR_QUALITY).then(b => b?.type === 'image/webp')
  }
  return webpSupport
}

/**
 * Draws `area` of a photo into a square image file. `source` is the photo's
 * URL, or — cheaper — the <img> the crop step already decoded.
 */
export async function cropToBlob(
  source: string | HTMLImageElement,
  area: PixelArea,
  { size = AVATAR_SIZE, quality = AVATAR_QUALITY } = {},
): Promise<Blob> {
  const img = typeof source === 'string' || !source.complete || !source.naturalWidth
    ? await loadImage(typeof source === 'string' ? source : source.src)
    : source
  const a = clampArea(area, img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas is not available')
  // A see-through PNG would turn black as a JPEG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, a.x, a.y, a.width, a.height, 0, 0, size, size)

  const blob = await toBlob(canvas, (await canEncodeWebp()) ? 'image/webp' : 'image/jpeg', quality)
  if (!blob) throw new Error('could not save the image')
  return blob
}

/** Wraps the cropped image as a File, named after its format. */
export function croppedFile(blob: Blob, baseName = 'photo'): File {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  return new File([blob], `${baseName}.${ext}`, { type: blob.type })
}

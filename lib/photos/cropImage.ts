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

/** Keeps a crop inside the image (rounding can push it a pixel past an edge). */
export function clampArea(area: PixelArea, imageWidth: number, imageHeight: number): PixelArea {
  const width = Math.max(1, Math.min(Math.round(area.width), imageWidth))
  const height = Math.max(1, Math.min(Math.round(area.height), imageHeight))
  const x = Math.min(Math.max(0, Math.round(area.x)), imageWidth - width)
  const y = Math.min(Math.max(0, Math.round(area.y)), imageHeight - height)
  return { x, y, width, height }
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

/** Draws `area` of the photo at `src` into a square image file. */
export async function cropToBlob(
  src: string,
  area: PixelArea,
  { size = AVATAR_SIZE, quality = AVATAR_QUALITY } = {},
): Promise<Blob> {
  const img = await loadImage(src)
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

  // A browser that can't write WebP silently hands back a PNG instead.
  const webp = await toBlob(canvas, 'image/webp', quality)
  if (webp?.type === 'image/webp') return webp
  const jpeg = await toBlob(canvas, 'image/jpeg', quality)
  if (!jpeg) throw new Error('could not save the image')
  return jpeg
}

/** Wraps the cropped image as a File, named after its format. */
export function croppedFile(blob: Blob, baseName = 'photo'): File {
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
  return new File([blob], `${baseName}.${ext}`, { type: blob.type })
}

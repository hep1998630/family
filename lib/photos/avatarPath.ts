// Where profile photos live in Supabase storage.

export const AVATAR_BUCKET = 'avatars'

const EXT_BY_TYPE: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
}

/**
 * The storage path for one upload of a person's photo. Every upload gets its
 * own name, so a changed photo also gets a new URL and no browser or CDN
 * keeps showing the old one. The same `uploadId` gives the same path, so a
 * retried upload overwrites itself instead of leaving a stray copy.
 */
export function avatarPath(personId: string, uploadId: string, file: { type: string; name: string }): string {
  const ext = EXT_BY_TYPE[file.type]
    ?? file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
    ?? 'jpg'
  return `${personId}-${uploadId.replace(/-/g, '').slice(0, 12)}.${ext}`
}

/**
 * The path inside the avatars bucket that a public photo URL points at, or
 * null when the URL isn't one of ours (an outside link is never deleted).
 */
export function avatarPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(new RegExp(`/storage/v1/object/public/${AVATAR_BUCKET}/([^?#]+)`))
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return null
  }
}

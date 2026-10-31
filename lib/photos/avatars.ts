// Profile photos in Supabase storage.
//
// Each person has ONE photo file, overwritten when the photo changes. Old
// photo files are never deleted: shortcut rows copy a person's photo_url,
// a stale browser tab can write an old photo_url back, and backups restore
// old ones — all of those must keep showing a picture.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export const AVATAR_BUCKET = 'avatars'

/**
 * How long browsers and the CDN may keep a photo. Each upload's URL carries
 * a fingerprint of its bytes (`cacheNonce`), so the current photo_url is
 * never stale. A URL saved before the latest change (a shortcut row, an old
 * backup) points at the same overwritten file; a short lifetime lets it show
 * the new photo within a day instead of a year.
 */
export const AVATAR_CACHE_SECONDS = '86400'

/** File extension for an image MIME type (shared with the family export). */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
}

export function extForMime(type: string | null | undefined): string | undefined {
  return type ? EXT_BY_MIME[type.split(';')[0].trim().toLowerCase()] : undefined
}

/**
 * The person's photo file. Always `.webp` — the crop step writes WebP, and
 * the few browsers that can't still upload under this name with their real
 * Content-Type (image/jpeg), which is what browsers go by. Photos saved
 * before this scheme (`<id>.jpg`, `<id>-<n>.webp`) are left where they are.
 */
export function avatarPath(personId: string): string {
  return `${personId}.webp`
}

/**
 * A short fingerprint of the file's bytes, used as the URL's cache nonce:
 * the same bytes (a retried upload) give the same URL; different bytes —
 * even uploaded to the same file — always give a new one.
 */
export async function contentNonce(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  // Two FNV-1a passes with different offsets: 64 bits, no secure context
  // (crypto.subtle) needed.
  let a = 0x811c9dc5
  let b = 0x01000193 ^ bytes.length
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i], 0x01000193)
    b = Math.imul(b ^ bytes[bytes.length - 1 - i], 0x01000193)
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return `${hex(a)}${hex(b)}`
}

/** Uploads a person's photo and returns the public URL to store in photo_url. */
export async function uploadAvatar(client: SupabaseClient<Database>, personId: string, file: Blob): Promise<string> {
  const path = avatarPath(personId)
  const bucket = client.storage.from(AVATAR_BUCKET)
  const { error } = await bucket.upload(path, file, { upsert: true, cacheControl: AVATAR_CACHE_SECONDS })
  if (error) throw new Error(error.message)
  return bucket.getPublicUrl(path, { cacheNonce: await contentNonce(file) }).data.publicUrl
}

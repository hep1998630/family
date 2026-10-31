import { describe, expect, it } from 'vitest'
import { runSaveQueue, newUuid, type PendingOp } from '@/lib/draft/saveQueue'
import { createMockDb, PUBLIC_URL } from '@/lib/draft/mockSupabase'
import { settleUploadedPhoto, type PendingPhoto } from '@/lib/draft/pendingPhotos'
import { PERMISSION_DENIED } from '@/lib/supabase/writes'
import { avatarPath, contentNonce, extForMime } from './avatars'
import { clampArea } from './cropImage'

// Saving a profile photo: one file per person, overwritten; the URL carries
// a fingerprint of the bytes so a changed photo never shows a cached old
// one; and no photo file is ever deleted (shortcut rows, stale tabs and
// backups may still point at an older URL).

const t = '2026-01-01T00:00:00Z'
const LEGACY = `${PUBLIC_URL}p1.jpg`
const webp = (bytes: string) => new File([bytes], 'photo.webp', { type: 'image/webp' })

function setup(photoUrl: string | null = LEGACY) {
  const db = createMockDb()
  db.tables.people.push({ id: 'p1', name: 'تميمة', root_id: 'root', photo_url: photoUrl, created_at: t })
  const photos = new Map<string, File>()
  const uploaded: File[] = []
  const queue = { current: [] as PendingOp[] }
  const pick = (file: File) => {
    photos.set('p1', file)
    queue.current.push({ opId: newUuid(), type: 'uploadPhoto', personId: 'p1' })
  }
  const save = () => runSaveQueue({
    client: db.client, queue, idMap: new Map(), getPhoto: id => photos.get(id),
    onQueueChange: () => {}, onResolved: () => {},
    onPhotoUploaded: (id, _url, file) => { uploaded.push(file); if (photos.get(id) === file) photos.delete(id) },
  })
  const photoUrl_ = () => db.tables.people[0].photo_url as string | null
  return { db, queue, photos, uploaded, pick, save, photoUrl: photoUrl_ }
}

describe('saving a profile photo', () => {
  it('writes the person’s one file and a URL fingerprinted by its bytes; deletes nothing', async () => {
    const s = setup()
    s.pick(webp('first'))
    await s.save()
    expect(s.db.uploads).toEqual(['p1.webp'])
    expect(s.photoUrl()).toBe(`${PUBLIC_URL}p1.webp?cacheNonce=${await contentNonce(webp('first'))}`)
    expect(s.db.removed).toEqual([])
    expect(s.queue.current).toHaveLength(0)
  })

  it('a different photo overwrites the same file but gets a new URL', async () => {
    const s = setup()
    s.pick(webp('first')); await s.save()
    const first = s.photoUrl()
    s.pick(webp('second')); await s.save()
    expect(s.db.uploads).toEqual(['p1.webp', 'p1.webp'])
    expect(s.photoUrl()).not.toBe(first)
    expect(s.photoUrl()!.split('?')[0]).toBe(first!.split('?')[0])
    expect(s.db.removed).toEqual([])
  })

  it('a retry after a lost response writes the same file and URL again', async () => {
    const s = setup()
    s.pick(webp('first'))
    s.db.failNext('people', 'update', 'after') // saved, but the reply never arrived
    await expect(s.save()).rejects.toThrow()
    const afterFirstTry = s.photoUrl()
    await s.save()
    expect(s.db.uploads).toEqual(['p1.webp', 'p1.webp'])
    expect(s.photoUrl()).toBe(afterFirstTry)
  })

  it('a retry with a newly picked photo gets a new URL (never the old bytes’ URL)', async () => {
    const s = setup()
    s.pick(webp('first'))
    s.db.failNext('people', 'update', 'after')
    await expect(s.save()).rejects.toThrow()
    const firstUrl = s.photoUrl()
    s.photos.set('p1', webp('picked again')) // same queued op, new bytes
    await s.save()
    expect(s.photoUrl()).not.toBe(firstUrl)
    expect(s.photoUrl()).toBe(`${PUBLIC_URL}p1.webp?cacheNonce=${await contentNonce(webp('picked again'))}`)
  })

  it('a failed upload keeps the old photo_url', async () => {
    const s = setup()
    s.pick(webp('first'))
    s.db.failNextUpload()
    await expect(s.save()).rejects.toThrow(/upload/)
    expect(s.photoUrl()).toBe(LEGACY)
  })

  it('a refused write (no permission) is reported and changes nothing', async () => {
    const s = setup()
    s.db.refuse('people', 'update')
    s.pick(webp('first'))
    await expect(s.save()).rejects.toThrow(PERMISSION_DENIED)
    expect(s.photoUrl()).toBe(LEGACY)
  })

  it('reads nothing extra: upload, then one update', async () => {
    const s = setup()
    s.pick(webp('first'))
    await s.save()
    expect(s.db.reads).toEqual([])
  })

  it('reports the exact file it uploaded', async () => {
    const s = setup()
    const file = webp('first')
    s.pick(file)
    await s.save()
    expect(s.uploaded).toEqual([file])
  })
})

describe('settleUploadedPhoto', () => {
  const entry = (file: File): PendingPhoto => ({ file, blobUrl: `blob:${file.name}` })

  it('forgets the photo once it is saved', () => {
    const a = webp('a')
    const pending = new Map([['p1', entry(a)]])
    const revoked: string[] = []
    expect(settleUploadedPhoto(pending, 'p1', a, u => revoked.push(u))).toBe(true)
    expect(pending.size).toBe(0)
    expect(revoked).toEqual(['blob:photo.webp'])
  })

  it('keeps a photo picked while the previous one was uploading', () => {
    const a = webp('a'), b = webp('b')
    const pending = new Map([['p1', entry(b)]])
    const revoked: string[] = []
    expect(settleUploadedPhoto(pending, 'p1', a, u => revoked.push(u))).toBe(false)
    expect(pending.get('p1')?.file).toBe(b)
    expect(revoked).toEqual([])
  })
})

describe('avatar helpers', () => {
  it('one fixed file per person', () => {
    expect(avatarPath('3f2a9c1e-77aa-4bcd-9e01-0123456789ab')).toBe('3f2a9c1e-77aa-4bcd-9e01-0123456789ab.webp')
  })

  it('the cache nonce follows the bytes', async () => {
    expect(await contentNonce(webp('same'))).toBe(await contentNonce(webp('same')))
    expect(await contentNonce(webp('same'))).not.toBe(await contentNonce(webp('Same')))
    expect(await contentNonce(webp('ab'))).not.toBe(await contentNonce(webp('ba')))
    expect(await contentNonce(webp('same'))).toMatch(/^[0-9a-f]{16}$/)
  })

  it('maps image types to extensions', () => {
    expect(extForMime('image/webp')).toBe('webp')
    expect(extForMime('image/JPEG; charset=binary')).toBe('jpg')
    expect(extForMime('text/html')).toBeUndefined()
    expect(extForMime(null)).toBeUndefined()
  })
})

describe('clampArea', () => {
  it('keeps a crop square and inside the image', () => {
    expect(clampArea({ x: -0.4, y: 10.6, width: 100.2, height: 100.2 }, 400, 300)).toEqual({ x: 0, y: 11, width: 100, height: 100 })
    expect(clampArea({ x: 350, y: 250, width: 100, height: 100 }, 400, 300)).toEqual({ x: 300, y: 200, width: 100, height: 100 })
    // Too big for the image: both sides shrink to the smaller limit.
    expect(clampArea({ x: 0, y: 0, width: 999, height: 999 }, 400, 300)).toEqual({ x: 0, y: 0, width: 300, height: 300 })
    // A not-quite-square crop (rounding) comes back square.
    expect(clampArea({ x: 10, y: 10, width: 120.6, height: 119.4 }, 400, 300)).toEqual({ x: 10, y: 10, width: 119, height: 119 })
  })
})

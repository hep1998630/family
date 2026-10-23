import { describe, expect, it } from 'vitest'
import { runSaveQueue, newUuid, type PendingOp } from '@/lib/draft/saveQueue'
import { createMockDb, PUBLIC_URL } from '@/lib/draft/mockSupabase'
import { PERMISSION_DENIED } from '@/lib/supabase/writes'
import { avatarPath, avatarPathFromUrl } from './avatarPath'
import { clampArea } from './cropImage'

// Replacing a profile photo: the new file gets its own name (so nobody keeps
// seeing a cached old photo), and the old file is removed only after the new
// one is saved — safely across retries and refused writes.

const t = '2026-01-01T00:00:00Z'
const OLD = 'p1-0123456789ab.jpg'

function setup(photoUrl: string | null = `${PUBLIC_URL}${OLD}`) {
  const db = createMockDb()
  db.tables.people.push({ id: 'p1', name: 'تميمة', root_id: 'root', photo_url: photoUrl, created_at: t })
  const photos = new Map([['p1', new File(['webp'], 'photo.webp', { type: 'image/webp' })]])
  const queue = { current: [] as PendingOp[] }
  const replace = () => {
    photos.set('p1', new File(['webp'], 'photo.webp', { type: 'image/webp' }))
    queue.current.push({ opId: newUuid(), type: 'uploadPhoto', personId: 'p1' })
  }
  const save = () => runSaveQueue({
    client: db.client, queue, idMap: new Map(), getPhoto: id => photos.get(id),
    onQueueChange: () => {}, onResolved: () => {}, onPhotoUploaded: id => { photos.delete(id) },
  })
  const photoUrl_ = () => db.tables.people[0].photo_url as string | null
  return { db, queue, replace, save, photoUrl: photoUrl_ }
}

describe('replacing a profile photo', () => {
  it('uploads under a new name, points photo_url at it, then removes the old file', async () => {
    const s = setup()
    s.replace()
    await s.save()
    expect(s.db.uploads).toHaveLength(1)
    expect(s.db.uploads[0]).toMatch(/^p1-[0-9a-f]{12}\.webp$/)
    expect(s.db.uploads[0]).not.toBe(OLD)
    expect(s.photoUrl()).toBe(`${PUBLIC_URL}${s.db.uploads[0]}`)
    expect(s.db.removed).toEqual([OLD])
    expect(s.queue.current).toHaveLength(0)
  })

  it('every new crop gets a new URL', async () => {
    const s = setup()
    s.replace(); await s.save()
    const first = s.photoUrl()
    s.replace(); await s.save()
    expect(s.photoUrl()).not.toBe(first)
    expect(s.db.removed).toEqual([OLD, avatarPathFromUrl(first)])
  })

  it('a retry after a lost response re-uses the same name and never removes the new photo', async () => {
    const s = setup()
    s.replace()
    s.db.failNext('people', 'update', 'after') // saved, but the reply never arrived
    await expect(s.save()).rejects.toThrow()
    expect(s.db.removed).toEqual([])
    await s.save()
    expect(new Set(s.db.uploads).size).toBe(1) // the retry overwrote the same file
    expect(s.photoUrl()).toBe(`${PUBLIC_URL}${s.db.uploads[0]}`)
    expect(s.db.removed).toEqual([OLD])
  })

  it('a failed upload keeps the old photo until a retry succeeds', async () => {
    const s = setup()
    s.replace()
    s.db.failNextUpload()
    await expect(s.save()).rejects.toThrow(/upload/)
    expect(s.photoUrl()).toBe(`${PUBLIC_URL}${OLD}`)
    expect(s.db.removed).toEqual([])
    await s.save()
    expect(s.db.removed).toEqual([OLD])
  })

  it('a refused write (no permission) is reported, and the old photo stays', async () => {
    const s = setup()
    s.db.refuse('people', 'update')
    s.replace()
    await expect(s.save()).rejects.toThrow(PERMISSION_DENIED)
    expect(s.photoUrl()).toBe(`${PUBLIC_URL}${OLD}`)
    expect(s.db.removed).toEqual([])
  })

  it('removes nothing when there was no photo, or it was an outside link', async () => {
    for (const before of [null, 'https://example.com/someone.jpg']) {
      const s = setup(before)
      s.replace()
      await s.save()
      expect(s.photoUrl()).toBe(`${PUBLIC_URL}${s.db.uploads[0]}`)
      expect(s.db.removed).toEqual([])
    }
  })
})

describe('avatarPath / avatarPathFromUrl', () => {
  it('names the file by person, upload and format', () => {
    const id = '3f2a9c1e-77aa-4bcd-9e01-0123456789ab'
    expect(avatarPath('p1', id, { type: 'image/webp', name: 'photo.webp' })).toBe('p1-3f2a9c1e77aa.webp')
    expect(avatarPath('p1', id, { type: 'image/jpeg', name: 'photo.jpg' })).toBe('p1-3f2a9c1e77aa.jpg')
    expect(avatarPath('p1', id, { type: '', name: 'IMG_1.PNG' })).toBe('p1-3f2a9c1e77aa.png')
    expect(avatarPath('p1', id, { type: '', name: 'noext' })).toBe('p1-3f2a9c1e77aa.jpg')
  })

  it('finds our files in a public URL, and only ours', () => {
    expect(avatarPathFromUrl('https://x.supabase.co/storage/v1/object/public/avatars/p1.jpg')).toBe('p1.jpg')
    expect(avatarPathFromUrl('https://x.supabase.co/storage/v1/object/public/avatars/p1-ab.webp?t=1')).toBe('p1-ab.webp')
    expect(avatarPathFromUrl('https://x.supabase.co/storage/v1/object/public/other/p1.jpg')).toBeNull()
    expect(avatarPathFromUrl('https://example.com/p1.jpg')).toBeNull()
    expect(avatarPathFromUrl('blob:http://localhost/123')).toBeNull()
    expect(avatarPathFromUrl(null)).toBeNull()
  })
})

describe('clampArea', () => {
  it('keeps a crop inside the image', () => {
    expect(clampArea({ x: -0.4, y: 10.6, width: 100.2, height: 100.2 }, 400, 300)).toEqual({ x: 0, y: 11, width: 100, height: 100 })
    expect(clampArea({ x: 350, y: 250, width: 100, height: 100 }, 400, 300)).toEqual({ x: 300, y: 200, width: 100, height: 100 })
    expect(clampArea({ x: 0, y: 0, width: 999, height: 999 }, 400, 300)).toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })
})

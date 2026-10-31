import { describe, expect, it } from 'vitest'
import { runSaveQueue, newUuid, type NewPendingOp, type PendingOp } from './saveQueue'
import { createMockDb, PUBLIC_URL } from './mockSupabase'
import type { InsertPerson } from '@/lib/supabase/types'

function person(name: string, root_id: string, extra: Partial<InsertPerson> = {}): InsertPerson {
  return { name, root_id, is_shortcut: false, original_person_id: null, ...extra }
}

/** Mirrors how useEditDraft drives the engine, minus React. */
function makeDraft(db: ReturnType<typeof createMockDb>) {
  const queue = { current: [] as PendingOp[] }
  const idMap = new Map<string, string>()
  const photos = new Map<string, File>()
  const resolvedCalls: [string, string][] = []

  const add = (op: NewPendingOp) => {
    queue.current.push({ ...op, opId: newUuid() } as PendingOp)
  }
  const save = () => runSaveQueue({
    client: db.client,
    queue,
    idMap,
    getPhoto: id => photos.get(id),
    onQueueChange: () => {},
    onResolved: (t, r) => {
      resolvedCalls.push([t, r])
      const p = photos.get(t)
      if (p) { photos.delete(t); photos.set(r, p) }
    },
    onPhotoUploaded: id => { photos.delete(id) },
  })
  return { queue, idMap, photos, resolvedCalls, add, save }
}

/** Queues what "add a family, then a partner, then a child" produces. */
function queueFamily(d: ReturnType<typeof makeDraft>) {
  d.add({ type: 'addRoot', tempId: 'temp_root', realId: newUuid(), name: 'عائلة' })
  d.add({ type: 'addPerson', tempId: 'temp_father', realId: newUuid(), data: person('مصطفى', 'temp_root', { gender: 'male' }) })
  d.add({ type: 'addPerson', tempId: 'temp_mother', realId: newUuid(), data: person('تهاني', 'temp_root', { gender: 'female' }) })
  d.add({ type: 'addPartnership', tempId: 'temp_ps', realId: newUuid(), personAId: 'temp_father', personBId: 'temp_mother' })
  d.add({ type: 'addPerson', tempId: 'temp_child', realId: newUuid(), data: person('محمد', 'temp_root', { mother_id: 'temp_mother' }) })
  d.add({ type: 'addParentChild', tempId: 'temp_pc', realId: newUuid(), parentId: 'temp_father', childId: 'temp_child' })
}

function expectExactlyOneOfEach(db: ReturnType<typeof createMockDb>) {
  expect(db.tables.roots).toHaveLength(1)
  expect(db.tables.people).toHaveLength(3)
  expect(db.tables.partnerships).toHaveLength(1)
  expect(db.tables.parent_child).toHaveLength(1)

  // And the relationships point at the real rows, not at temp ids.
  const ids = new Set(db.tables.people.map(p => p.id))
  const ps = db.tables.partnerships[0]
  expect(ids.has(ps.person_a_id as string) && ids.has(ps.person_b_id as string)).toBe(true)
  const pc = db.tables.parent_child[0]
  expect(ids.has(pc.parent_id as string) && ids.has(pc.child_id as string)).toBe(true)
  const child = db.tables.people.find(p => p.name === 'محمد')!
  expect(ids.has(child.mother_id as string)).toBe(true)
  expect(db.tables.people.every(p => p.root_id === db.tables.roots[0].id)).toBe(true)
}

describe('runSaveQueue', () => {
  it('a failure partway, then a successful retry, writes exactly one row per op', async () => {
    const db = createMockDb()
    const d = makeDraft(db)
    queueFamily(d)

    db.failNext('partnerships', 'insert')
    await expect(d.save()).rejects.toThrow(/injected/)

    // Everything before the failed op is written and gone from the queue.
    expect(db.tables.roots).toHaveLength(1)
    expect(db.tables.people).toHaveLength(2)
    expect(d.queue.current[0].type).toBe('addPartnership')

    await d.save()
    expect(d.queue.current).toHaveLength(0)
    expectExactlyOneOfEach(db)
  })

  it('pressing Save four times through repeated failures still writes one of each', async () => {
    const db = createMockDb()
    const d = makeDraft(db)
    queueFamily(d)

    db.failNext('partnerships', 'insert')
    db.failNext('people', 'insert') // will hit the child
    db.failNext('parent_child', 'insert')
    await expect(d.save()).rejects.toThrow()
    await expect(d.save()).rejects.toThrow()
    await expect(d.save()).rejects.toThrow()
    await d.save()

    expectExactlyOneOfEach(db)
  })

  it('a lost response (row written, client sees an error) is not re-inserted on retry', async () => {
    const db = createMockDb()
    const d = makeDraft(db)
    queueFamily(d)

    db.failNext('people', 'insert', 'after')       // the father
    db.failNext('partnerships', 'insert', 'after')
    db.failNext('parent_child', 'insert', 'after')
    await expect(d.save()).rejects.toThrow()
    await expect(d.save()).rejects.toThrow()
    await expect(d.save()).rejects.toThrow()
    await d.save()

    expectExactlyOneOfEach(db)
  })

  it('does not add a second partnership when the pair already exists in reverse order', async () => {
    const db = createMockDb()
    db.tables.people.push({ id: 'a-real' }, { id: 'b-real' })
    db.tables.partnerships.push({ id: 'existing', person_a_id: 'b-real', person_b_id: 'a-real' })
    const d = makeDraft(db)
    d.add({ type: 'addPartnership', tempId: 'temp_ps', realId: newUuid(), personAId: 'a-real', personBId: 'b-real' })

    await d.save()
    expect(db.tables.partnerships).toHaveLength(1)
    expect(d.resolvedCalls).toContainEqual(['temp_ps', 'existing'])
  })

  it('a failed photo upload is retried on its own, without re-inserting the person', async () => {
    const db = createMockDb()
    db.tables.roots.push({ id: 'root' })
    const d = makeDraft(db)
    d.photos.set('temp_p', new File(['x'], 'face.jpg'))
    const realId = newUuid()
    d.add({ type: 'addPerson', tempId: 'temp_p', realId, data: person('تهاني', 'root') })

    db.failNextUpload()
    await expect(d.save()).rejects.toThrow(/upload/)
    expect(db.tables.people).toHaveLength(1)
    expect(d.queue.current[0].type).toBe('uploadPhoto')

    await d.save()
    expect(db.tables.people).toHaveLength(1)
    expect(db.uploads).toEqual([`${realId}.webp`])
    expect(db.tables.people[0].photo_url).toMatch(new RegExp(`^${PUBLIC_URL}${realId}\\.webp\\?cacheNonce=[0-9a-f]{16}$`))
  })

  it('replacing a parent link removes the old row and adds the new one, safely on retry', async () => {
    const db = createMockDb()
    db.tables.parent_child.push({ id: 'old-link', parent_id: 'mother', child_id: 'kid' })
    const d = makeDraft(db)
    d.add({ type: 'addParentChild', tempId: 'temp_pc', realId: newUuid(), parentId: 'father', childId: 'kid' })
    d.add({ type: 'removeParentChild', id: 'old-link' })
    d.add({ type: 'addParentChild', tempId: 'temp_pc2', realId: newUuid(), parentId: 'mother2', childId: 'kid' })

    db.failNext('parent_child', 'delete')
    await expect(d.save()).rejects.toThrow()
    await d.save()

    const links = db.tables.parent_child.map(r => `${r.parent_id}>${r.child_id}`).sort()
    expect(links).toEqual(['father>kid', 'mother2>kid'])
  })
})

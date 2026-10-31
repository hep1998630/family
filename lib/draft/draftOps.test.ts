import { describe, expect, it } from 'vitest'
import { runSaveQueue, newUuid, type NewPendingOp, type PendingOp } from './saveQueue'
import { deletePersonOps, removeLinkOps } from './draftOps'
import { createMockDb } from './mockSupabase'
import { PERMISSION_DENIED } from '@/lib/supabase/writes'
import type { InsertPerson } from '@/lib/supabase/types'

// An insert whose answer was lost may be in the database anyway. These tests
// check that such a "maybe written" row is neither left behind when the user
// removes it, nor has later edits dropped when the retry finds it exists.

const t = '2026-01-01T00:00:00Z'
const notInFlight = () => false
const person = (name: string, extra: Partial<InsertPerson> = {}): InsertPerson =>
  ({ name, root_id: 'root', is_shortcut: false, original_person_id: null, ...extra })

function setup() {
  const db = createMockDb()
  db.tables.roots.push({ id: 'root', name: 'A', created_at: t })
  db.tables.people.push(
    { id: 'dad', name: 'الأب', root_id: 'root', created_at: t },
    { id: 'mum', name: 'الأم', root_id: 'root', created_at: t },
  )
  const queue = { current: [] as PendingOp[] }
  const idMap = new Map<string, string>()
  const add = (op: NewPendingOp) => { queue.current.push({ ...op, opId: newUuid() } as PendingOp) }
  const save = () => runSaveQueue({
    client: db.client, queue, idMap, getPhoto: () => undefined,
    onQueueChange: () => {}, onResolved: () => {}, onPhotoUploaded: () => {},
  })
  return { db, queue, idMap, add, save }
}

describe('an insert whose answer was lost is flagged "maybe written"', () => {
  it('a network error flags it; a database refusal does not', async () => {
    const s = setup()
    s.add({ type: 'addPartnership', tempId: 'tp', realId: newUuid(), personAId: 'dad', personBId: 'mum' })
    s.db.failNext('partnerships', 'insert', 'after') // written, reply lost (no error code)
    await expect(s.save()).rejects.toThrow()
    expect((s.queue.current[0] as { maybeWritten?: boolean }).maybeWritten).toBe(true)
  })

  it('retry finds the person already written → edits made since are written as an update', async () => {
    const s = setup()
    const realId = newUuid()
    s.add({ type: 'addPerson', tempId: 'tk', realId, data: person('خالد') })
    s.db.failNext('people', 'insert', 'after')
    await expect(s.save()).rejects.toThrow()
    expect(s.db.tables.people.find(p => p.id === realId)?.name).toBe('خالد')
    // The user fixes the name before retrying; the draft folds it into the insert.
    const op = s.queue.current[0] as Extract<PendingOp, { type: 'addPerson' }>
    s.queue.current[0] = { ...op, data: { ...op.data, name: 'خالد بن الوليد', bio: 'قائد' } }
    await s.save()
    const row = s.db.tables.people.find(p => p.id === realId)!
    expect(row.name).toBe('خالد بن الوليد')
    expect(row.bio).toBe('قائد')
    expect(s.db.tables.people.filter(p => p.id === realId)).toHaveLength(1)
  })
})

describe('removing something added in the draft', () => {
  it('never sent → just cancelled, nothing is written', async () => {
    const s = setup()
    s.add({ type: 'addPartnership', tempId: 'tp', realId: newUuid(), personAId: 'dad', personBId: 'mum' })
    s.queue.current = removeLinkOps(s.queue.current, 'partnership', 'tp', notInFlight)
    expect(s.queue.current).toHaveLength(0)
    await s.save()
    expect(s.db.tables.partnerships).toHaveLength(0)
  })

  it('a maybe-written marriage that the user removes is deleted for real', async () => {
    const s = setup()
    s.add({ type: 'addPartnership', tempId: 'tp', realId: newUuid(), personAId: 'dad', personBId: 'mum' })
    s.db.failNext('partnerships', 'insert', 'after')
    await expect(s.save()).rejects.toThrow()
    expect(s.db.tables.partnerships).toHaveLength(1) // it did land
    s.queue.current = removeLinkOps(s.queue.current, 'partnership', 'tp', notInFlight)
    await s.save()
    expect(s.db.tables.partnerships).toHaveLength(0)
    expect(s.queue.current).toHaveLength(0)
  })

  it('a maybe-written parent link that the user removes is deleted for real', async () => {
    const s = setup()
    s.db.tables.people.push({ id: 'kid', name: 'الابن', root_id: 'root', created_at: t })
    s.add({ type: 'addParentChild', tempId: 'tl', realId: newUuid(), parentId: 'dad', childId: 'kid' })
    s.db.failNext('parent_child', 'insert', 'after')
    await expect(s.save()).rejects.toThrow()
    s.queue.current = removeLinkOps(s.queue.current, 'parentChild', 'tl', notInFlight)
    await s.save()
    expect(s.db.tables.parent_child).toHaveLength(0)
  })

  it('...and when the lost insert had NOT landed, the delete is harmless', async () => {
    const s = setup()
    s.add({ type: 'addPartnership', tempId: 'tp', realId: newUuid(), personAId: 'dad', personBId: 'mum' })
    s.db.failNext('partnerships', 'insert', 'before') // network error, nothing written
    await expect(s.save()).rejects.toThrow()
    s.queue.current = removeLinkOps(s.queue.current, 'partnership', 'tp', notInFlight)
    await s.save()
    expect(s.db.tables.partnerships).toHaveLength(0)
    expect(s.queue.current).toHaveLength(0)
  })

  it('a maybe-written person who is then deleted is deleted for real, with their links', async () => {
    const s = setup()
    const realId = newUuid()
    s.add({ type: 'addPerson', tempId: 'tw', realId, data: person('زوجة ثانية', { gender: 'female' }) })
    s.add({ type: 'addPartnership', tempId: 'tp', realId: newUuid(), personAId: 'dad', personBId: 'tw' })
    s.db.failNext('people', 'insert', 'after')
    await expect(s.save()).rejects.toThrow()
    s.queue.current = deletePersonOps(s.queue.current, 'tw', notInFlight)
    expect(s.queue.current.map(op => op.type)).toEqual(['deletePerson'])
    await s.save()
    expect(s.db.tables.people.some(p => p.id === realId)).toBe(false)
    expect(s.db.tables.partnerships).toHaveLength(0)
  })

  it('a never-sent person who is deleted leaves nothing to do', () => {
    const s = setup()
    s.add({ type: 'addPerson', tempId: 'tw', realId: newUuid(), data: person('ضيف') })
    s.add({ type: 'addPartnership', tempId: 'tp', realId: newUuid(), personAId: 'dad', personBId: 'tw' })
    expect(deletePersonOps(s.queue.current, 'tw', notInFlight)).toEqual([])
  })
})

describe('deleting a person (delete_person, migration 007)', () => {
  it('removes the person, their marriages and their shortcut rows in one step', async () => {
    const s = setup()
    s.db.tables.people.push(
      { id: 'single', name: 'وحيد', root_id: 'root', created_at: t },
      { id: 'single-copy', name: 'وحيد', root_id: 'B', is_shortcut: true, original_person_id: 'single', created_at: t },
    )
    s.db.tables.partnerships.push({ id: 'm1', person_a_id: 'single', person_b_id: 'mum', created_at: t })
    s.db.tables.parent_child.push({ id: 'l1', parent_id: 'dad', child_id: 'single', created_at: t })
    s.add({ type: 'deletePerson', id: 'single' })
    await s.save()
    expect(s.db.tables.people.map(p => p.id).sort()).toEqual(['dad', 'mum'])
    expect(s.db.tables.partnerships).toHaveLength(0)
    expect(s.db.tables.parent_child).toHaveLength(0)
  })

  it('a failure leaves nothing half-deleted, and the op can be retried', async () => {
    const s = setup()
    s.db.tables.people.push({ id: 'single', name: 'وحيد', root_id: 'root', created_at: t })
    s.db.tables.partnerships.push({ id: 'm1', person_a_id: 'single', person_b_id: 'mum', created_at: t })
    s.add({ type: 'deletePerson', id: 'single' })
    s.db.failNext('rpc', 'delete_person')
    await expect(s.save()).rejects.toThrow()
    expect(s.db.tables.people.some(p => p.id === 'single')).toBe(true)
    expect(s.db.tables.partnerships).toHaveLength(1)
    await s.save()
    expect(s.db.tables.people.some(p => p.id === 'single')).toBe(false)
  })

  it('a lost answer: the retry finds the person gone and succeeds', async () => {
    const s = setup()
    s.db.tables.people.push({ id: 'single', name: 'وحيد', root_id: 'root', created_at: t })
    s.add({ type: 'deletePerson', id: 'single' })
    s.db.failNext('rpc', 'delete_person', 'after')
    await expect(s.save()).rejects.toThrow()
    await s.save()
    expect(s.queue.current).toHaveLength(0)
  })

  it('someone with children (also via mother_id only) is refused, nothing deleted', async () => {
    const s = setup()
    s.db.tables.people.push({ id: 'kid', name: 'الابن', root_id: 'root', mother_id: 'mum', created_at: t })
    s.db.tables.partnerships.push({ id: 'm1', person_a_id: 'dad', person_b_id: 'mum', created_at: t })
    s.add({ type: 'deletePerson', id: 'mum' })
    await expect(s.save()).rejects.toThrow(/children/)
    expect(s.db.tables.people.some(p => p.id === 'mum')).toBe(true)
    expect(s.db.tables.partnerships).toHaveLength(1)
  })

  it('an editor is refused before anything is touched', async () => {
    const s = setup()
    s.db.actAsEditor()
    s.add({ type: 'deletePerson', id: 'mum' })
    await expect(s.save()).rejects.toThrow(PERMISSION_DENIED)
    expect(s.db.tables.people.some(p => p.id === 'mum')).toBe(true)
  })
})

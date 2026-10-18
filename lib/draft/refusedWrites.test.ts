import { describe, expect, it } from 'vitest'
import { runSaveQueue, newUuid, type NewPendingOp, type PendingOp } from './saveQueue'
import { createMockDb } from './mockSupabase'
import { PERMISSION_DENIED } from '@/lib/supabase/writes'

// Row-level security doesn't make a refused UPDATE/DELETE fail — it changes
// 0 rows and reports success. These tests make sure such a write is reported
// instead of looking saved (and that nothing after it runs).

const t = '2026-01-01T00:00:00Z'
function seeded() {
  const db = createMockDb()
  db.tables.roots.push({ id: 'root', name: 'A', created_at: t })
  for (const id of ['father', 'mother', 'son', 'rightFather']) {
    db.tables.people.push({ id, name: id, root_id: 'root', created_at: t })
  }
  db.tables.partnerships.push({ id: 'marriage', person_a_id: 'father', person_b_id: 'mother', created_at: t })
  db.tables.parent_child.push(
    { id: 'pc-father', parent_id: 'father', child_id: 'son', created_at: t },
    { id: 'pc-mother', parent_id: 'mother', child_id: 'son', created_at: t },
  )
  return db
}

function runner(db: ReturnType<typeof createMockDb>, ops: NewPendingOp[]) {
  const queue = { current: ops.map(op => ({ ...op, opId: newUuid() }) as PendingOp) }
  const save = () => runSaveQueue({
    client: db.client, queue, idMap: new Map(), getPhoto: () => undefined,
    onQueueChange: () => {}, onResolved: () => {}, onPhotoUploaded: () => {},
  })
  return { queue, save }
}

const parentsOfSon = (db: ReturnType<typeof createMockDb>) =>
  db.tables.parent_child.filter(r => r.child_id === 'son').map(r => r.parent_id).sort()

describe('a refused write is reported, never "saved"', () => {
  it('changing the father: refused delete stops before the new father is linked', async () => {
    const db = seeded()
    db.refuse('parent_child', 'delete') // e.g. migration 006 not run yet
    // What ProfileEdit queues when «الأب» changes: remove the old link, add the new one.
    const { queue, save } = runner(db, [
      { type: 'removeParentChild', id: 'pc-father' },
      { type: 'addParentChild', tempId: 'tmp', realId: newUuid(), parentId: 'rightFather', childId: 'son' },
    ])
    await expect(save()).rejects.toThrow(PERMISSION_DENIED)
    expect(parentsOfSon(db)).toEqual(['father', 'mother']) // no third parent
    expect(queue.current.map(op => op.type)).toEqual(['removeParentChild', 'addParentChild'])
  })

  it('changing the father: allowed delete replaces the link', async () => {
    const db = seeded()
    const { save } = runner(db, [
      { type: 'removeParentChild', id: 'pc-father' },
      { type: 'addParentChild', tempId: 'tmp', realId: newUuid(), parentId: 'rightFather', childId: 'son' },
    ])
    await save()
    expect(parentsOfSon(db)).toEqual(['mother', 'rightFather'])
  })

  it('removing a marriage that RLS refuses is an error, not a silent success', async () => {
    const db = seeded()
    db.refuse('partnerships', 'delete')
    const { save } = runner(db, [{ type: 'removePartnership', id: 'marriage' }])
    await expect(save()).rejects.toThrow(PERMISSION_DENIED)
    expect(db.tables.partnerships).toHaveLength(1)
  })

  it('a refused profile edit is reported', async () => {
    const db = seeded()
    db.refuse('people', 'update')
    const { save } = runner(db, [{ type: 'updatePerson', id: 'son', updates: { nickname: 'أبو علي' } }])
    await expect(save()).rejects.toThrow(PERMISSION_DENIED)
  })

  it('an editor deleting a person: refused BEFORE any of their links are touched', async () => {
    const db = seeded()
    db.actAsEditor()
    const { save } = runner(db, [{ type: 'deletePerson', id: 'son' }])
    await expect(save()).rejects.toThrow(PERMISSION_DENIED)
    expect(db.tables.people.some(p => p.id === 'son')).toBe(true)
    expect(parentsOfSon(db)).toEqual(['father', 'mother'])
  })

  it('the owner deleting a person: person and links go', async () => {
    const db = seeded()
    const { save } = runner(db, [{ type: 'deletePerson', id: 'son' }])
    await save()
    expect(db.tables.people.some(p => p.id === 'son')).toBe(false)
    expect(parentsOfSon(db)).toEqual([])
  })

  it('a delete retried after its response was lost is fine (row already gone)', async () => {
    const db = seeded()
    db.failNext('partnerships', 'delete', 'after') // deleted, but the reply never arrived
    const { queue, save } = runner(db, [{ type: 'removePartnership', id: 'marriage' }])
    await expect(save()).rejects.toThrow()
    expect(db.tables.partnerships).toHaveLength(0)
    await save() // retry: 0 rows deleted, and the row is gone — that's success
    expect(queue.current).toHaveLength(0)
  })
})

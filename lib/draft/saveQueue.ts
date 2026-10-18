// lib/draft/saveQueue.ts
//
// The save engine behind hooks/useEditDraft.ts, kept free of React so it
// can be unit-tested against a mocked Supabase client.
//
// Guarantees that a Save which fails partway, and is then pressed again
// (any number of times), never writes the same row twice:
//
//  - Every insert carries a real UUID generated when the op was queued,
//    not one assigned by the database. Retrying an insert whose response
//    was lost therefore hits a primary-key conflict instead of creating a
//    second row, and a conflict is treated as "already done".
//  - Each op is removed from the queue the moment it succeeds, so a later
//    retry only resumes from the op that failed.
//  - The temp-id → real-id map lives in the caller (a ref that survives
//    across save attempts), and remaining queued ops are rewritten to the
//    real ids as soon as each one resolves.

import { checkWritten, requireOwner } from '@/lib/supabase/writes'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, InsertPerson, UpdatePerson } from '@/lib/supabase/types'

export type PendingOp = { opId: string } & (
  | { type: 'addRoot'; tempId: string; realId: string; name: string }
  | { type: 'addPerson'; tempId: string; realId: string; data: InsertPerson }
  | { type: 'uploadPhoto'; personId: string }
  | { type: 'addPartnership'; tempId: string; realId: string; personAId: string; personBId: string }
  | { type: 'removePartnership'; id: string }
  | { type: 'addParentChild'; tempId: string; realId: string; parentId: string; childId: string }
  | { type: 'removeParentChild'; id: string }
  | { type: 'updatePerson'; id: string; updates: UpdatePerson }
  | { type: 'deletePerson'; id: string }
)

/** A PendingOp before it has been given an opId (distributes over the union). */
export type NewPendingOp = PendingOp extends infer T
  ? T extends PendingOp ? Omit<T, 'opId'> : never
  : never

export function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for non-secure contexts (e.g. plain HTTP on a local network).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Returns `op` with every reference to `from` replaced by `to`. */
export function remapOp(op: PendingOp, from: string, to: string): PendingOp {
  const m = (id: string) => (id === from ? to : id)
  switch (op.type) {
    case 'addRoot':
      return op
    case 'addPerson':
      return {
        ...op,
        data: {
          ...op.data,
          root_id: m(op.data.root_id),
          mother_id: op.data.mother_id ? m(op.data.mother_id) : op.data.mother_id,
          original_person_id: op.data.original_person_id
            ? m(op.data.original_person_id) : op.data.original_person_id,
        },
      }
    case 'uploadPhoto':
      return { ...op, personId: m(op.personId) }
    case 'addPartnership':
      return { ...op, personAId: m(op.personAId), personBId: m(op.personBId) }
    case 'removePartnership':
      return { ...op, id: m(op.id) }
    case 'addParentChild':
      return { ...op, parentId: m(op.parentId), childId: m(op.childId) }
    case 'removeParentChild':
      return { ...op, id: m(op.id) }
    case 'updatePerson':
      return {
        ...op,
        id: m(op.id),
        updates: op.updates.mother_id
          ? { ...op.updates, mother_id: m(op.updates.mother_id) }
          : op.updates,
      }
    case 'deletePerson':
      return { ...op, id: m(op.id) }
  }
}

export interface SaveQueueDeps {
  client: SupabaseClient<Database>
  /** The queue itself. Mutated in place: ops are removed as they succeed. */
  queue: { current: PendingOp[] }
  /** temp id → real id, persisted by the caller across save attempts. */
  idMap: Map<string, string>
  getPhoto: (personId: string) => File | undefined
  /** Called whenever the queue changes length (for re-rendering). */
  onQueueChange: () => void
  /** A temp id now has a real row in the database — rewrite local state. */
  onResolved: (tempId: string, realId: string) => void
  onPhotoUploaded: (personId: string, publicUrl: string) => void
}

const isDuplicate = (error: { code?: string } | null) => error?.code === '23505'

/**
 * Runs queued ops in order until the queue is empty. Throws on the first
 * op that fails; every op before it has already been removed from the
 * queue, so calling this again resumes from the failed op.
 */
export async function runSaveQueue(deps: SaveQueueDeps): Promise<void> {
  const { client, queue, idMap, getPhoto, onQueueChange, onResolved, onPhotoUploaded } = deps
  const r = (id: string) => idMap.get(id) ?? id

  const done = () => {
    queue.current = queue.current.slice(1)
    onQueueChange()
  }
  const replaceHead = (op: PendingOp) => {
    queue.current = [op, ...queue.current.slice(1)]
  }
  const resolved = (tempId: string, realId: string) => {
    idMap.set(tempId, realId)
    queue.current = queue.current.map(op => remapOp(op, tempId, realId))
    onResolved(tempId, realId)
  }

  while (queue.current.length > 0) {
    const op = queue.current[0]

    switch (op.type) {
      case 'addRoot': {
        const { error } = await client
          .from('roots')
          .insert({ id: op.realId, name: op.name })
        if (error && !isDuplicate(error)) throw new Error(error.message)
        done()
        resolved(op.tempId, op.realId)
        break
      }

      case 'addPerson': {
        const hasPhoto = !!getPhoto(op.tempId)
        const { error } = await client.from('people').insert({
          ...op.data,
          id: op.realId,
          root_id: r(op.data.root_id),
          mother_id: op.data.mother_id ? r(op.data.mother_id) : null,
          original_person_id: op.data.original_person_id ? r(op.data.original_person_id) : null,
          // Never persist a blob: URL — the photo is uploaded as its own step.
          photo_url: hasPhoto || op.data.photo_url?.startsWith('blob:')
            ? null
            : (op.data.photo_url ?? null),
        })
        if (error && !isDuplicate(error)) throw new Error(error.message)
        // The row exists now. If a photo still needs uploading, turn this op
        // into that follow-up step instead of dropping it — so a failed
        // upload is retried on its own, without re-inserting the person.
        if (hasPhoto) replaceHead({ opId: newUuid(), type: 'uploadPhoto', personId: op.tempId })
        else done()
        resolved(op.tempId, op.realId)
        break
      }

      case 'uploadPhoto': {
        const file = getPhoto(op.personId)
        if (!file) { done(); break }
        const id = r(op.personId)
        const ext = file.name.split('.').pop()
        const path = `${id}.${ext}`
        const { error: upErr } = await client.storage
          .from('avatars').upload(path, file, { upsert: true })
        if (upErr) throw new Error(upErr.message)
        const { data: urlData } = client.storage.from('avatars').getPublicUrl(path)
        await checkWritten(client, 'people', id, await client.from('people')
          .update({ photo_url: urlData.publicUrl }).eq('id', id).select('id'))
        onPhotoUploaded(id, urlData.publicUrl)
        done()
        break
      }

      case 'addPartnership': {
        // Sort by the *real* ids, matching the live hook's convention, and
        // reuse an existing partnership for this pair in either order rather
        // than inserting a second (possibly reversed) row.
        const [a, b] = [r(op.personAId), r(op.personBId)].sort()
        const { data: existing, error: findErr } = await client
          .from('partnerships')
          .select('id')
          .or(`and(person_a_id.eq.${a},person_b_id.eq.${b}),and(person_a_id.eq.${b},person_b_id.eq.${a})`)
          .limit(1)
        if (findErr) throw new Error(findErr.message)
        let realId = existing?.[0]?.id as string | undefined
        if (!realId) {
          const { error } = await client
            .from('partnerships')
            .insert({ id: op.realId, person_a_id: a, person_b_id: b })
          if (error && !isDuplicate(error)) throw new Error(error.message)
          realId = op.realId
        }
        done()
        resolved(op.tempId, realId)
        break
      }

      case 'removePartnership': {
        const id = r(op.id)
        await checkWritten(client, 'partnerships', id,
          await client.from('partnerships').delete().eq('id', id).select('id'))
        done()
        break
      }

      case 'addParentChild': {
        const parentId = r(op.parentId)
        const childId = r(op.childId)
        let realId = op.realId
        const { error } = await client
          .from('parent_child')
          .insert({ id: op.realId, parent_id: parentId, child_id: childId })
        if (error && !isDuplicate(error)) throw new Error(error.message)
        if (error) {
          // Either our own earlier attempt landed, or this link already
          // existed under a different id — point local state at whichever.
          const { data } = await client
            .from('parent_child').select('id')
            .eq('parent_id', parentId).eq('child_id', childId)
            .limit(1)
          realId = (data?.[0]?.id as string | undefined) ?? op.realId
        }
        done()
        resolved(op.tempId, realId)
        break
      }

      case 'removeParentChild': {
        // Must really be gone before the replacement parent is linked (the
        // next op), or the child ends up with an extra parent.
        const id = r(op.id)
        await checkWritten(client, 'parent_child', id,
          await client.from('parent_child').delete().eq('id', id).select('id'))
        done()
        break
      }

      case 'updatePerson': {
        const id = r(op.id)
        const hasPhoto = !!getPhoto(op.id)
        const updates = { ...op.updates }
        if (updates.mother_id) updates.mother_id = r(updates.mother_id)
        // A blob: URL is only a local preview — never persist it.
        if (updates.photo_url?.startsWith('blob:')) delete updates.photo_url
        if (Object.keys(updates).length > 0) {
          await checkWritten(client, 'people', id,
            await client.from('people').update(updates).eq('id', id).select('id'))
        }
        if (hasPhoto) replaceHead({ opId: newUuid(), type: 'uploadPhoto', personId: id })
        else done()
        break
      }

      case 'deletePerson': {
        const id = r(op.id)
        // Only the owner may delete people. Check first, so a refused delete
        // can't leave the person in place with their links already removed.
        await requireOwner(client)
        const { error: e1 } = await client.from('partnerships').delete()
          .or(`person_a_id.eq.${id},person_b_id.eq.${id}`)
        if (e1) throw new Error(e1.message)
        const { error: e2 } = await client.from('parent_child').delete().eq('child_id', id)
        if (e2) throw new Error(e2.message)
        await checkWritten(client, 'people', id,
          await client.from('people').delete().eq('id', id).select('id'))
        done()
        break
      }
    }
  }
}

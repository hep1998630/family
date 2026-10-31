// lib/draft/draftOps.ts
//
// How the queue changes when the user removes something in the draft —
// kept free of React so it can be unit-tested with the save engine.
//
// Something added in this draft and not sent yet is simply cancelled. Once
// it may be in the database — being written right now, or `maybeWritten`
// (sent, then the answer was lost) — cancelling isn't enough: a real
// delete is queued after it.

import { newUuid, type DeleteUndo, type PendingOp } from './saveQueue'

type IsInFlight = (op: PendingOp) => boolean

/** Removing a marriage or a parent link. `id` may be a temp id. */
export function removeLinkOps(
  ops: PendingOp[],
  kind: 'partnership' | 'parentChild',
  id: string,
  isInFlight: IsInFlight,
): PendingOp[] {
  const addType = kind === 'partnership' ? 'addPartnership' : 'addParentChild'
  const removeType = kind === 'partnership' ? 'removePartnership' : 'removeParentChild'
  const queued = ops.find(op => op.type === addType && op.tempId === id) as
    Extract<PendingOp, { type: 'addPartnership' | 'addParentChild' }> | undefined

  if (queued && !isInFlight(queued)) {
    const rest = ops.filter(op => op !== queued)
    if (!queued.maybeWritten) return rest // never sent — just cancel it
    // Its row may exist under its real id (the temp id will never resolve now).
    return [...rest, { opId: newUuid(), type: removeType, id: queued.realId }]
  }
  // Already written (or being written right now) — delete it. A temp id is
  // remapped to the real one once that write resolves.
  return [...ops, { opId: newUuid(), type: removeType, id }]
}

/** Deleting a person: drop their not-yet-started ops, then delete them if they may exist. */
export function deletePersonOps(
  ops: PendingOp[],
  id: string,
  isInFlight: IsInFlight,
  undo?: DeleteUndo,
): PendingOp[] {
  const insert = ops.find(op => op.type === 'addPerson' && op.tempId === id) as
    Extract<PendingOp, { type: 'addPerson' }> | undefined
  const neverWritten = !!insert && !isInFlight(insert) && !insert.maybeWritten

  // Drop every not-yet-started op that involves this person. (A link insert
  // that may have been written is removed by delete_person with the rest.)
  const filtered = ops.filter(op => {
    if (isInFlight(op)) return true
    if (op.type === 'addPerson' && op.tempId === id) return false
    if (op.type === 'addPartnership' && (op.personAId === id || op.personBId === id)) return false
    if (op.type === 'addParentChild' && (op.parentId === id || op.childId === id)) return false
    if (op.type === 'updatePerson' && op.id === id) return false
    if (op.type === 'uploadPhoto' && op.personId === id) return false
    return true
  })
  if (neverWritten) return filtered
  // A maybe-written insert was dropped, so its temp id will never resolve:
  // delete by its real id.
  const target = insert && !isInFlight(insert) ? insert.realId : id
  return [...filtered, { opId: newUuid(), type: 'deletePerson', id: target, undo }]
}

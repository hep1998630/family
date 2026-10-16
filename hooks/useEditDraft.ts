'use client'

import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { newUuid, runSaveQueue, type NewPendingOp, type PendingOp } from '@/lib/draft/saveQueue'
import type {
  PersonRow, RootRow, PartnershipRow, ParentChildRow,
  InsertPerson, UpdatePerson,
} from '@/lib/supabase/types'

function makeTempId() {
  return `temp_${newUuid()}`
}

/**
 * Manages all edit-mode state locally without writing to the DB until
 * saveChanges() is called. Operations return immediately with temp IDs
 * so the UI stays responsive. See lib/draft/saveQueue.ts for why a Save
 * that fails partway can be retried safely.
 */
export function useEditDraft(
  initialRoots: RootRow[],
  initialPeople: PersonRow[],
  initialPartnerships: PartnershipRow[],
  initialParentChild: ParentChildRow[],
) {
  const [roots, setRoots] = useState<RootRow[]>(initialRoots)
  const [people, setPeople] = useState<PersonRow[]>(initialPeople)
  const [partnerships, setPartnerships] = useState<PartnershipRow[]>(initialPartnerships)
  const [parentChildRows, setParentChildRows] = useState<ParentChildRow[]>(initialParentChild)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // The queue lives in a ref so the save loop always sees the current
  // queue (not a stale render's copy) and survives across save attempts.
  // `opCount` mirrors its length purely to trigger re-renders.
  const opsRef = useRef<PendingOp[]>([])
  const [opCount, setOpCount] = useState(0)
  const idMapRef = useRef<Map<string, string>>(new Map())
  const savingRef = useRef(false)
  const pendingPhotos = useRef<Map<string, { file: File; blobUrl: string }>>(new Map())

  const supabase = createClient()

  const mutateOps = useCallback((fn: (ops: PendingOp[]) => PendingOp[]) => {
    opsRef.current = fn(opsRef.current)
    setOpCount(opsRef.current.length)
  }, [])

  /** The op currently being written by an in-flight save — never merge into it. */
  const isInFlight = useCallback(
    (op: PendingOp) => savingRef.current && opsRef.current[0] === op,
    [],
  )

  const enqueue = useCallback((op: NewPendingOp) => {
    mutateOps(ops => [...ops, { ...op, opId: newUuid() } as PendingOp])
  }, [mutateOps])

  // ── addRoot ─────────────────────────────────────────────────
  const addRoot = useCallback(async (name: string): Promise<RootRow | null> => {
    const tempId = makeTempId()
    const t = new Date().toISOString()
    const temp: RootRow = { id: tempId, name, canvas_x: 0, canvas_y: 0, created_at: t, updated_at: t }
    setRoots(prev => [...prev, temp])
    enqueue({ type: 'addRoot', tempId, realId: newUuid(), name })
    return temp
  }, [enqueue])

  // ── addPerson ───────────────────────────────────────────────
  const addPerson = useCallback(async (data: InsertPerson): Promise<PersonRow | null> => {
    const tempId = makeTempId()
    const t = new Date().toISOString()
    const temp: PersonRow = {
      id: tempId,
      name: data.name,
      nickname: data.nickname ?? null,
      birth_date: data.birth_date ?? null,
      bio: data.bio ?? null,
      photo_url: data.photo_url ?? null,
      mother_id: data.mother_id ?? null,
      gender: data.gender ?? null,
      root_id: data.root_id,
      is_shortcut: data.is_shortcut ?? false,
      original_person_id: data.original_person_id ?? null,
      canvas_x: data.canvas_x ?? 0,
      canvas_y: data.canvas_y ?? 0,
      created_at: t,
      updated_at: t,
    }
    setPeople(prev => [...prev, temp])
    enqueue({ type: 'addPerson', tempId, realId: newUuid(), data })
    return temp
  }, [enqueue])

  // ── addPartnership ──────────────────────────────────────────
  const addPartnership = useCallback(async (
    personAId: string,
    personBId: string,
  ): Promise<PartnershipRow | null> => {
    const tempId = makeTempId()
    const temp: PartnershipRow = {
      id: tempId,
      person_a_id: personAId,
      person_b_id: personBId,
      created_at: new Date().toISOString(),
    }
    setPartnerships(prev => [...prev, temp])
    enqueue({ type: 'addPartnership', tempId, realId: newUuid(), personAId, personBId })
    return temp
  }, [enqueue])

  // ── removePartnership ───────────────────────────────────────
  const removePartnership = useCallback(async (id: string): Promise<boolean> => {
    setPartnerships(prev => prev.filter(p => p.id !== id))
    const queued = opsRef.current.find(op => op.type === 'addPartnership' && op.tempId === id)
    if (queued && !isInFlight(queued)) {
      // Never written — just cancel it.
      mutateOps(ops => ops.filter(op => op !== queued))
    } else {
      // Already written (or being written right now) — delete it. A temp id
      // here is remapped to the real one once that write resolves.
      enqueue({ type: 'removePartnership', id })
    }
    return true
  }, [enqueue, mutateOps, isInFlight])

  // ── addParentChild ──────────────────────────────────────────
  const addParentChild = useCallback(async (
    parentId: string,
    childId: string,
  ): Promise<ParentChildRow | null> => {
    const tempId = makeTempId()
    const temp: ParentChildRow = {
      id: tempId,
      parent_id: parentId,
      child_id: childId,
      created_at: new Date().toISOString(),
    }
    setParentChildRows(prev => [...prev, temp])
    enqueue({ type: 'addParentChild', tempId, realId: newUuid(), parentId, childId })
    return temp
  }, [enqueue])

  // ── removeParentChild ───────────────────────────────────────
  const removeParentChild = useCallback(async (id: string): Promise<boolean> => {
    setParentChildRows(prev => prev.filter(r => r.id !== id))
    const queued = opsRef.current.find(op => op.type === 'addParentChild' && op.tempId === id)
    if (queued && !isInFlight(queued)) {
      mutateOps(ops => ops.filter(op => op !== queued))
    } else {
      enqueue({ type: 'removeParentChild', id })
    }
    return true
  }, [enqueue, mutateOps, isInFlight])

  // ── updatePerson ────────────────────────────────────────────
  const updatePerson = useCallback(async (
    id: string,
    updates: UpdatePerson,
  ): Promise<boolean> => {
    setPeople(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
    mutateOps(prev => {
      // If this person hasn't been written yet, fold the edit into its insert.
      const addIdx = prev.findIndex(op =>
        op.type === 'addPerson' && op.tempId === id && !isInFlight(op))
      if (addIdx !== -1) {
        const ops = [...prev]
        const addOp = ops[addIdx] as Extract<PendingOp, { type: 'addPerson' }>
        ops[addIdx] = { ...addOp, data: { ...addOp.data, ...updates } }
        return ops
      }
      // Merge into an existing (not in-flight) update for this person.
      const updateIdx = prev.findIndex(op =>
        op.type === 'updatePerson' && op.id === id && !isInFlight(op))
      if (updateIdx !== -1) {
        const ops = [...prev]
        const updateOp = ops[updateIdx] as Extract<PendingOp, { type: 'updatePerson' }>
        ops[updateIdx] = { ...updateOp, updates: { ...updateOp.updates, ...updates } }
        return ops
      }
      return [...prev, { opId: newUuid(), type: 'updatePerson', id, updates }]
    })
    return true
  }, [mutateOps, isInFlight])

  // ── uploadPhoto — deferred, returns a blob URL for preview ──
  const uploadPhoto = useCallback(async (
    personId: string,
    file: File,
  ): Promise<string | null> => {
    const prev = pendingPhotos.current.get(personId)
    if (prev) URL.revokeObjectURL(prev.blobUrl)
    const blobUrl = URL.createObjectURL(file)
    pendingPhotos.current.set(personId, { file, blobUrl })
    return blobUrl
  }, [])

  // ── deletePerson ────────────────────────────────────────────
  const deletePerson = useCallback(async (id: string): Promise<boolean> => {
    setPeople(prev => prev.filter(p => p.id !== id))
    setPartnerships(prev => prev.filter(p => p.person_a_id !== id && p.person_b_id !== id))
    setParentChildRows(prev => prev.filter(r => r.parent_id !== id && r.child_id !== id))
    const photo = pendingPhotos.current.get(id)
    if (photo) { URL.revokeObjectURL(photo.blobUrl); pendingPhotos.current.delete(id) }

    const queuedInsert = opsRef.current.find(op => op.type === 'addPerson' && op.tempId === id)
    const neverWritten = !!queuedInsert && !isInFlight(queuedInsert)

    mutateOps(prev => {
      // Drop every not-yet-started op that involves this person…
      const filtered = prev.filter(op => {
        if (isInFlight(op)) return true
        if (op.type === 'addPerson' && op.tempId === id) return false
        if (op.type === 'addPartnership' && (op.personAId === id || op.personBId === id)) return false
        if (op.type === 'addParentChild' && (op.parentId === id || op.childId === id)) return false
        if (op.type === 'updatePerson' && op.id === id) return false
        if (op.type === 'uploadPhoto' && op.personId === id) return false
        return true
      })
      // …and, unless it was never written at all, delete the row too.
      return neverWritten ? filtered : [...filtered, { opId: newUuid(), type: 'deletePerson', id }]
    })
    return true
  }, [mutateOps, isInFlight])

  // ── hasConnections helper ───────────────────────────────────
  const hasConnections = useCallback((
    personId: string,
    ps: { person_a_id: string; person_b_id: string }[],
    pc: { parent_id: string; child_id: string }[],
  ): boolean => {
    return ps.some(p => p.person_a_id === personId || p.person_b_id === personId)
      || pc.some(r => r.parent_id === personId || r.child_id === personId)
  }, [])

  // ── Rewrite local state once a temp row has a real one ──────
  const applyIdMapping = useCallback((tempId: string, realId: string) => {
    const m = (id: string) => (id === tempId ? realId : id)
    setRoots(prev => prev.map(r => (r.id === tempId ? { ...r, id: realId } : r)))
    setPeople(prev => prev.map(p => ({
      ...p,
      id: m(p.id),
      root_id: m(p.root_id),
      mother_id: p.mother_id ? m(p.mother_id) : p.mother_id,
      original_person_id: p.original_person_id ? m(p.original_person_id) : p.original_person_id,
    })))
    setPartnerships(prev => prev.map(p => ({
      ...p, id: m(p.id), person_a_id: m(p.person_a_id), person_b_id: m(p.person_b_id),
    })))
    setParentChildRows(prev => prev.map(r => ({
      ...r, id: m(r.id), parent_id: m(r.parent_id), child_id: m(r.child_id),
    })))
    const photo = pendingPhotos.current.get(tempId)
    if (photo) {
      pendingPhotos.current.delete(tempId)
      pendingPhotos.current.set(realId, photo)
    }
  }, [])

  /** Maps a temp id to its real id once it has been saved (identity otherwise). */
  const resolveId = useCallback((id: string) => idMapRef.current.get(id) ?? id, [])

  // ── saveChanges — flush pending ops to Supabase ─────────────
  const saveChanges = useCallback(async (): Promise<boolean> => {
    // Guards against a double click firing two concurrent saves — React
    // state (isSaving) doesn't update fast enough to stop the second one.
    if (savingRef.current) return false
    savingRef.current = true
    setIsSaving(true)
    setSaveError(null)

    try {
      await runSaveQueue({
        client: supabase,
        queue: opsRef,
        idMap: idMapRef.current,
        getPhoto: id => pendingPhotos.current.get(id)?.file,
        onQueueChange: () => setOpCount(opsRef.current.length),
        onResolved: applyIdMapping,
        onPhotoUploaded: (personId, url) => {
          const entry = pendingPhotos.current.get(personId)
          if (entry) { URL.revokeObjectURL(entry.blobUrl); pendingPhotos.current.delete(personId) }
          setPeople(prev => prev.map(p => (p.id === personId ? { ...p, photo_url: url } : p)))
        },
      })
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      savingRef.current = false
      setIsSaving(false)
      setOpCount(opsRef.current.length)
    }
  }, [supabase, applyIdMapping])

  return {
    roots, people, partnerships, parentChildRows,
    addRoot, addPerson, addPartnership, removePartnership, addParentChild, removeParentChild,
    updatePerson, uploadPhoto, deletePerson, hasConnections,
    saveChanges,
    resolveId,
    isSaving,
    saveError,
    hasPendingChanges: opCount > 0,
  }
}

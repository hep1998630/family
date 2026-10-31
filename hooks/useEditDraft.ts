'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { newUuid, runSaveQueue, type NewPendingOp, type PendingOp } from '@/lib/draft/saveQueue'
import { deletePersonOps, removeLinkOps } from '@/lib/draft/draftOps'
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

  // The latest state, for callbacks that need it without re-creating.
  const stateRef = useRef({ people, partnerships, parentChildRows })
  stateRef.current = { people, partnerships, parentChildRows }

  // Leaving the page (closing the tab, reloading) with unsaved changes
  // makes the browser ask first.
  useEffect(() => {
    if (opCount === 0) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [opCount])

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
    mutateOps(ops => removeLinkOps(ops, 'partnership', id, isInFlight))
    return true
  }, [mutateOps, isInFlight])

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
    mutateOps(ops => removeLinkOps(ops, 'parentChild', id, isInFlight))
    return true
  }, [mutateOps, isInFlight])

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
    // What the draft shows now — put back if the database refuses the delete.
    const person = stateRef.current.people.find(p => p.id === id)
    const undo = person && {
      person,
      partnerships: stateRef.current.partnerships.filter(p => p.person_a_id === id || p.person_b_id === id),
      parentChild: stateRef.current.parentChildRows.filter(r => r.parent_id === id || r.child_id === id),
    }
    setPeople(prev => prev.filter(p => p.id !== id))
    setPartnerships(prev => prev.filter(p => p.person_a_id !== id && p.person_b_id !== id))
    setParentChildRows(prev => prev.filter(r => r.parent_id !== id && r.child_id !== id))
    const photo = pendingPhotos.current.get(id)
    if (photo) { URL.revokeObjectURL(photo.blobUrl); pendingPhotos.current.delete(id) }
    mutateOps(prev => deletePersonOps(prev, id, isInFlight, undo))
    return true
  }, [mutateOps, isInFlight])

  /**
   * After a failed save whose next step is deleting a person: give up on
   * that delete and show the person again, so the rest can be saved.
   */
  const undoFailedDelete = useCallback(() => {
    const head = opsRef.current[0]
    if (savingRef.current || head?.type !== 'deletePerson') return
    mutateOps(ops => ops.slice(1))
    const undo = head.undo
    if (undo) {
      const r = (rowId: string) => idMapRef.current.get(rowId) ?? rowId
      const person = { ...undo.person, id: r(undo.person.id) }
      setPeople(prev => prev.some(p => p.id === person.id) ? prev : [...prev, person])
      setPartnerships(prev => [...prev, ...undo.partnerships
        .map(p => ({ ...p, id: r(p.id), person_a_id: r(p.person_a_id), person_b_id: r(p.person_b_id) }))
        .filter(p => !prev.some(x => x.id === p.id))])
      setParentChildRows(prev => [...prev, ...undo.parentChild
        .map(x => ({ ...x, id: r(x.id), parent_id: r(x.parent_id), child_id: r(x.child_id) }))
        .filter(x => !prev.some(y => y.id === x.id))])
    }
    setSaveError(null)
  }, [mutateOps])

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

  /** True while a person or partnership added in the draft hasn't reached the database yet. */
  const isUnsaved = useCallback((id: string) => opsRef.current.some(op =>
    (op.type === 'addPerson' || op.type === 'addPartnership') && (op.tempId === id || op.realId === id)
  ), [])

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
    isUnsaved,
    isSaving,
    saveError,
    hasPendingChanges: opCount > 0,
    /** Set while a save failed on deleting this person — offer «إلغاء الحذف». */
    failedDeleteName: saveError && opsRef.current[0]?.type === 'deletePerson'
      ? ((opsRef.current[0] as Extract<PendingOp, { type: 'deletePerson' }>).undo?.person.name ?? '')
      : null,
    undoFailedDelete,
  }
}

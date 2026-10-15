'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Canvas from '@/components/canvas/Canvas'
import FamilyRoot from '@/components/tree/FamilyRoot'
import ProfilePopup from '@/components/popup/ProfilePopup'
import AddPersonModal from '@/components/edit/AddPersonModal'
import AddRootModal from '@/components/edit/AddRootModal'
import EditToolbar from '@/components/edit/EditToolbar'
import PeopleListPanel from '@/components/edit/PeopleListPanel'
import { useRoots } from '@/hooks/useRoots'
import { usePeople } from '@/hooks/usePeople'
import { usePartnerships } from '@/hooks/usePartnerships'
import { useParentChild } from '@/hooks/useParentChild'
import { useEditDraft } from '@/hooks/useEditDraft'
import { useTreeLayout } from '@/hooks/useTreeLayout'
import { useCanvas } from '@/hooks/useCanvas'
import { NODE_WIDTH, NODE_HEIGHT } from '@/lib/tree/layout'
import type { PersonRow, PartnershipRow, ParentChildRow, RootRow } from '@/lib/supabase/types'
import type { PersonFormValues } from '@/types'

// ── How far apart to auto-place new roots ────────────────────
const ROOT_SPAWN_OFFSET_X = 900

interface TreeLayoutProps {
  isEditable: boolean
  isOwner?: boolean
  adminName?: string
  initialPeople: PersonRow[]
  initialRoots: RootRow[]
  initialPartnerships: PartnershipRow[]
  initialParentChild: ParentChildRow[]
}

// ── Modal state shape ────────────────────────────────────────
type ModalState =
  | { type: 'none' }
  | { type: 'addPartner'; personId: string; personName: string }
  | { type: 'addChild'; personId: string; personName: string }
  | { type: 'addRoot' }

export default function TreeLayout({
  isEditable,
  isOwner = false,
  adminName,
  initialPeople,
  initialRoots,
  initialPartnerships,
  initialParentChild,
}: TreeLayoutProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  // ── Data hooks — all called unconditionally (rules of hooks) ─
  // Live hooks (view mode): maintain real-time subscriptions
  const liveRoots = useRoots(initialRoots)
  const livePeople = usePeople(initialPeople)
  const livePartnerships = usePartnerships(initialPartnerships)
  const liveParentChild = useParentChild(initialParentChild)
  // Draft hook (edit mode): local-only state, deferred DB writes
  const draft = useEditDraft(initialRoots, initialPeople, initialPartnerships, initialParentChild)

  // Select the active data source based on mode
  const roots           = isEditable ? draft.roots           : liveRoots.roots
  const people          = isEditable ? draft.people          : livePeople.people
  const partnerships    = isEditable ? draft.partnerships    : livePartnerships.partnerships
  const parentChildRows = isEditable ? draft.parentChildRows : liveParentChild.parentChildRows
  const addRoot            = isEditable ? draft.addRoot            : liveRoots.addRoot
  const addPerson          = isEditable ? draft.addPerson          : livePeople.addPerson
  const addPartnership     = isEditable ? draft.addPartnership     : livePartnerships.addPartnership
  const removePartnership  = isEditable ? draft.removePartnership  : livePartnerships.removePartnership
  const addParentChild     = isEditable ? draft.addParentChild     : liveParentChild.addParentChild
  const updatePerson    = isEditable ? draft.updatePerson    : livePeople.updatePerson
  const deletePerson    = isEditable ? draft.deletePerson    : livePeople.deletePerson
  const uploadPhoto     = isEditable ? draft.uploadPhoto     : livePeople.uploadPhoto
  const hasConnections  = isEditable ? draft.hasConnections  : livePeople.hasConnections

  // ── Layout engine ───────────────────────────────────────────
  const { layoutedRoots, shortcutTargetMap, allPositionedPeople } = useTreeLayout(
    roots, people, partnerships, parentChildRows
  )

  // ── Canvas ──────────────────────────────────────────────────
  const canvas = useCanvas()
  const { panTo } = canvas

  // Track actual viewport dimensions so panTo works correctly on all screen sizes
  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  })
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // ── UI state ────────────────────────────────────────────────
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [highlightedPersonId, setHighlightedPersonId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const popupOpen = selectedPersonId !== null

  // ── Person click / popup close ───────────────────────────────
  const handleActivateNode = useCallback((id: string) => setActiveNodeId(id), [])
  const handleClickPerson = useCallback((id: string) => {
    setActiveNodeId(null)
    setSelectedPersonId(id)
  }, [])
  const handleClosePopup = useCallback(() => setSelectedPersonId(null), [])

  // ── Click-away: deactivate active node ───────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-person-node]')) {
        setActiveNodeId(null)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // ── Update person (from ProfileEdit) ────────────────────────
  const handleUpdatePerson = useCallback(async (
    id: string,
    values: PersonFormValues,
    photoFile: File | null,
  ) => {
    let photoUrl = values.photo_url
    if (photoFile) {
      const uploaded = await uploadPhoto(id, photoFile)
      if (uploaded) photoUrl = uploaded
    }
    await updatePerson(id, {
      name: values.name,
      nickname: values.nickname || null,
      birth_date: values.birth_date || null,
      bio: values.bio || null,
      photo_url: photoUrl || null,
      mother_id: values.mother_id || null,
      gender: values.gender || null,
    })
  }, [updatePerson, uploadPhoto])

  // ── Delete person ───────────────────────────────────────────
  const handleDeletePerson = useCallback((id: string) => {
    deletePerson(id)
    if (selectedPersonId === id) setSelectedPersonId(null)
    if (activeNodeId === id) setActiveNodeId(null)
  }, [deletePerson, selectedPersonId, activeNodeId])

  // ── Open "Add Partner" modal ─────────────────────────────────
  const handleAddPartner = useCallback((personId: string) => {
    const person = people.find(p => p.id === personId)
    if (!person) return
    setModal({ type: 'addPartner', personId, personName: person.name })
  }, [people])

  // ── Open "Add Child" modal ───────────────────────────────────
  const handleAddChild = useCallback((personId: string) => {
    const person = people.find(p => p.id === personId)
    if (!person) return
    setModal({ type: 'addChild', personId, personName: person.name })
  }, [people])

  // ── Confirm add partner ──────────────────────────────────────
  const handleConfirmAddPartner = useCallback(async (values: PersonFormValues) => {
    if (modal.type !== 'addPartner') return
    const { personId } = modal

    // Find the root this person belongs to
    const person = people.find(p => p.id === personId)
    if (!person) return

    // Create the new partner person
    const newPartner = await addPerson({
      name: values.name,
      nickname: values.nickname || null,
      birth_date: values.birth_date || null,
      bio: values.bio || null,
      photo_url: null,
      mother_id: null,
      gender: values.gender || null,
      root_id: person.root_id,
      is_shortcut: false,
      original_person_id: null,
      canvas_x: 0,
      canvas_y: 0,
    })

    if (!newPartner) return

    // Link as partners
    await addPartnership(personId, newPartner.id)
    setModal({ type: 'none' })
  }, [modal, people, addPerson, addPartnership])

  // ── Link existing person as partner ──────────────────────────
  const handleLinkExistingPartner = useCallback(async (existingPersonId: string) => {
    if (modal.type !== 'addPartner') return
    await addPartnership(modal.personId, existingPersonId)
    setModal({ type: 'none' })
  }, [modal, addPartnership])

  // ── Confirm add child ────────────────────────────────────────
  const handleConfirmAddChild = useCallback(async (values: PersonFormValues) => {
    if (modal.type !== 'addChild') return
    const { personId } = modal

    const parent = people.find(p => p.id === personId)
    if (!parent) return

    const newChild = await addPerson({
      name: values.name,
      nickname: values.nickname || null,
      birth_date: values.birth_date || null,
      bio: values.bio || null,
      photo_url: null,
      // If added through the mother, record her as the mother
      mother_id: parent.gender === 'female' ? parent.id : null,
      gender: values.gender || null,
      root_id: parent.root_id,
      is_shortcut: false,
      original_person_id: null,
      canvas_x: 0,
      canvas_y: 0,
    })

    if (!newChild) return

    // Link as parent→child
    await addParentChild(personId, newChild.id)
    setModal({ type: 'none' })
  }, [modal, people, addPerson, addParentChild])

  // ── Confirm add root ─────────────────────────────────────────
  const handleConfirmAddRoot = useCallback(async (
    rootName: string,
    founderName: string,
  ) => {
    // Auto-place new root to the right of existing roots
    const maxX = roots.length > 0
      ? Math.max(...roots.map(r => r.canvas_x)) + ROOT_SPAWN_OFFSET_X
      : 100

    const newRoot = await addRoot(rootName)
    if (!newRoot) return

    // Create the founder person
    await addPerson({
      name: founderName,
      nickname: null,
      birth_date: null,
      bio: null,
      photo_url: null,
      mother_id: null,
      root_id: newRoot.id,
      is_shortcut: false,
      original_person_id: null,
      canvas_x: maxX,
      canvas_y: 100,
    })

    setModal({ type: 'none' })

    // Pan to the center of the new root node
    setTimeout(() => {
      panTo(maxX + NODE_WIDTH / 2, 100 + NODE_HEIGHT / 2, viewport.width, viewport.height, true)
    }, 300)
  }, [roots, addRoot, addPerson, panTo, viewport])

  // ── Shared: pan + delayed highlight ─────────────────────────
  const panAndHighlight = useCallback((x: number, y: number, id: string) => {
    // Pan to the center of the node, not its top-left corner
    panTo(x + NODE_WIDTH / 2, y + NODE_HEIGHT / 2, viewport.width, viewport.height, true)
    if (highlightDelayRef.current) clearTimeout(highlightDelayRef.current)
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    setHighlightedPersonId(null)
    // Delay so the glow starts after the 600ms pan animation finishes
    highlightDelayRef.current = setTimeout(() => {
      setHighlightedPersonId(id)
      highlightTimerRef.current = setTimeout(() => setHighlightedPersonId(null), 2000)
    }, 650)
  }, [panTo, viewport])

  // ── Shortcut navigation ──────────────────────────────────────
  const handleNavigateToOriginal = useCallback((originalPersonId: string) => {
    const target = shortcutTargetMap.get(originalPersonId)
      ?? [...shortcutTargetMap.values()].find(v => v.originalPersonId === originalPersonId)
    if (!target) return
    panAndHighlight(target.x, target.y, originalPersonId)
  }, [shortcutTargetMap, panAndHighlight])

  // ── Remove partner (from reference node) ─────────────────────
  const handleRemovePartner = useCallback(async (ownerPersonId: string, refPersonId: string) => {
    const partnership = partnerships.find(p =>
      (p.person_a_id === ownerPersonId && p.person_b_id === refPersonId) ||
      (p.person_b_id === ownerPersonId && p.person_a_id === refPersonId)
    )
    if (!partnership) return
    await removePartnership(partnership.id)
  }, [partnerships, removePartnership])

  const handleCloseModal = useCallback(() => setModal({ type: 'none' }), [])

  // ── Enrich positioned people with root_name for search ──────
  const searchablePeople = allPositionedPeople.map(p => ({
    ...p,
    root_name: roots.find(r => r.id === p.root_id)?.name ?? undefined,
  }))

  // ── Search select: pan canvas to the person's position ───────
  const handleSearchSelect = useCallback((x: number, y: number, id: string) => {
    panAndHighlight(x, y, id)
  }, [panAndHighlight])

  return (
    <>
      <Canvas
        canvas={canvas}
        isEditable={isEditable}
        people={searchablePeople}
        roots={roots}
        partnerships={partnerships}
        parentChildRows={parentChildRows}
        onSearchSelect={handleSearchSelect}
        overlay={isEditable ? (
          <>
            <EditToolbar
              onAddRoot={() => setModal({ type: 'addRoot' })}
              hasPendingChanges={draft.hasPendingChanges}
              isSaving={draft.isSaving}
              saveError={draft.saveError}
              onSave={draft.saveChanges}
              adminName={adminName}
            />
            <PeopleListPanel
              people={searchablePeople}
              parentChildRows={parentChildRows}
              onNavigate={handleSearchSelect}
              onDelete={handleDeletePerson}
              isOwner={isOwner}
            />
          </>
        ) : undefined}
      >
        {layoutedRoots.map(lr => (
          <FamilyRoot
            key={lr.root.id}
            layoutedRoot={lr}
            isEditable={isEditable}
            highlightedPersonId={highlightedPersonId}
            activeNodeId={activeNodeId}
            onClickPerson={handleClickPerson}
            onActivateNode={handleActivateNode}
            onAddPartner={handleAddPartner}
            onAddChild={handleAddChild}
            onNavigateToOriginal={handleNavigateToOriginal}
            onRemovePartner={handleRemovePartner}
          />
        ))}
      </Canvas>

      {/* ── Profile popup ── */}
      <ProfilePopup
        personId={selectedPersonId}
        isOpen={popupOpen}
        isEditable={isEditable}
        isOwner={isOwner}
        onClose={handleClosePopup}
        people={people}
        partnerships={partnerships}
        parentChildRows={parentChildRows}
        onUpdatePerson={handleUpdatePerson}
        onDeletePerson={handleDeletePerson}
      />

      {/* ── Add Partner modal ── */}
      <AddPersonModal
        isOpen={modal.type === 'addPartner'}
        mode="partner"
        relativeName={modal.type === 'addPartner' ? modal.personName : ''}
        currentPerson={modal.type === 'addPartner' ? (people.find(p => p.id === modal.personId) ?? null) : null}
        allPeople={people}
        existingPartnerIds={modal.type === 'addPartner'
          ? partnerships
              .filter(p => p.person_a_id === modal.personId || p.person_b_id === modal.personId)
              .map(p => p.person_a_id === modal.personId ? p.person_b_id : p.person_a_id)
          : []
        }
        roots={roots}
        onLinkExisting={handleLinkExistingPartner}
        onConfirm={handleConfirmAddPartner}
        onCancel={handleCloseModal}
      />

      {/* ── Add Child modal ── */}
      <AddPersonModal
        isOpen={modal.type === 'addChild'}
        mode="child"
        relativeName={modal.type === 'addChild' ? modal.personName : ''}
        onConfirm={handleConfirmAddChild}
        onCancel={handleCloseModal}
      />

      {/* ── Add Root modal ── */}
      <AddRootModal
        isOpen={modal.type === 'addRoot'}
        onConfirm={handleConfirmAddRoot}
        onCancel={handleCloseModal}
      />
    </>
  )
}
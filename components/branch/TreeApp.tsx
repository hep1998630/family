'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import FamilyRoot from '@/components/tree/FamilyRoot'
import BranchPicker from '@/components/branch/BranchPicker'
import SearchBar from '@/components/branch/SearchBar'
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
import { computeLayout, computeDepthFromRoot } from '@/lib/tree/layout'
import type { PersonRow, PartnershipRow, ParentChildRow, RootRow } from '@/lib/supabase/types'
import type { PersonFormValues } from '@/types'

const DEFAULT_MAX_DEPTH = 3
const EXPAND_INCREMENT = 2

interface TreeAppProps {
  isEditable: boolean
  isOwner?: boolean
  adminName?: string
  initialPeople: PersonRow[]
  initialRoots: RootRow[]
  initialPartnerships: PartnershipRow[]
  initialParentChild: ParentChildRow[]
  initialRootId?: string | null
  initialFocusId?: string | null
}

type ModalState =
  | { type: 'none' }
  | { type: 'addPartner'; personId: string; personName: string }
  | { type: 'addChild'; personId: string; personName: string }
  | { type: 'addRoot' }

export default function TreeApp({
  isEditable,
  isOwner = false,
  adminName,
  initialPeople,
  initialRoots,
  initialPartnerships,
  initialParentChild,
  initialRootId = null,
  initialFocusId = null,
}: TreeAppProps) {
  const router = useRouter()
  const pathname = usePathname()

  // ── Data hooks — all called unconditionally (rules of hooks) ─
  const liveRoots = useRoots(initialRoots)
  const livePeople = usePeople(initialPeople)
  const livePartnerships = usePartnerships(initialPartnerships)
  const liveParentChild = useParentChild(initialParentChild)
  const draft = useEditDraft(initialRoots, initialPeople, initialPartnerships, initialParentChild)

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

  // ── Lookup maps ───────────────────────────────────────────────
  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const rootNamesById = useMemo(() => new Map(roots.map(r => [r.id, r.name])), [roots])

  // ── Branch selection + URL sync ───────────────────────────────
  const [selectedRootId, setSelectedRootIdState] = useState<string | null>(initialRootId)
  const [maxDepth, setMaxDepth] = useState(DEFAULT_MAX_DEPTH)
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(initialFocusId)

  const setSelectedRootId = useCallback((rootId: string | null) => {
    setSelectedRootIdState(rootId)
    const query = rootId ? `?root=${rootId}` : ''
    router.replace(`${pathname}${query}`, { scroll: false })
  }, [router, pathname])

  const selectBranch = useCallback((rootId: string) => {
    setMaxDepth(DEFAULT_MAX_DEPTH)
    setSelectedRootId(rootId)
  }, [setSelectedRootId])

  const backToBranches = useCallback(() => {
    setSelectedRootId(null)
  }, [setSelectedRootId])

  /** Switches to a person's real branch (if needed), ensures maxDepth reaches
   *  them, then scrolls to and highlights their node — used by both search
   *  and reference/shortcut "navigate to original" clicks. */
  const navigateToPerson = useCallback((personId: string) => {
    const person = peopleById.get(personId)
    if (!person) return
    const neededDepth = computeDepthFromRoot(personId, parentChildRows) + 1
    setMaxDepth(Math.max(DEFAULT_MAX_DEPTH, neededDepth))
    if (person.root_id !== selectedRootId) setSelectedRootId(person.root_id)
    setPendingFocusId(personId)
  }, [peopleById, parentChildRows, selectedRootId, setSelectedRootId])

  // ── Layout for the selected branch only ──────────────────────
  const selectedRoot = useMemo(
    () => (selectedRootId ? roots.find(r => r.id === selectedRootId) ?? null : null),
    [roots, selectedRootId]
  )

  const layoutedRoot = useMemo(() => {
    if (!selectedRoot) return null
    const [lr] = computeLayout([selectedRoot], people, partnerships, parentChildRows, maxDepth)
    return lr ?? null
  }, [selectedRoot, people, partnerships, parentChildRows, maxDepth])

  // ── Scroll-to-and-highlight once the focus target is in the DOM ──
  const [highlightedPersonId, setHighlightedPersonId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!pendingFocusId) return
    const el = document.getElementById(`person-${pendingFocusId}`)
    if (!el) return // not mounted yet — effect re-runs when layoutedRoot updates
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    const focusedId = pendingFocusId
    const t = setTimeout(() => {
      setHighlightedPersonId(focusedId)
      highlightTimerRef.current = setTimeout(() => setHighlightedPersonId(null), 2000)
    }, 400)
    setPendingFocusId(null)
    return () => clearTimeout(t)
  }, [pendingFocusId, layoutedRoot])

  // ── UI state ──────────────────────────────────────────────────
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const popupOpen = selectedPersonId !== null

  const handleActivateNode = useCallback((id: string) => setActiveNodeId(id), [])
  const handleClickPerson = useCallback((id: string) => {
    setActiveNodeId(null)
    setSelectedPersonId(id)
  }, [])
  const handleClosePopup = useCallback(() => setSelectedPersonId(null), [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-person-node]')) {
        setActiveNodeId(null)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

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

  const handleDeletePerson = useCallback((id: string) => {
    deletePerson(id)
    if (selectedPersonId === id) setSelectedPersonId(null)
    if (activeNodeId === id) setActiveNodeId(null)
  }, [deletePerson, selectedPersonId, activeNodeId])

  const handleAddPartner = useCallback((personId: string) => {
    const person = people.find(p => p.id === personId)
    if (!person) return
    setModal({ type: 'addPartner', personId, personName: person.name })
  }, [people])

  const handleAddChild = useCallback((personId: string) => {
    const person = people.find(p => p.id === personId)
    if (!person) return
    setModal({ type: 'addChild', personId, personName: person.name })
  }, [people])

  const handleConfirmAddPartner = useCallback(async (values: PersonFormValues) => {
    if (modal.type !== 'addPartner') return
    const { personId } = modal

    const person = people.find(p => p.id === personId)
    if (!person) return

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
    })

    if (!newPartner) return

    await addPartnership(personId, newPartner.id)
    setModal({ type: 'none' })
  }, [modal, people, addPerson, addPartnership])

  const handleLinkExistingPartner = useCallback(async (existingPersonId: string) => {
    if (modal.type !== 'addPartner') return
    await addPartnership(modal.personId, existingPersonId)
    setModal({ type: 'none' })
  }, [modal, addPartnership])

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
      mother_id: parent.gender === 'female' ? parent.id : null,
      gender: values.gender || null,
      root_id: parent.root_id,
      is_shortcut: false,
      original_person_id: null,
    })

    if (!newChild) return

    await addParentChild(personId, newChild.id)
    setModal({ type: 'none' })
  }, [modal, people, addPerson, addParentChild])

  const handleConfirmAddRoot = useCallback(async (
    rootName: string,
    founderName: string,
  ) => {
    const newRoot = await addRoot(rootName)
    if (!newRoot) return

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
    })

    setModal({ type: 'none' })
    selectBranch(newRoot.id)
  }, [addRoot, addPerson, selectBranch])

  const handleRemovePartner = useCallback(async (ownerPersonId: string, refPersonId: string) => {
    const partnership = partnerships.find(p =>
      (p.person_a_id === ownerPersonId && p.person_b_id === refPersonId) ||
      (p.person_b_id === ownerPersonId && p.person_a_id === refPersonId)
    )
    if (!partnership) return
    await removePartnership(partnership.id)
  }, [partnerships, removePartnership])

  const handleCloseModal = useCallback(() => setModal({ type: 'none' }), [])

  const handleExpand = useCallback(() => {
    setMaxDepth(d => d + EXPAND_INCREMENT)
  }, [])

  // ── People search index, enriched with root name ────────────
  const searchablePeople = useMemo(() => people
    .filter(p => !p.is_shortcut)
    .map(p => ({ ...p, root_name: rootNamesById.get(p.root_id) })),
    [people, rootNamesById]
  )

  return (
    <>
      {!isEditable && (
        <SearchBar people={searchablePeople} onSelectPerson={navigateToPerson} />
      )}

      {isEditable && (
        <>
          <EditToolbar
            hasPendingChanges={draft.hasPendingChanges}
            isSaving={draft.isSaving}
            saveError={draft.saveError}
            onSave={draft.saveChanges}
            adminName={adminName}
          />
          <PeopleListPanel
            people={searchablePeople}
            parentChildRows={parentChildRows}
            onNavigate={navigateToPerson}
            onDelete={handleDeletePerson}
            isOwner={isOwner}
          />
        </>
      )}

      {!selectedRoot ? (
        <BranchPicker
          roots={roots}
          people={people}
          parentChildRows={parentChildRows}
          isEditable={isEditable}
          onSelect={selectBranch}
          onAddRoot={() => setModal({ type: 'addRoot' })}
        />
      ) : (
        <div className="fixed inset-0 flex flex-col">
          {/* ── Branch header ── */}
          <div className="flex-shrink-0 flex items-center gap-3 px-5 py-4 bg-white border-b-2 border-slate-200 z-10">
            <button
              onClick={backToBranches}
              className="
                flex items-center gap-2 px-4 py-2.5 rounded-xl
                text-walnut hover:bg-parchment
                font-sans text-base font-semibold
                transition-colors duration-150
              "
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M9.5 3L4 8l5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              فروع العائلة
            </button>
            <span className="font-sans text-xl font-bold text-charcoal">
              {selectedRoot.name}
            </span>
          </div>

          {/* ── Scrollable tree ── */}
          <div className="branch-scroll flex-1">
            {layoutedRoot ? (
              <div
                className="relative"
                style={{
                  width: Math.max(...layoutedRoot.allNodes.map(n => n.x + 160)) + 100,
                  height: Math.max(...layoutedRoot.allNodes.map(n => n.y + 80)) + 180,
                }}
              >
                <FamilyRoot
                  layoutedRoot={layoutedRoot}
                  isEditable={isEditable}
                  highlightedPersonId={highlightedPersonId}
                  activeNodeId={activeNodeId}
                  peopleById={peopleById}
                  rootNamesById={rootNamesById}
                  onClickPerson={handleClickPerson}
                  onActivateNode={handleActivateNode}
                  onAddPartner={handleAddPartner}
                  onAddChild={handleAddChild}
                  onNavigateToOriginal={navigateToPerson}
                  onRemovePartner={handleRemovePartner}
                  onExpand={handleExpand}
                />
              </div>
            ) : (
              <p className="font-sans text-lg text-walnut-light text-center py-16">
                هذا الفرع فارغ.
              </p>
            )}
          </div>
        </div>
      )}

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

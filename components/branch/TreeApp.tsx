'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import FamilyRoot from '@/components/tree/FamilyRoot'
import BranchPicker from '@/components/branch/BranchPicker'
import SearchBar from '@/components/branch/SearchBar'
import ProfilePopup from '@/components/popup/ProfilePopup'
import AddPersonModal from '@/components/edit/AddPersonModal'
import AddRootModal from '@/components/edit/AddRootModal'
import EditToolbar, { SaveErrorBanner } from '@/components/edit/EditToolbar'
import FamilyView from '@/components/family/FamilyView'
import ZoomableTree from '@/components/tree/ZoomableTree'
import SavedViewCards from '@/components/views/SavedViewCards'
import SavedViewPanel from '@/components/views/SavedViewPanel'
import PeopleListPanel from '@/components/edit/PeopleListPanel'
import { AskGenderModal, NeedPartnerModal } from '@/components/edit/StepModals'
import { useRoots } from '@/hooks/useRoots'
import { usePeople } from '@/hooks/usePeople'
import { usePartnerships } from '@/hooks/usePartnerships'
import { useParentChild } from '@/hooks/useParentChild'
import { useEditDraft } from '@/hooks/useEditDraft'
import { computeLayout, computeDepthFromRoot, computeViewLayout, findRootPerson } from '@/lib/tree/layout'
import { buildLineage, closeFamilyIds, partnersOf } from '@/lib/tree/lineage'
import { sortViews } from '@/lib/views'
import type { PersonRow, PartnershipRow, ParentChildRow, RootRow, SavedViewRow } from '@/lib/supabase/types'
import type { PersonFormValues } from '@/types'

const DEFAULT_MAX_DEPTH = 3
const EXPAND_INCREMENT = 2
/** Below this width the family view is the default. */
const PHONE_QUERY = '(max-width: 767px)'
const VIEW_STORAGE_KEY = 'family-tree:view'

/** 'views' = the admins' saved views («العروض»); never remembered as the default. */
type ViewMode = 'family' | 'tree' | 'views'
type DefaultViewMode = Exclude<ViewMode, 'views'>

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
  initialSavedViews?: SavedViewRow[]
  /** Open this saved view (from /view?view=<id>). */
  initialViewId?: string | null
}

type ModalState =
  | { type: 'none' }
  | { type: 'addPartner'; personId: string }
  | { type: 'addChild'; personId: string }
  | { type: 'needPartner'; personId: string }
  | { type: 'askGender'; personId: string; next: 'addPartner' | 'addChild' }
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
  initialSavedViews = [],
  initialViewId = null,
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
  const removeParentChild  = isEditable ? draft.removeParentChild  : liveParentChild.removeParentChild
  const updatePerson    = isEditable ? draft.updatePerson    : livePeople.updatePerson
  const deletePerson    = isEditable ? draft.deletePerson    : livePeople.deletePerson
  const uploadPhoto     = isEditable ? draft.uploadPhoto     : livePeople.uploadPhoto

  // ── Lookup maps ───────────────────────────────────────────────
  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const rootNamesById = useMemo(() => new Map(roots.map(r => [r.id, r.name])), [roots])
  // «name fatherName» labels for titles and pickers (see lib/tree/lineage.ts).
  const lineage = useMemo(() => buildLineage(people, parentChildRows), [people, parentChildRows])

  // ── Branch selection + URL sync ───────────────────────────────
  const [selectedRootId, setSelectedRootIdState] = useState<string | null>(() => {
    if (initialRootId || !initialViewId) return initialRootId
    // A shared view link opens inside the top person's branch.
    const view = initialSavedViews.find(v => v.id === initialViewId)
    return initialPeople.find(p => p.id === view?.top_person_id)?.root_id ?? null
  })
  const [maxDepth, setMaxDepth] = useState(DEFAULT_MAX_DEPTH)
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(initialFocusId)
  // Family view focus stack; empty means the branch founder.
  const [familyHistory, setFamilyHistory] = useState<string[]>(initialFocusId ? [initialFocusId] : [])

  const setSelectedRootId = useCallback((rootId: string | null) => {
    setSelectedRootIdState(rootId)
    const query = rootId ? `?root=${rootId}` : ''
    router.replace(`${pathname}${query}`, { scroll: false })
  }, [router, pathname])

  const selectBranch = useCallback((rootId: string) => {
    setMaxDepth(DEFAULT_MAX_DEPTH)
    setFamilyHistory([]) // a branch opens at its founder
    setSelectedRootId(rootId)
  }, [setSelectedRootId])

  const backToBranches = useCallback(() => {
    setActiveViewId(null)
    if (viewModeRef.current === 'views') setViewModeState(defaultModeRef.current)
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
    if (viewModeRef.current === 'views') {
      // Searching or following a link from a saved view opens the full tree / family view.
      setActiveViewId(null)
      setViewModeState(defaultModeRef.current)
      setSelectedRootId(person.root_id)
    } else if (person.root_id !== effectiveRootIdRef.current) {
      setSelectedRootId(person.root_id)
    }
    setPendingFocusId(personId)
    focusFamilyRef.current(personId)
  }, [peopleById, parentChildRows, setSelectedRootId])

  // A family created in this session has a temp id until Save writes it;
  // resolve through the draft so the branch stays open after saving.
  const { resolveId } = draft
  const effectiveRootId = selectedRootId && isEditable ? resolveId(selectedRootId) : selectedRootId
  const effectiveRootIdRef = useRef(effectiveRootId)
  effectiveRootIdRef.current = effectiveRootId

  useEffect(() => {
    if (selectedRootId && effectiveRootId !== selectedRootId) setSelectedRootId(effectiveRootId)
  }, [selectedRootId, effectiveRootId, setSelectedRootId])

  // ── Layout for the selected branch only ──────────────────────
  const selectedRoot = useMemo(
    () => (effectiveRootId ? roots.find(r => r.id === effectiveRootId) ?? null : null),
    [roots, effectiveRootId]
  )

  const layoutedRoot = useMemo(() => {
    if (!selectedRoot) return null
    const [lr] = computeLayout([selectedRoot], people, partnerships, parentChildRows, maxDepth)
    return lr ?? null
  }, [selectedRoot, people, partnerships, parentChildRows, maxDepth])

  const founderId = useMemo(
    () => (effectiveRootId ? findRootPerson(effectiveRootId, people, parentChildRows)?.id ?? null : null),
    [effectiveRootId, people, parentChildRows]
  )

  // ── View mode: phone-first family view, or the full tree ─────
  // null until mounted, so the server render doesn't guess the screen size.
  const [viewMode, setViewModeState] = useState<ViewMode | null>(null)
  // The family/tree choice to return to when leaving the saved views.
  const defaultModeRef = useRef<DefaultViewMode>('tree')
  useEffect(() => {
    let saved: string | null = null
    try { saved = window.localStorage.getItem(VIEW_STORAGE_KEY) } catch { /* private mode */ }
    defaultModeRef.current = saved === 'family' || saved === 'tree'
      ? saved
      : window.matchMedia(PHONE_QUERY).matches ? 'family' : 'tree'
    setViewModeState(initialViewId ? 'views' : defaultModeRef.current)
  }, [initialViewId])

  // ── Saved views («العروض») ───────────────────────────────────
  const [savedViews] = useState(() => sortViews(initialSavedViews))
  const [activeViewId, setActiveViewId] = useState<string | null>(initialViewId)
  const activeView = activeViewId ? savedViews.find(v => v.id === activeViewId) ?? null : null

  const openView = useCallback((viewId: string) => {
    const view = savedViews.find(v => v.id === viewId)
    const top = view && peopleById.get(view.top_person_id)
    if (!view || !top) return
    setActiveViewId(viewId)
    setViewModeState('views')
    setSelectedRootIdState(top.root_id)
    router.replace(`${pathname}?view=${encodeURIComponent(viewId)}`, { scroll: false })
  }, [savedViews, peopleById, router, pathname])

  /** Leaves an open view (back to the list, or to another tab). */
  const closeView = useCallback(() => {
    setActiveViewId(null)
    setSelectedRootId(effectiveRootIdRef.current)
  }, [setSelectedRootId])

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode)
    if (mode !== 'views') {
      defaultModeRef.current = mode
      try { window.localStorage.setItem(VIEW_STORAGE_KEY, mode) } catch { /* private mode */ }
      if (activeViewId) closeView()
    }
  }, [activeViewId, closeView])
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode

  const viewLayout = useMemo(() => activeView
    ? computeViewLayout(activeView.top_person_id, roots, people, partnerships, parentChildRows, {
        maxDepth: activeView.depth,
        partnerFilterId: activeView.partner_id,
      })
    : null,
    [activeView, roots, people, partnerships, parentChildRows]
  )

  // ── Family view focus + back history ─────────────────────────
  const familyTop = familyHistory.length > 0 ? resolveId(familyHistory[familyHistory.length - 1]) : null
  // Fall back to the founder if the focused person was deleted.
  const familyFocusId = familyTop && peopleById.has(familyTop) ? familyTop : founderId
  const focusFamily = useCallback((personId: string) => {
    setFamilyHistory(h => (h[h.length - 1] === personId ? h : [...h, personId]))
  }, [])
  const focusFamilyRef = useRef(focusFamily)
  focusFamilyRef.current = focusFamily
  const familyBack = useCallback(() => setFamilyHistory(h => h.slice(0, -1)), [])

  // ── Scroll-to-and-highlight once the focus target is in the DOM ──
  const [highlightedPersonId, setHighlightedPersonId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!pendingFocusId || !viewMode) return
    // The family view moved its focus already (navigateToPerson).
    if (viewMode === 'family') { setPendingFocusId(null); return }
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
  }, [pendingFocusId, layoutedRoot, viewMode])

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

    // Make the parent_child rows match the chosen father and mother.
    const desired = [...new Set([values.father_id, values.mother_id].filter((x): x is string => !!x))]
    const current = parentChildRows.filter(r => r.child_id === id)
    for (const row of current) {
      if (!desired.includes(row.parent_id)) await removeParentChild(row.id)
    }
    for (const parentId of desired) {
      if (!current.some(r => r.parent_id === parentId)) await addParentChild(parentId, id)
    }
  }, [updatePerson, uploadPhoto, parentChildRows, removeParentChild, addParentChild])

  const handleDeletePerson = useCallback((id: string) => {
    deletePerson(id)
    if (selectedPersonId === id) setSelectedPersonId(null)
    if (activeNodeId === id) setActiveNodeId(null)
  }, [deletePerson, selectedPersonId, activeNodeId])

  // `gender` lets the ask-gender step continue before `people` re-renders.
  const handleAddPartner = useCallback((personId: string, gender?: 'male' | 'female') => {
    const person = peopleById.get(personId)
    if (!person) return
    if (!(gender ?? person.gender)) { setModal({ type: 'askGender', personId, next: 'addPartner' }); return }
    setModal({ type: 'addPartner', personId })
  }, [peopleById])

  const handleAddChild = useCallback((personId: string, gender?: 'male' | 'female') => {
    const person = peopleById.get(personId)
    if (!person) return
    if (!(gender ?? person.gender)) { setModal({ type: 'askGender', personId, next: 'addChild' }); return }
    // A child is always linked to both parents, so a partner must exist first.
    if (partnersOf(personId, partnerships, peopleById).length === 0) {
      setModal({ type: 'needPartner', personId })
      return
    }
    setModal({ type: 'addChild', personId })
  }, [peopleById, partnerships])

  const handlePickGender = useCallback(async (gender: 'male' | 'female') => {
    if (modal.type !== 'askGender') return
    const { personId, next } = modal
    await updatePerson(personId, { gender })
    if (next === 'addPartner') handleAddPartner(personId, gender)
    else handleAddChild(personId, gender)
  }, [modal, updatePerson, handleAddPartner, handleAddChild])

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
      // Always the opposite of the person they marry.
      gender: person.gender === 'male' ? 'female' : person.gender === 'female' ? 'male' : (values.gender || null),
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

    // The form asked for the other parent; link the child to both.
    const fatherId = parent.gender === 'female' ? values.father_id : parent.id
    const motherId = parent.gender === 'female' ? parent.id : values.mother_id

    const newChild = await addPerson({
      name: values.name,
      nickname: values.nickname || null,
      birth_date: values.birth_date || null,
      bio: values.bio || null,
      photo_url: null,
      mother_id: motherId,
      gender: values.gender || null,
      root_id: parent.root_id,
      is_shortcut: false,
      original_person_id: null,
    })

    if (!newChild) return

    for (const parentId of new Set([fatherId, motherId].filter((x): x is string => !!x))) {
      await addParentChild(parentId, newChild.id)
    }
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
  const modalPerson = 'personId' in modal ? peopleById.get(modal.personId) ?? null : null

  const handleExpand = useCallback(() => {
    setMaxDepth(d => d + EXPAND_INCREMENT)
  }, [])

  // ── People search index, enriched with root name ────────────
  const searchablePeople = useMemo(() => people
    .filter(p => !p.is_shortcut)
    .map(p => ({ ...p, root_name: rootNamesById.get(p.root_id) })),
    [people, rootNamesById]
  )

  const treeSize = layoutedRoot ? {
    width: Math.max(...layoutedRoot.allNodes.map(n => n.x + 160)) + 100,
    height: Math.max(...layoutedRoot.allNodes.map(n => n.y + 80)) + 180,
  } : null

  return (
    <>
      <div className="fixed inset-0 flex flex-col">
        {/* ── Top bar: fits a 360px phone (search gets its own row there) ── */}
        <header className="flex-shrink-0 bg-white border-b-2 border-slate-200 z-20 px-3 sm:px-5 py-2.5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {selectedRoot ? (
              <button
                onClick={backToBranches}
                aria-label="فروع العائلة"
                className="
                  flex-shrink-0 flex items-center gap-2 h-12 px-3 rounded-xl
                  text-walnut hover:bg-parchment
                  font-sans text-base font-semibold
                  transition-colors duration-150
                "
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M6.5 3L12 8l-5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">فروع العائلة</span>
              </button>
            ) : null}
            {/* In edit mode the controls fill this row on a phone, so the
                branch name moves down next to the view toggle. */}
            <h1 className={`flex-1 min-w-0 truncate font-sans text-xl font-bold text-charcoal ${isEditable ? 'invisible md:visible' : ''}`}>
              {selectedRoot ? selectedRoot.name : 'شجرة العائلة'}
            </h1>
            {!isEditable && (
              <SearchBar people={searchablePeople} onSelectPerson={navigateToPerson} className="hidden md:block w-80" />
            )}
            {isEditable && (
              <>
                <PeopleListPanel
                  people={searchablePeople}
                  parentChildRows={parentChildRows}
                  onNavigate={navigateToPerson}
                  onDelete={handleDeletePerson}
                  isOwner={isOwner}
                />
                <EditToolbar
                  hasPendingChanges={draft.hasPendingChanges}
                  isSaving={draft.isSaving}
                  onSave={draft.saveChanges}
                  adminName={adminName}
                />
              </>
            )}
          </div>

          {(selectedRoot || !isEditable) && (
            <div className={`flex flex-wrap items-center gap-2 min-w-0 ${selectedRoot ? '' : 'md:hidden'}`}>
              {selectedRoot && viewMode && (
                <ViewToggle value={viewMode} onChange={setViewMode} showViews={savedViews.length > 0} />
              )}
              {isEditable && selectedRoot && (
                <span className="md:hidden flex-1 min-w-0 truncate font-sans text-lg font-bold text-charcoal">
                  {selectedRoot.name}
                </span>
              )}
              {/* On a phone an open saved view needs the room more than search does. */}
              {!isEditable && !(viewMode === 'views' && activeView) && (
                <SearchBar people={searchablePeople} onSelectPerson={navigateToPerson} className="flex-1 min-w-[9rem] md:hidden" />
              )}
            </div>
          )}

          {draft.saveError && !draft.isSaving && <SaveErrorBanner saveError={draft.saveError} />}
        </header>

        {!selectedRoot ? (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <BranchPicker
              roots={roots}
              people={people}
              parentChildRows={parentChildRows}
              isEditable={isEditable}
              onSelect={selectBranch}
              onAddRoot={() => setModal({ type: 'addRoot' })}
            >
              {activeViewId && !activeView && (
                <p role="alert" className="font-sans text-lg text-walnut-light text-center mb-4">لم يعد هذا العرض متاحاً.</p>
              )}
              {savedViews.length > 0 && (
                <SavedViewCards views={savedViews} personFor={id => peopleById.get(id)} onSelect={openView} />
              )}
            </BranchPicker>
          </div>
        ) : !viewMode ? (
          <div className="flex-1" />
        ) : viewMode === 'views' ? (
          activeView ? (
            <SavedViewPanel
              view={activeView}
              viewLayout={viewLayout}
              isEditable={isEditable}
              peopleById={peopleById}
              rootNamesById={rootNamesById}
              lineage={lineage}
              highlightedPersonId={highlightedPersonId}
              activeNodeId={activeNodeId}
              onBackToList={closeView}
              onClickPerson={handleClickPerson}
              onActivateNode={handleActivateNode}
              onAddPartner={handleAddPartner}
              onAddChild={handleAddChild}
              onNavigateToOriginal={navigateToPerson}
              onRemovePartner={handleRemovePartner}
            />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-parchment">
              <div className="mx-auto w-full max-w-3xl px-4 py-6 flex flex-col gap-4">
                {activeViewId && (
                  <p role="alert" className="font-sans text-lg text-walnut-light text-center">لم يعد هذا العرض متاحاً.</p>
                )}
                {savedViews.length > 0 ? (
                  <SavedViewCards views={savedViews} personFor={id => peopleById.get(id)} onSelect={openView} />
                ) : (
                  <p className="font-sans text-lg text-walnut-light text-center py-10">لا توجد عروض بعد.</p>
                )}
              </div>
            </div>
          )
        ) : viewMode === 'family' ? (
          <div className="flex-1 min-h-0 bg-parchment">
            {familyFocusId ? (
              <FamilyView
                focusId={familyFocusId}
                founderId={founderId}
                canGoBack={familyHistory.length > 0}
                isEditable={isEditable}
                peopleById={peopleById}
                partnerships={partnerships}
                parentChildRows={parentChildRows}
                lineage={lineage}
                onFocus={focusFamily}
                onBack={familyBack}
                onOpenProfile={handleClickPerson}
                onAddChild={handleAddChild}
                onAddPartner={handleAddPartner}
              />
            ) : (
              <p className="font-sans text-lg text-walnut-light text-center py-16">هذا الفرع فارغ.</p>
            )}
          </div>
        ) : layoutedRoot && treeSize ? (
          <ZoomableTree
            width={treeSize.width}
            height={treeSize.height}
            centerOnId={layoutedRoot.rootNode.person.id}
            centerKey={layoutedRoot.root.id}
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
          </ZoomableTree>
        ) : (
          <p className="font-sans text-lg text-walnut-light text-center py-16">
            هذا الفرع فارغ.
          </p>
        )}
      </div>

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
        lineage={lineage}
        onUpdatePerson={handleUpdatePerson}
        onDeletePerson={handleDeletePerson}
      />

      {/* ── Add Partner modal ── */}
      <AddPersonModal
        isOpen={modal.type === 'addPartner'}
        mode="partner"
        relativeName={modalPerson ? lineage.label(modalPerson) : ''}
        currentPerson={modal.type === 'addPartner' ? modalPerson : null}
        labelFor={lineage.label}
        allPeople={people}
        excludedIds={modal.type === 'addPartner'
          ? [
              ...partnersOf(modal.personId, partnerships, peopleById).map(p => p.id),
              ...closeFamilyIds(modal.personId, parentChildRows),
            ]
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
        relativeName={modalPerson ? lineage.label(modalPerson) : ''}
        currentPerson={modal.type === 'addChild' ? modalPerson : null}
        labelFor={lineage.label}
        otherParent={modal.type === 'addChild' && modalPerson ? {
          role: modalPerson.gender === 'female' ? 'father' : 'mother',
          options: partnersOf(modalPerson.id, partnerships, peopleById),
        } : undefined}
        onConfirm={handleConfirmAddChild}
        onCancel={handleCloseModal}
      />

      <NeedPartnerModal
        isOpen={modal.type === 'needPartner'}
        personName={modalPerson ? lineage.label(modalPerson) : ''}
        onAddPartner={() => modalPerson && handleAddPartner(modalPerson.id)}
        onCancel={handleCloseModal}
      />

      <AskGenderModal
        isOpen={modal.type === 'askGender'}
        personName={modalPerson ? lineage.label(modalPerson) : ''}
        onPick={handlePickGender}
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

function ViewToggle({ value, onChange, showViews }: {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  showViews: boolean
}) {
  const options: { mode: ViewMode; label: string }[] = [
    { mode: 'family', label: 'العائلة' },
    { mode: 'tree', label: 'الشجرة' },
    ...(showViews ? [{ mode: 'views' as const, label: 'العروض' }] : []),
  ]
  return (
    <div role="group" aria-label="طريقة العرض" className="flex-shrink-0 flex p-1 gap-1 bg-parchment border-2 border-slate-200 rounded-xl">
      {options.map(o => (
        <button
          key={o.mode}
          onClick={() => onChange(o.mode)}
          aria-pressed={value === o.mode}
          className={`
            h-10 px-3 rounded-lg font-sans text-base font-bold whitespace-nowrap transition-colors duration-150
            ${value === o.mode ? 'bg-walnut text-white shadow-sm' : 'text-walnut-light hover:text-walnut'}
          `}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

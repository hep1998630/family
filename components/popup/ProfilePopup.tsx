'use client'

import { useCallback, useMemo } from 'react'
import Modal from '@/components/ui/Modal'
import ProfileView from '@/components/popup/ProfileView'
import ProfileEdit from '@/components/popup/ProfileEdit'
import type { PersonRow, PartnershipRow, ParentChildRow } from '@/lib/supabase/types'
import type { PersonFormValues } from '@/types'
import type { Lineage } from '@/lib/tree/lineage'

interface ProfilePopupProps {
  personId: string | null
  isOpen: boolean
  isEditable: boolean
  isOwner: boolean
  onClose: () => void

  // Data
  people: PersonRow[]
  partnerships: PartnershipRow[]
  parentChildRows: ParentChildRow[]
  lineage: Lineage

  // Mutations (from usePeople hook)
  onUpdatePerson: (id: string, values: PersonFormValues, photoFile: File | null) => Promise<void>
  onDeletePerson: (id: string) => void
}

export default function ProfilePopup({
  personId,
  isOpen,
  isEditable,
  isOwner,
  onClose,
  people,
  partnerships,
  parentChildRows,
  lineage,
  onUpdatePerson,
  onDeletePerson,
}: ProfilePopupProps) {
  const person = useMemo(
    () => people.find(p => p.id === personId) ?? null,
    [people, personId]
  )

  // ── Resolve relationships ────────────────────────────────────
  const { parentNames, childrenNames, motherName, hasConnections } = useMemo(() => {
    if (!person) return { parentNames: [], childrenNames: [], motherName: null, hasConnections: false }

    const peopleById = new Map(people.map(p => [p.id, p]))

    const parentIds = parentChildRows
      .filter(pc => pc.child_id === person.id)
      .map(pc => pc.parent_id)

    const childIds = parentChildRows
      .filter(pc => pc.parent_id === person.id)
      .map(pc => pc.child_id)

    const hasConnections = childIds.length > 0

    const parentNames   = parentIds.map(id => peopleById.get(id)?.name ?? 'Unknown')
    const childrenNames = childIds.map(id => peopleById.get(id)?.name ?? 'Unknown')
    // Now that children are linked to both parents, the mother is usually
    // already in the parents list — only show her separately if she isn't.
    const motherName    = person.mother_id && !parentIds.includes(person.mother_id)
      ? (peopleById.get(person.mother_id)?.name ?? null)
      : null

    return { parentNames, childrenNames, motherName, hasConnections }
  }, [person, people, partnerships, parentChildRows])

  // ── Handlers ────────────────────────────────────────────────
  const handleSave = useCallback(async (
    id: string,
    values: PersonFormValues,
    photoFile: File | null,
  ) => {
    await onUpdatePerson(id, values, photoFile)
    onClose()
  }, [onUpdatePerson, onClose])

  const handleDelete = useCallback((id: string) => {
    onDeletePerson(id)
    onClose()
  }, [onDeletePerson, onClose])

  if (!person) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">

      {/* ── Close button ── */}
      <button
        onClick={onClose}
        className="
          absolute top-4 right-4 z-10
          w-11 h-11 rounded-xl
          bg-white border-2 border-slate-200
          flex items-center justify-center
          text-walnut-light hover:text-charcoal hover:border-walnut
          transition-colors duration-150
          shadow-card
        "
        aria-label="إغلاق"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M2 2l12 12M14 2L2 14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* ── Shortcut badge ── */}
      {person.is_shortcut && (
        <div className="
          absolute top-4 left-4 z-10
          flex items-center gap-2 px-4 py-2.5
          bg-teal-50 border-2 border-teal-300 rounded-xl
          font-sans text-sm font-semibold text-teal-700
        ">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 6h10M7 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          مرتبط من عائلة أخرى
        </div>
      )}

      {/* ── Content: view or edit ── */}
      {isEditable ? (
        <ProfileEdit
          person={person}
          allPeople={people}
          partnerships={partnerships}
          onSave={handleSave}
          onCancel={onClose}
          onDelete={handleDelete}
          hasConnections={hasConnections}
          isOwner={isOwner}
          lineage={lineage}
        />
      ) : (
        <ProfileView
          person={person}
          parentNames={parentNames}
          childrenNames={childrenNames}
          motherName={motherName}
        />
      )}

    </Modal>
  )
}

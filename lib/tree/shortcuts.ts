// lib/tree/shortcuts.ts
//
// Shortcut nodes: when a person from another family is a partner in this
// family, they appear as a shortcut node with a distinct color. Clicking
// one navigates to the person's real branch (see components/branch/TreeApp.tsx's
// navigateToPerson) — no coordinates needed, just the target person's id.

import type { PersonRow } from '@/lib/supabase/types'

/**
 * When creating a cross-family partnership (cousin marriage scenario),
 * we create a shortcut node in the target family pointing to the original person.
 *
 * This helper returns the data needed to insert the shortcut person row.
 */
export function buildShortcutPersonData(
  originalPerson: PersonRow,
  targetRootId: string,
  placeholderX: number,
  placeholderY: number,
): Omit<PersonRow, 'id' | 'created_at' | 'updated_at'> {
  return {
    name: originalPerson.name,
    nickname: originalPerson.nickname,
    birth_date: originalPerson.birth_date,
    bio: originalPerson.bio,
    photo_url: originalPerson.photo_url,
    mother_id: null,      // shortcuts don't carry lineage
    root_id: targetRootId,
    is_shortcut: true,
    original_person_id: originalPerson.id,
    gender: originalPerson.gender,
    canvas_x: placeholderX,
    canvas_y: placeholderY,
  }
}

/**
 * Checks whether two people are already linked via a shortcut
 * (either direction) to avoid creating duplicate shortcuts.
 */
export function shortcutAlreadyExists(
  personAId: string,
  personBId: string,
  allPeople: PersonRow[],
): boolean {
  return allPeople.some(
    p =>
      p.is_shortcut &&
      (
        (p.id === personAId && p.original_person_id === personBId) ||
        (p.id === personBId && p.original_person_id === personAId) ||
        p.original_person_id === personAId ||
        p.original_person_id === personBId
      )
  )
}
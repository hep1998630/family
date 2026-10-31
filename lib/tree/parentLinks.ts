// lib/tree/parentLinks.ts
//
// What saving a profile's «الأب» / «الأم» fields does to the parent_child
// rows: only a parent the form deliberately changed is touched.
//
// The form shows the father and mother it could recognise (by gender, or
// mother_id). A parent it couldn't place — gender not set, or a third
// parent row — never appears in it, so it must never be removed because
// of it: editing only someone's bio must leave every link as it was.

import type { ParentChildRow, PersonRow } from '@/lib/supabase/types'

export interface ParentChoice {
  fatherId: string | null
  motherId: string | null
}

export function planParentLinks(
  childId: string,
  rows: ParentChildRow[],
  before: ParentChoice,
  after: ParentChoice,
): { removeRowIds: string[]; addParentIds: string[] } {
  const links = rows.filter(r => r.child_id === childId)
  const wanted = new Set([after.fatherId, after.motherId].filter((id): id is string => !!id))

  // A field changed away from a known parent: unlink that parent — unless
  // they're still chosen in the other field.
  const unlink = new Set<string>()
  for (const [was, now] of [[before.fatherId, after.fatherId], [before.motherId, after.motherId]]) {
    if (was && was !== now && !wanted.has(was)) unlink.add(was)
  }
  const removeRowIds = links.filter(r => unlink.has(r.parent_id)).map(r => r.id)

  // A field changed to someone: link them, if they aren't a parent already.
  const addParentIds: string[] = []
  for (const [was, now] of [[before.fatherId, after.fatherId], [before.motherId, after.motherId]]) {
    if (now && now !== was && !links.some(r => r.parent_id === now) && !addParentIds.includes(now)) {
      addParentIds.push(now)
    }
  }
  return { removeRowIds, addParentIds }
}

/**
 * The branch a new child joins: the father's — also when the child is added
 * from the mother's card and she married in from another branch. Only
 * without a known father does the child join the branch of the parent it
 * was added from.
 */
export function childRootId(
  addedFrom: Pick<PersonRow, 'root_id'>,
  fatherId: string | null,
  peopleById: Map<string, Pick<PersonRow, 'root_id'>>,
): string {
  return (fatherId && peopleById.get(fatherId)?.root_id) || addedFrom.root_id
}

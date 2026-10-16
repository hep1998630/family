// lib/tree/lineage.ts
//
// "Name + father's name" labels (e.g. «محمد مصطفى»), so people who share a
// first name can be told apart in titles and dropdowns.

import type { PersonRow, ParentChildRow, PartnershipRow } from '@/lib/supabase/types'

export interface Lineage {
  /** The person's father, if known. */
  fatherOf: (personId: string) => PersonRow | undefined
  /** The person's mother: their mother_id, else a female parent. */
  motherOf: (personId: string) => PersonRow | undefined
  /** «name fatherName» when the father is known, otherwise just the name. */
  label: (person: PersonRow) => string
}

export function buildLineage(people: PersonRow[], parentChildRows: ParentChildRow[]): Lineage {
  const byId = new Map(people.map(p => [p.id, p]))
  const parentsOf = new Map<string, PersonRow[]>()
  for (const pc of parentChildRows) {
    const parent = byId.get(pc.parent_id)
    if (!parent) continue
    const list = parentsOf.get(pc.child_id) ?? []
    if (!list.some(p => p.id === parent.id)) list.push(parent)
    parentsOf.set(pc.child_id, list)
  }

  const fatherOf = (personId: string) => {
    const person = byId.get(personId)
    const parents = parentsOf.get(personId) ?? []
    return parents.find(p => p.gender === 'male')
      ?? parents.find(p => p.gender !== 'female' && p.id !== person?.mother_id)
  }

  const motherOf = (personId: string) => {
    const person = byId.get(personId)
    if (person?.mother_id) {
      const m = byId.get(person.mother_id)
      if (m) return m
    }
    const parents = parentsOf.get(personId) ?? []
    return parents.find(p => p.gender === 'female')
  }

  const label = (person: PersonRow) => {
    const father = fatherOf(person.id)
    return father ? `${person.name} ${father.name}` : person.name
  }

  return { fatherOf, motherOf, label }
}

/** Everyone `personId` is married to (any branch), excluding shortcut rows. */
export function partnersOf(
  personId: string,
  partnerships: PartnershipRow[],
  peopleById: Map<string, PersonRow>,
): PersonRow[] {
  const ids = partnerships
    .filter(p => p.person_a_id === personId || p.person_b_id === personId)
    .map(p => (p.person_a_id === personId ? p.person_b_id : p.person_a_id))
  return [...new Set(ids)]
    .map(id => peopleById.get(id))
    .filter((p): p is PersonRow => !!p && !p.is_shortcut)
}

/**
 * Parents, children and siblings of `personId` — never offered as a
 * partner for them.
 */
export function closeFamilyIds(personId: string, parentChildRows: ParentChildRow[]): Set<string> {
  const parents = parentChildRows.filter(r => r.child_id === personId).map(r => r.parent_id)
  const children = parentChildRows.filter(r => r.parent_id === personId).map(r => r.child_id)
  const siblings = parentChildRows
    .filter(r => parents.includes(r.parent_id) && r.child_id !== personId)
    .map(r => r.child_id)
  return new Set([...parents, ...children, ...siblings])
}

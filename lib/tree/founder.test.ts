import { describe, expect, it } from 'vitest'
import { computeLayout, findRootPerson } from './layout'
import type { PersonRow, PartnershipRow, ParentChildRow, RootRow } from '@/lib/supabase/types'

// The live bug: one of the founder's wives (married in, so also without
// parents) became the branch's founder after an unrelated edit moved the
// founder's row in the database's (unordered) results.

const root: RootRow = { id: 'A', name: 'عائلة مصطفى', canvas_x: 0, canvas_y: 0, created_at: '2026-01-01T00:00:00+00:00', updated_at: '2026-01-01T00:00:00+00:00' }
const person = (id: string, gender: 'male' | 'female', created_at: string, extra: Partial<PersonRow> = {}): PersonRow => ({
  id, name: id, nickname: null, birth_date: null, bio: null, photo_url: null, mother_id: null,
  root_id: 'A', gender, is_shortcut: false, original_person_id: null, canvas_x: 0, canvas_y: 0,
  created_at, updated_at: created_at, ...extra,
})
const marry = (a: string, b: string): PartnershipRow => ({ id: `${a}+${b}`, person_a_id: a, person_b_id: b, created_at: '2026-01-02T00:00:00+00:00' })
const link = (parent: string, child: string): ParentChildRow => ({ id: `${parent}>${child}`, parent_id: parent, child_id: child, created_at: '2026-01-03T00:00:00+00:00' })

// Ids chosen so that the founder does NOT win on id order either.
const founder = person('z-mustafa', 'male', '2026-01-01T00:00:00.000100+00:00')
const wife1 = person('a-wife1', 'female', '2026-01-01T00:05:00+00:00')
const wife2 = person('b-wife2', 'female', '2026-01-02T00:00:00+00:00')
const wife3 = person('c-wife3', 'female', '2026-01-03T00:00:00+00:00')
const son = person('d-son', 'male', '2026-01-04T00:00:00+00:00', { mother_id: wife1.id })
const partnerships = [marry(founder.id, wife1.id), marry(wife2.id, founder.id), marry(founder.id, wife3.id)]
const parentChild = [link(founder.id, son.id), link(wife1.id, son.id)]

describe('findRootPerson picks the founder, not a wife who married in', () => {
  it('when the wives come before the founder in the input', () => {
    const people = [wife1, wife2, wife3, son, founder]
    expect(findRootPerson('A', people, parentChild)?.id).toBe(founder.id)
  })

  it("after the founder's row was updated and moved to the end", () => {
    const edited = { ...founder, gender: 'male' as const, updated_at: '2026-10-16T21:00:00+00:00' }
    const people = [wife2, son, wife3, wife1, edited]
    expect(findRootPerson('A', people, parentChild)?.id).toBe(founder.id)
  })

  it('whatever the order of the rows', () => {
    const rows = [founder, wife1, wife2, wife3, son]
    for (let i = 0; i < rows.length; i++) {
      const rotated = [...rows.slice(i), ...rows.slice(0, i)]
      expect(findRootPerson('A', rotated, parentChild)?.id).toBe(founder.id)
      expect(findRootPerson('A', [...rotated].reverse(), parentChild)?.id).toBe(founder.id)
    }
  })

  it('a person added in this session (not saved yet) never becomes the founder', () => {
    // useEditDraft gives new rows a temp id and the current time.
    const newWife = person('0-temp-new-wife', 'female', new Date().toISOString())
    const people = [newWife, wife1, wife2, wife3, son, founder]
    expect(findRootPerson('A', people, parentChild)?.id).toBe(founder.id)
  })

  it('a brand-new family created in this session still gets its founder (created first)', () => {
    const t = Date.now()
    const newFounder = person('z-temp-founder', 'male', new Date(t).toISOString(), { root_id: 'B' })
    const newWife = person('a-temp-wife', 'female', new Date(t + 5).toISOString(), { root_id: 'B' })
    expect(findRootPerson('B', [newWife, newFounder], [])?.id).toBe(newFounder.id)
  })

  it('breaks an exact tie on created_at by id, so the answer is still stable', () => {
    const t = '2026-01-01T00:00:00+00:00'
    const x = person('x', 'male', t), y = person('y', 'female', t)
    expect(findRootPerson('A', [y, x], [])?.id).toBe('x')
    expect(findRootPerson('A', [x, y], [])?.id).toBe('x')
  })

  it('the full tree is drawn from the founder too', () => {
    const [lr] = computeLayout([root], [wife2, wife3, son, wife1, founder], partnerships, parentChild)
    expect(lr.rootNode.person.id).toBe(founder.id)
    expect(lr.rootNode.partners.map(p => p.person.id).sort()).toEqual([wife1.id, wife2.id, wife3.id])
  })
})

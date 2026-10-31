import { describe, expect, it } from 'vitest'
import { childRootId, planParentLinks } from './parentLinks'
import type { ParentChildRow } from '@/lib/supabase/types'

const t = '2026-01-01T00:00:00Z'
const link = (id: string, parent_id: string, child_id = 'kid'): ParentChildRow => ({ id, parent_id, child_id, created_at: t })
const nothing = { removeRowIds: [], addParentIds: [] }

describe('planParentLinks: saving a profile touches only parents the form changed', () => {
  it('both parents with no gender set; only the bio was edited → no link removed', () => {
    // The form could only place one of them (as «الأب»); the other never
    // showed up in it. Before, saving removed that second link.
    const rows = [link('l1', 'p1'), link('l2', 'p2')]
    const shown = { fatherId: 'p1', motherId: null }
    expect(planParentLinks('kid', rows, shown, shown)).toEqual(nothing)
  })

  it('a third parent row is never removed by an unrelated edit', () => {
    const rows = [link('l1', 'dad'), link('l2', 'mum'), link('l3', 'other')]
    const shown = { fatherId: 'dad', motherId: 'mum' }
    expect(planParentLinks('kid', rows, shown, shown)).toEqual(nothing)
  })

  it('changing the father replaces only the father’s link', () => {
    const rows = [link('l1', 'dad'), link('l2', 'mum'), link('l3', 'other')]
    expect(planParentLinks('kid', rows, { fatherId: 'dad', motherId: 'mum' }, { fatherId: 'rightDad', motherId: 'mum' }))
      .toEqual({ removeRowIds: ['l1'], addParentIds: ['rightDad'] })
  })

  it('changing the mother replaces only the mother’s link', () => {
    const rows = [link('l1', 'dad'), link('l2', 'mum')]
    expect(planParentLinks('kid', rows, { fatherId: 'dad', motherId: 'mum' }, { fatherId: 'dad', motherId: 'mum2' }))
      .toEqual({ removeRowIds: ['l2'], addParentIds: ['mum2'] })
  })

  it('clearing a known parent unlinks them', () => {
    const rows = [link('l1', 'dad'), link('l2', 'mum')]
    expect(planParentLinks('kid', rows, { fatherId: 'dad', motherId: 'mum' }, { fatherId: null, motherId: 'mum' }))
      .toEqual({ removeRowIds: ['l1'], addParentIds: [] })
  })

  it('setting a parent who was unknown adds a link and removes nothing', () => {
    const rows = [link('l1', 'ungendered')]
    expect(planParentLinks('kid', rows, { fatherId: null, motherId: null }, { fatherId: 'dad', motherId: null }))
      .toEqual({ removeRowIds: [], addParentIds: ['dad'] })
  })

  it('choosing an existing (unplaced) parent links nothing twice', () => {
    const rows = [link('l1', 'p1'), link('l2', 'p2')]
    expect(planParentLinks('kid', rows, { fatherId: 'p1', motherId: null }, { fatherId: 'p1', motherId: 'p2' }))
      .toEqual(nothing)
  })

  it('moving a parent from one field to the other keeps their link', () => {
    const rows = [link('l1', 'p1')]
    expect(planParentLinks('kid', rows, { fatherId: 'p1', motherId: null }, { fatherId: null, motherId: 'p1' }))
      .toEqual(nothing)
  })

  it('only looks at this child’s links', () => {
    const rows = [link('l1', 'dad', 'sibling'), link('l2', 'dad')]
    expect(planParentLinks('kid', rows, { fatherId: 'dad', motherId: null }, { fatherId: 'dad2', motherId: null }))
      .toEqual({ removeRowIds: ['l2'], addParentIds: ['dad2'] })
  })
})

describe('childRootId: a new child joins the father’s branch', () => {
  const people = new Map([['dad', { root_id: 'A' }], ['mum', { root_id: 'B' }]])

  it('added from the mother’s card, with a father chosen → the father’s branch', () => {
    expect(childRootId({ root_id: 'B' }, 'dad', people)).toBe('A')
  })
  it('added from the father’s card → his branch', () => {
    expect(childRootId({ root_id: 'A' }, 'dad', people)).toBe('A')
  })
  it('no father known → the branch of the parent it was added from', () => {
    expect(childRootId({ root_id: 'B' }, null, people)).toBe('B')
  })
})

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, readAll } from './readAll'
import type { Database } from '@/lib/supabase/types'

// The API returns at most 1000 rows per request. A table with more must be
// read page by page — and none of it may be lost or read twice.

/** A fake client for one table of `count` rows, capped at 1000 rows per request like the API. */
function fakeClient(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: `id-${String(i).padStart(5, '0')}`, created_at: '2026-01-01' }))
  const requests: { from: number; to: number; order: string[] }[] = []
  const client = {
    from: () => {
      const order: string[] = []
      const q = {
        select: () => q,
        order: (col: string) => { order.push(col); return q },
        range: (from: number, to: number) => {
          requests.push({ from, to, order })
          const page = rows.slice(from, Math.min(to + 1, from + 1000))
          return Promise.resolve({ data: page, error: null })
        },
      }
      return q
    },
  } as unknown as SupabaseClient<Database>
  return { client, requests, rows }
}

describe('readAll', () => {
  it('reads 1000 + 1000 + 5 rows in three pages, every row exactly once', async () => {
    const f = fakeClient(2005)
    const { data, error } = await readAll(f.client, 'people')
    expect(error).toBeNull()
    expect(data).toHaveLength(2005)
    expect(new Set(data!.map(r => r.id)).size).toBe(2005)
    expect(f.requests.map(r => [r.from, r.to])).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('reads in a stable order (created_at, then id)', async () => {
    const f = fakeClient(3)
    await readAll(f.client, 'parent_child')
    expect(f.requests[0].order).toEqual(['created_at', 'id'])
  })

  it('exactly 1000 rows: one more (empty) page confirms the end', async () => {
    const f = fakeClient(1000)
    const { data } = await readAll(f.client, 'partnerships')
    expect(data).toHaveLength(1000)
    expect(f.requests).toHaveLength(2)
  })

  it('an empty table is one request', async () => {
    const f = fakeClient(0)
    expect((await readAll(f.client, 'roots')).data).toEqual([])
    expect(f.requests).toHaveLength(1)
  })
})

describe('fetchAllRows', () => {
  it('stops at the first error and returns it (no partial data)', async () => {
    let calls = 0
    const result = await fetchAllRows<number>(async () => {
      calls++
      return calls === 1
        ? { data: Array(1000).fill(0), error: null }
        : { data: null, error: { message: 'boom' } }
    })
    expect(result).toEqual({ data: null, error: { message: 'boom' } })
    expect(calls).toBe(2)
  })
})

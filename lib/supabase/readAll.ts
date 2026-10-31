// lib/supabase/readAll.ts
//
// Reading whole tables. The Supabase API returns at most 1000 rows per
// request (the project's "max rows" setting) and silently stops there — a
// family with more than 1000 people or links would just lose the rest. So
// every full-table read goes through here, a page of 1000 at a time, until a
// short page says it's the end.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/lib/supabase/types'

export const PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * All rows, page by page. `page(from, to)` reads rows from..to (inclusive)
 * and must use a stable order, so pages neither overlap nor skip rows.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
): Promise<{ data: T[]; error: null } | { data: null; error: { message: string } }> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}

type TableName = 'roots' | 'people' | 'partnerships' | 'parent_child' | 'saved_views'

/** Every row of `table`, oldest first (created_at, then id — a stable order). */
export function readAll<T extends TableName>(client: SupabaseClient<Database>, table: T, pageSize = PAGE_SIZE) {
  return fetchAllRows<Tables<T>>(
    (from, to) => client.from(table).select('*').order('created_at').order('id').range(from, to) as unknown as
      PromiseLike<PageResult<Tables<T>>>,
    pageSize,
  )
}

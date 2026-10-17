// lib/supabase/writes.ts
//
// Row-level security doesn't make a refused UPDATE or DELETE fail: the
// database just changes 0 rows and reports success. Every update/delete of
// a known row therefore asks for the affected rows back (`.select('id')`)
// and goes through checkWritten, so a refused write is reported instead of
// looking saved.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export const PERMISSION_DENIED = 'لم يتم الحفظ: ليس لديك صلاحية لهذا التعديل'

export class PermissionDeniedError extends Error {
  constructor() {
    super(PERMISSION_DENIED)
    this.name = 'PermissionDeniedError'
  }
}

type TableName = keyof Database['public']['Tables']
type WriteResult = { data: { id: string }[] | null; error: { message: string } | null }

/**
 * Throws if the update/delete of row `id` in `table` errored, or changed
 * nothing while the row still exists (= refused by RLS). A row that is
 * already gone is fine: e.g. a delete retried after its response was lost.
 */
export async function checkWritten(
  client: SupabaseClient<Database>,
  table: TableName,
  id: string,
  result: WriteResult,
): Promise<void> {
  if (result.error) throw new Error(result.error.message)
  if ((result.data?.length ?? 0) > 0) return
  const { data, error } = await client.from(table).select('id').eq('id', id).limit(1)
  if (error) throw new Error(error.message)
  if ((data?.length ?? 0) > 0) throw new PermissionDeniedError()
}

/** Throws unless the logged-in user is the owner (the only role that may delete people/branches). */
export async function requireOwner(client: SupabaseClient<Database>): Promise<void> {
  const { data, error } = await client.rpc('is_owner')
  if (error) throw new Error(error.message)
  if (data !== true) throw new PermissionDeniedError()
}

/** checkWritten for hooks that report errors as a message instead of throwing. */
export async function writeError(
  client: SupabaseClient<Database>,
  table: TableName,
  id: string,
  result: WriteResult,
): Promise<string | null> {
  try {
    await checkWritten(client, table, id, result)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

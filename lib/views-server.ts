// lib/views-server.ts — server-side loading of the saved views.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, SavedViewRow } from '@/lib/supabase/types'
import { sortViews } from '@/lib/views'

/**
 * All saved views, in display order. Never throws: if the table can't be
 * read (e.g. migration 005 hasn't been run yet) the page still loads, just
 * without views, and the reason is logged on the server.
 */
export async function loadSavedViews(supabase: SupabaseClient<Database>): Promise<SavedViewRow[]> {
  try {
    const { data, error } = await supabase.from('saved_views').select('*')
    if (error) {
      console.error('[saved_views] could not load — has migration 005 been run?', error.message)
      return []
    }
    return sortViews(data ?? [])
  } catch (e) {
    console.error('[saved_views] could not load', e)
    return []
  }
}

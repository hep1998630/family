// lib/settings/getSiteSettings.ts — reads the site's settings on the server.
//
// Never throws and never blocks the page: before migration 008 has been run
// (no table), with no row, or if the read fails, the site simply uses
// «شجرة العائلة». Read once per request (React cache) however many places
// ask — the layout's <title>, the page and the manifest.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createPublicClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { DEFAULT_SITE_SETTINGS, settingsFromRow, type SiteSettings } from './siteSettings'

export async function readSiteSettings(client: SupabaseClient<Database>): Promise<SiteSettings> {
  try {
    const { data, error } = await client
      .from('site_settings')
      .select('family_name, other_site_url')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      console.error('[site_settings] could not load — has migration 008 been run?', error.message)
      return DEFAULT_SITE_SETTINGS
    }
    return settingsFromRow(data)
  } catch (e) {
    console.error('[site_settings] could not load', e)
    return DEFAULT_SITE_SETTINGS
  }
}

export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  let client: SupabaseClient<Database>
  try {
    client = createPublicClient()
  } catch (e) {
    // No Supabase settings at all (e.g. a page prerendered while building).
    console.error('[site_settings] no Supabase client', e)
    return DEFAULT_SITE_SETTINGS
  }
  return readSiteSettings(client)
})

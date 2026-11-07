import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readSiteSettings } from './getSiteSettings'
import { DEFAULT_FAMILY_NAME, validateSettings } from './siteSettings'
import type { Database } from '@/lib/supabase/types'

// The site must never break because of its settings: before migration 008
// is run, with no row, or when the read fails, it is «شجرة العائلة».

/** A client whose site_settings read returns `result` (or throws `thrown`). */
function client(result: { data: unknown; error: unknown } | null, thrown?: Error) {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: () => (thrown ? Promise.reject(thrown) : Promise.resolve(result)),
  }
  return { from: () => q } as unknown as SupabaseClient<Database>
}

describe('readSiteSettings', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  it('reads the family name and the other site', async () => {
    const s = await readSiteSettings(client({ data: { family_name: 'عائلة الأم', other_site_url: 'https://a.example.app' }, error: null }))
    expect(s).toEqual({ familyName: 'عائلة الأم', otherSiteUrl: 'https://a.example.app' })
  })

  it('migration 008 not run yet (no table) → the default name', async () => {
    const s = await readSiteSettings(client({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.site_settings'" } }))
    expect(s).toEqual({ familyName: DEFAULT_FAMILY_NAME, otherSiteUrl: null })
  })

  it('no row → the default name', async () => {
    expect(await readSiteSettings(client({ data: null, error: null }))).toEqual({ familyName: DEFAULT_FAMILY_NAME, otherSiteUrl: null })
  })

  it('the read throws (network) → the default name', async () => {
    expect((await readSiteSettings(client(null, new Error('fetch failed')))).familyName).toBe(DEFAULT_FAMILY_NAME)
  })

  it('unusable values are replaced: a blank name, a non-https link', async () => {
    const s = await readSiteSettings(client({ data: { family_name: '   ', other_site_url: 'http://x.example' }, error: null }))
    expect(s).toEqual({ familyName: DEFAULT_FAMILY_NAME, otherSiteUrl: null })
  })
})

describe('validateSettings (what «إعدادات الموقع» accepts)', () => {
  it('trims, and an empty link means none', () => {
    expect(validateSettings('  عائلة الأم ', '  ')).toEqual({ ok: true, values: { family_name: 'عائلة الأم', other_site_url: null } })
    expect(validateSettings('عائلة', 'https://al-mustafa-family.netlify.app'))
      .toEqual({ ok: true, values: { family_name: 'عائلة', other_site_url: 'https://al-mustafa-family.netlify.app' } })
  })

  it('refuses a blank or too-long name, and a link that is not https', () => {
    expect(validateSettings('   ', '')).toMatchObject({ ok: false, errors: { familyName: 'اسم العائلة مطلوب' } })
    expect(validateSettings('ا'.repeat(61), '')).toMatchObject({ ok: false, errors: { familyName: expect.any(String) } })
    expect(validateSettings('عائلة', 'http://x.example')).toMatchObject({ ok: false, errors: { otherSiteUrl: 'يجب أن يبدأ الرابط بـ https://' } })
    expect(validateSettings('عائلة', 'https://')).toMatchObject({ ok: false })
  })
})

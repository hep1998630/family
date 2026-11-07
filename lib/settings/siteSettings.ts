// lib/settings/siteSettings.ts — the site's own settings (migration 008):
// what makes one family's site different from another's, besides the data.
// Safe to import anywhere (no server-only code).

export const DEFAULT_FAMILY_NAME = 'شجرة العائلة'
export const FAMILY_NAME_MAX = 60

export interface SiteSettings {
  /** The site's name: page title, header, login page, home-screen name, exports. */
  familyName: string
  /** The other family's site — shown to admins only, never on the public page. */
  otherSiteUrl: string | null
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = { familyName: DEFAULT_FAMILY_NAME, otherSiteUrl: null }

/** The settings from a site_settings row, with anything unusable replaced by the default. */
export function settingsFromRow(row: { family_name?: unknown; other_site_url?: unknown } | null | undefined): SiteSettings {
  const name = typeof row?.family_name === 'string' ? row.family_name.trim() : ''
  const url = typeof row?.other_site_url === 'string' ? row.other_site_url.trim() : ''
  return {
    familyName: name || DEFAULT_FAMILY_NAME,
    otherSiteUrl: url.startsWith('https://') ? url : null,
  }
}

/**
 * Checks what the owner typed in «إعدادات الموقع» (the same rules as the
 * database's checks). Returns the values to save, or an Arabic error per field.
 */
export function validateSettings(familyName: string, otherSiteUrl: string):
  | { ok: true; values: { family_name: string; other_site_url: string | null } }
  | { ok: false; errors: { familyName?: string; otherSiteUrl?: string } } {
  const name = familyName.trim()
  const url = otherSiteUrl.trim()
  const errors: { familyName?: string; otherSiteUrl?: string } = {}
  if (!name) errors.familyName = 'اسم العائلة مطلوب'
  else if (name.length > FAMILY_NAME_MAX) errors.familyName = `اسم العائلة طويل جداً (الحد ${FAMILY_NAME_MAX} حرفاً)`
  if (url && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(url)) errors.otherSiteUrl = 'يجب أن يبدأ الرابط بـ https://'
  if (errors.familyName || errors.otherSiteUrl) return { ok: false, errors }
  return { ok: true, values: { family_name: name, other_site_url: url || null } }
}

// lib/views.ts — helpers shared by the saved-view viewer and builder.

import type { SavedViewRow } from '@/lib/supabase/types'

/** Depth choices, as admins see them. `null` = no limit. */
export const DEPTH_OPTIONS: { value: number | null; label: string }[] = [
  { value: 1, label: 'الأبناء فقط' },
  { value: 2, label: 'حتى الأحفاد' },
  { value: 3, label: '3 أجيال' },
  { value: null, label: 'كل الذرية' },
]

export function depthLabel(depth: number | null): string {
  return DEPTH_OPTIONS.find(o => o.value === depth)?.label ?? `${depth} أجيال`
}

/** Display order: admins' sort_order, then oldest first. */
export function sortViews(views: SavedViewRow[]): SavedViewRow[] {
  return [...views].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
}

/** Path of a view's public page — what the share button sends. */
export function viewPath(viewId: string): string {
  return `/view?view=${encodeURIComponent(viewId)}`
}

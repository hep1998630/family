'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sortViews } from '@/lib/views'
import type { SavedViewRow } from '@/lib/supabase/types'

export interface SavedViewInput {
  name: string
  top_person_id: string
  depth: number | null
  partner_id: string | null
}

type Result<T> = { data: T; error: null } | { data: null; error: string }

/**
 * The saved views, with admin writes. Unlike family edits (which wait for
 * the «حفظ» button), views are presentation settings and save at once.
 */
export function useSavedViews(initialViews: SavedViewRow[]) {
  const [views, setViews] = useState(() => sortViews(initialViews))
  const [supabase] = useState(createClient)

  const create = useCallback(async (input: SavedViewInput): Promise<Result<SavedViewRow>> => {
    const sort_order = views.reduce((max, v) => Math.max(max, v.sort_order), -1) + 1
    const { data, error } = await supabase
      .from('saved_views')
      .insert({ ...input, name: input.name.trim(), sort_order })
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    setViews(prev => sortViews([...prev, data]))
    return { data, error: null }
  }, [supabase, views])

  const update = useCallback(async (id: string, input: SavedViewInput): Promise<Result<SavedViewRow>> => {
    const { data, error } = await supabase
      .from('saved_views')
      .update({ ...input, name: input.name.trim() })
      .eq('id', id)
      .select()
      .single()
    if (error) return { data: null, error: error.message }
    setViews(prev => sortViews(prev.map(v => (v.id === id ? data : v))))
    return { data, error: null }
  }, [supabase])

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const { error } = await supabase.from('saved_views').delete().eq('id', id)
    if (error) return error.message
    setViews(prev => prev.filter(v => v.id !== id))
    return null
  }, [supabase])

  /** Moves a view one place up (-1) or down (+1) in the list. */
  const move = useCallback(async (id: string, direction: -1 | 1): Promise<string | null> => {
    const i = views.findIndex(v => v.id === id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= views.length) return null
    // Renumber the whole list in its new order, so ties or gaps from
    // earlier edits can't make a move a no-op.
    const reordered = [...views]
    ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
    const changed = reordered
      .map((v, index) => ({ ...v, sort_order: index }))
      .filter((v, index) => views.find(o => o.id === v.id)!.sort_order !== index)
    setViews(reordered.map((v, index) => ({ ...v, sort_order: index })))
    for (const v of changed) {
      const { error } = await supabase.from('saved_views').update({ sort_order: v.sort_order }).eq('id', v.id)
      if (error) {
        setViews(views) // put the list back as it was
        return error.message
      }
    }
    return null
  }, [supabase, views])

  return { views, create, update, remove, move }
}

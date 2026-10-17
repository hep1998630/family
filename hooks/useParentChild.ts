'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { writeError } from '@/lib/supabase/writes'
import type { ParentChildRow, InsertParentChild } from '@/lib/supabase/types'

export function useParentChild(initialRows: ParentChildRow[] = []) {
  const [parentChildRows, setParentChildRows] = useState<ParentChildRow[]>(initialRows)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  // ── Real-time subscription ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('parent-child-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parent_child' },
        payload => {
          if (payload.eventType === 'INSERT') {
            setParentChildRows(prev => [...prev, payload.new as ParentChildRow])
          } else if (payload.eventType === 'DELETE') {
            setParentChildRows(prev => prev.filter(r => r.id !== payload.old.id))
          }
        }
      )
      .subscribe((_status, err) => {
        if (err) console.error('[useParentChild] realtime error:', err)
      })

    return () => { supabase.removeChannel(channel).catch(console.error) }
  }, [])

  // ── Add parent-child link ───────────────────────────────────
  const addParentChild = useCallback(async (
    parentId: string,
    childId: string,
  ): Promise<ParentChildRow | null> => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('parent_child')
      .insert({ parent_id: parentId, child_id: childId } satisfies InsertParentChild)
      .select()
      .single()

    setLoading(false)
    if (error) { setError(error.message); return null }
    return data
  }, [])

  // ── Remove parent-child link ────────────────────────────────
  const removeParentChild = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    const err = await writeError(supabase, 'parent_child', id,
      await supabase.from('parent_child').delete().eq('id', id).select('id'))

    setLoading(false)
    if (err) { setError(err); return false }
    return true
  }, [])

  // ── Helpers ─────────────────────────────────────────────────

  const getChildIds = useCallback((parentId: string): string[] => {
    return parentChildRows
      .filter(r => r.parent_id === parentId)
      .map(r => r.child_id)
  }, [parentChildRows])

  const getParentIds = useCallback((childId: string): string[] => {
    return parentChildRows
      .filter(r => r.child_id === childId)
      .map(r => r.parent_id)
  }, [parentChildRows])

  return {
    parentChildRows,
    loading,
    error,
    addParentChild,
    removeParentChild,
    getChildIds,
    getParentIds,
  }
}
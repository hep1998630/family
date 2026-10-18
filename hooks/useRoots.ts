'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { writeError } from '@/lib/supabase/writes'
import type { RootRow, InsertRoot } from '@/lib/supabase/types'

export function useRoots(initialRoots: RootRow[] = []) {
  const [roots, setRoots] = useState<RootRow[]>(initialRoots)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  // ── Real-time subscription ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('roots-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roots' },
        payload => {
          if (payload.eventType === 'INSERT') {
            setRoots(prev => [...prev, payload.new as RootRow])
          } else if (payload.eventType === 'UPDATE') {
            setRoots(prev =>
              prev.map(r => r.id === payload.new.id ? payload.new as RootRow : r)
            )
          } else if (payload.eventType === 'DELETE') {
            setRoots(prev => prev.filter(r => r.id !== payload.old.id))
          }
        }
      )
      .subscribe((_status, err) => {
        if (err) console.error('[useRoots] realtime error:', err)
      })

    return () => { supabase.removeChannel(channel).catch(console.error) }
  }, [])

  // ── Add root ────────────────────────────────────────────────
  const addRoot = useCallback(async (name: string): Promise<RootRow | null> => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('roots')
      .insert({ name, canvas_x: 0, canvas_y: 0 } satisfies InsertRoot)
      .select()
      .single()

    setLoading(false)
    if (error) { setError(error.message); return null }
    return data
  }, [])

  // ── Update root ─────────────────────────────────────────────
  const updateRoot = useCallback(async (
    id: string,
    updates: Partial<Pick<RootRow, 'name' | 'canvas_x' | 'canvas_y'>>
  ): Promise<boolean> => {
    setError(null)
    const err = await writeError(supabase, 'roots', id,
      await supabase.from('roots').update(updates).eq('id', id).select('id'))

    if (err) { setError(err); return false }
    return true
  }, [])

  // ── Delete root ─────────────────────────────────────────────
  const deleteRoot = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    const err = await writeError(supabase, 'roots', id,
      await supabase.from('roots').delete().eq('id', id).select('id'))

    setLoading(false)
    if (err) { setError(err); return false }
    return true
  }, [])

  return { roots, loading, error, addRoot, updateRoot, deleteRoot }
}
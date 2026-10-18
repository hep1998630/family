'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { writeError } from '@/lib/supabase/writes'
import type { PartnershipRow, InsertPartnership } from '@/lib/supabase/types'

export function usePartnerships(initialPartnerships: PartnershipRow[] = []) {
  const [partnerships, setPartnerships] = useState<PartnershipRow[]>(initialPartnerships)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  // ── Real-time subscription ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('partnerships-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partnerships' },
        payload => {
          if (payload.eventType === 'INSERT') {
            setPartnerships(prev => [...prev, payload.new as PartnershipRow])
          } else if (payload.eventType === 'DELETE') {
            setPartnerships(prev => prev.filter(p => p.id !== payload.old.id))
          }
        }
      )
      .subscribe((_status, err) => {
        if (err) console.error('[usePartnerships] realtime error:', err)
      })

    return () => { supabase.removeChannel(channel).catch(console.error) }
  }, [])

  // ── Add partnership ─────────────────────────────────────────
  const addPartnership = useCallback(async (
    personAId: string,
    personBId: string,
  ): Promise<PartnershipRow | null> => {
    setLoading(true)
    setError(null)

    // Normalize order to prevent duplicates (smaller id always goes to person_a)
    const [a, b] = [personAId, personBId].sort()

    const { data, error } = await supabase
      .from('partnerships')
      .insert({ person_a_id: a, person_b_id: b } satisfies InsertPartnership)
      .select()
      .single()

    setLoading(false)
    if (error) { setError(error.message); return null }
    return data
  }, [])

  // ── Remove partnership ──────────────────────────────────────
  const removePartnership = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    const err = await writeError(supabase, 'partnerships', id,
      await supabase.from('partnerships').delete().eq('id', id).select('id'))

    setLoading(false)
    if (err) { setError(err); return false }
    return true
  }, [])

  // ── Get partners of a person ────────────────────────────────
  const getPartnerIds = useCallback((personId: string): string[] => {
    return partnerships
      .filter(p => p.person_a_id === personId || p.person_b_id === personId)
      .map(p => p.person_a_id === personId ? p.person_b_id : p.person_a_id)
  }, [partnerships])

  return {
    partnerships,
    loading,
    error,
    addPartnership,
    removePartnership,
    getPartnerIds,
  }
}
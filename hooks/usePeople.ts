'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { requireOwner, writeError } from '@/lib/supabase/writes'
import type { PersonRow, InsertPerson, UpdatePerson } from '@/lib/supabase/types'

export function usePeople(initialPeople: PersonRow[] = []) {
  const [people, setPeople] = useState<PersonRow[]>(initialPeople)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  // ── Real-time subscription ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('people-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'people' },
        payload => {
          if (payload.eventType === 'INSERT') {
            setPeople(prev => [...prev, payload.new as PersonRow])
          } else if (payload.eventType === 'UPDATE') {
            setPeople(prev =>
              prev.map(p => p.id === payload.new.id ? payload.new as PersonRow : p)
            )
          } else if (payload.eventType === 'DELETE') {
            setPeople(prev => prev.filter(p => p.id !== payload.old.id))
          }
        }
      )
      .subscribe((_status, err) => {
        if (err) console.error('[usePeople] realtime error:', err)
      })

    return () => { supabase.removeChannel(channel).catch(console.error) }
  }, [])

  // ── Add person ──────────────────────────────────────────────
  const addPerson = useCallback(async (
    data: InsertPerson
  ): Promise<PersonRow | null> => {
    setLoading(true)
    setError(null)
    const { data: row, error } = await supabase
      .from('people')
      .insert(data)
      .select()
      .single()

    setLoading(false)
    if (error) { setError(error.message); return null }
    return row
  }, [])

  // ── Update person ───────────────────────────────────────────
  const updatePerson = useCallback(async (
    id: string,
    updates: UpdatePerson
  ): Promise<boolean> => {
    setError(null)
    const err = await writeError(supabase, 'people', id,
      await supabase.from('people').update(updates).eq('id', id).select('id'))

    if (err) { setError(err); return false }
    return true
  }, [])

  // ── Delete person — unlinks partnerships + child rows, then deletes ──
  const deletePerson = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true)
    setError(null)

    // 0. Only the owner may delete people — check before touching any link.
    try {
      await requireOwner(supabase)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLoading(false)
      return false
    }

    // 1. Remove all partnerships involving this person
    const { error: e1 } = await supabase
      .from('partnerships')
      .delete()
      .or(`person_a_id.eq.${id},person_b_id.eq.${id}`)
    if (e1) { setError(e1.message); setLoading(false); return false }

    // 2. Remove parent_child rows where this person is a child
    const { error: e2 } = await supabase
      .from('parent_child')
      .delete()
      .eq('child_id', id)
    if (e2) { setError(e2.message); setLoading(false); return false }

    // 3. Delete the person (DB on delete restrict for parent_id is fine —
    //    we only allow this when the person has no children)
    const e3 = await writeError(supabase, 'people', id,
      await supabase.from('people').delete().eq('id', id).select('id'))

    setLoading(false)
    if (e3) { setError(e3); return false }
    return true
  }, [])

  // ── Upload photo to Supabase storage ────────────────────────
  const uploadPhoto = useCallback(async (
    personId: string,
    file: File
  ): Promise<string | null> => {
    const ext = file.name.split('.').pop()
    const path = `${personId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) { setError(uploadError.message); return null }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return data.publicUrl
  }, [])

  // ── Check if person has any connections ────────────────────
  const hasConnections = useCallback((
    personId: string,
    partnerships: { person_a_id: string; person_b_id: string }[],
    parentChildRows: { parent_id: string; child_id: string }[],
  ): boolean => {
    const isInPartnership = partnerships.some(
      p => p.person_a_id === personId || p.person_b_id === personId
    )
    const isParentOrChild = parentChildRows.some(
      pc => pc.parent_id === personId || pc.child_id === personId
    )
    return isInPartnership || isParentOrChild
  }, [])

  return {
    people,
    loading,
    error,
    addPerson,
    updatePerson,
    deletePerson,
    uploadPhoto,
    hasConnections,
  }
}
'use client'

import { useMemo, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import type { PersonRow, ParentChildRow } from '@/lib/supabase/types'
import { matchesArabic, normalizeArabic } from '@/lib/search/arabic'

interface NamedPerson extends PersonRow {
  root_name?: string
}

interface PeopleListPanelProps {
  people: NamedPerson[]
  parentChildRows: ParentChildRow[]
  onNavigate: (id: string) => void
  onDelete: (id: string) => void
  isOwner: boolean
}

export default function PeopleListPanel({
  people,
  parentChildRows,
  onNavigate,
  onDelete,
  isOwner,
}: PeopleListPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // Everyone with children — by a parent link, or (older rows) only by a
  // child's mother_id; children of their shortcut rows in other branches
  // count too. They can't be deleted (the database refuses it as well).
  const parentIds = useMemo(() => {
    const byId = new Map(people.map(p => [p.id, p]))
    const ids = [
      ...parentChildRows.map(pc => pc.parent_id),
      ...people.flatMap(p => (p.mother_id ? [p.mother_id] : [])),
    ]
    return new Set(ids.map(id => byId.get(id)?.original_person_id ?? id))
  }, [parentChildRows, people])

  const realPeople = useMemo(
    () => people.filter(p => !p.is_shortcut),
    [people]
  )

  const filtered = useMemo(() => {
    if (!normalizeArabic(search)) return realPeople
    return realPeople.filter(p => matchesArabic(p.name, search) || matchesArabic(p.nickname, search))
  }, [realPeople, search])

  // ── Toggle button (inline in the top bar) + overlay panel ────
  const toggle = (
    <button
      onClick={() => { setIsOpen(o => !o); setSearch(''); setConfirmId(null) }}
      title="عرض قائمة الأشخاص"
      aria-label="قائمة الأشخاص"
      aria-expanded={isOpen}
      className={`
        flex-shrink-0 w-12 h-12 rounded-xl
        border-2 flex items-center justify-center
        transition-colors duration-150
        ${isOpen ? 'bg-walnut border-walnut text-white' : 'bg-white border-slate-200 text-walnut-light hover:text-walnut hover:border-walnut'}
      `}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M7 5h11M7 10h11M7 15h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="3" cy="5"  r="1.4" fill="currentColor"/>
        <circle cx="3" cy="10" r="1.4" fill="currentColor"/>
        <circle cx="3" cy="15" r="1.4" fill="currentColor"/>
      </svg>
    </button>
  )

  if (!isOpen) return toggle

  // ── Expanded panel ───────────────────────────────────────────
  return (
    <>
    {toggle}
    <div
      className="
        fixed top-20 inset-x-3 sm:inset-x-auto sm:left-5 z-30
        flex flex-col
        sm:w-80 max-h-[calc(100%-7rem)]
        bg-white
        border-2 border-slate-200
        rounded-2xl shadow-popup
        overflow-hidden
      "
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3.5 border-b-2 border-slate-100 flex-shrink-0">
        <span className="font-sans text-lg font-bold text-charcoal">
          الأشخاص
          <span className="mr-2 font-normal text-walnut-light">
            ({realPeople.length})
          </span>
        </span>
        <button
          onClick={() => { setIsOpen(false); setSearch(''); setConfirmId(null) }}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-walnut-light hover:text-charcoal hover:bg-parchment transition-colors"
          aria-label="إغلاق"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b-2 border-slate-100 flex-shrink-0">
        <div className="relative">
          <svg
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            width="16" height="16" viewBox="0 0 16 16" fill="none"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setConfirmId(null) }}
            placeholder="ابحث بالاسم…"
            className="
              w-full pr-10 pl-4 py-3
              font-sans text-base text-charcoal
              bg-parchment rounded-xl
              border-2 border-slate-200
              focus:outline-none focus:border-walnut focus:ring-2 focus:ring-walnut/15
              placeholder:text-slate-400
              transition-colors duration-150
            "
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-charcoal hover:bg-slate-200 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <p className="font-sans text-base text-walnut-light text-center py-10">
            {search ? 'لا توجد نتائج' : 'لا يوجد أشخاص بعد'}
          </p>
        ) : (
          filtered.map(person => {
            const canDelete = isOwner && !parentIds.has(person.id)
            const isConfirming = confirmId === person.id

            return (
              <div key={person.id} className="border-b border-slate-100 last:border-0">
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <Avatar
                    name={person.name}
                    photoUrl={person.photo_url}
                    size={38}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="font-sans text-base font-semibold text-charcoal truncate leading-tight">
                      {person.name}
                      {person.nickname && (
                        <span className="font-normal text-walnut-light mr-1.5">
                          ({person.nickname})
                        </span>
                      )}
                    </p>
                    {person.root_name && (
                      <p className="font-sans text-sm text-walnut-light truncate mt-0.5">
                        {person.root_name}
                      </p>
                    )}
                  </div>

                  {/* Navigate */}
                  <button
                    onClick={() => onNavigate(person.id)}
                    title="انتقل لهذا الشخص"
                    className="
                      w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                      text-walnut-light hover:text-walnut hover:bg-parchment
                      border-2 border-transparent hover:border-walnut/20
                      transition-colors duration-100
                    "
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setConfirmId(isConfirming ? null : person.id)}
                    title={canDelete ? 'حذف الشخص' : !isOwner ? 'فقط المالك يمكنه الحذف' : 'لا يمكن الحذف — لديه أبناء'}
                    disabled={!canDelete}
                    className={`
                      w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                      border-2 transition-colors duration-100
                      ${!canDelete
                        ? 'text-slate-300 border-transparent cursor-not-allowed'
                        : isConfirming
                          ? 'bg-red-100 text-red-600 border-red-300'
                          : 'text-slate-400 border-transparent hover:text-red-600 hover:bg-red-50 hover:border-red-200'}
                    `}
                  >
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                      <path d="M2 4h11M5 4V3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v1M12 4l-.6 7.5a1 1 0 0 1-1 .9H4.6a1 1 0 0 1-1-.9L3 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>

                {/* Inline delete confirmation */}
                {isConfirming && (
                  <div className="px-4 pb-4 flex items-center gap-3">
                    <p className="font-sans text-base font-semibold text-red-600 flex-1">
                      حذف {person.name}؟
                    </p>
                    <button
                      onClick={() => {
                        onDelete(person.id)
                        setConfirmId(null)
                      }}
                      className="
                        font-sans text-sm font-bold text-white
                        bg-red-600 hover:bg-red-700
                        px-5 py-3 rounded-xl
                        transition-colors duration-100
                      "
                    >
                      حذف
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="font-sans text-sm font-semibold text-walnut-light hover:text-walnut px-4 py-3 rounded-xl hover:bg-parchment transition-colors"
                    >
                      إلغاء
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
    </>
  )
}

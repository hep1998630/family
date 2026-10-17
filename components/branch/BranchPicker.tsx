'use client'

import { useMemo } from 'react'
import Avatar from '@/components/ui/Avatar'
import { findRootPerson } from '@/lib/tree/layout'
import type { PersonRow, RootRow, ParentChildRow } from '@/lib/supabase/types'

interface BranchPickerProps {
  roots: RootRow[]
  people: PersonRow[]
  parentChildRows: ParentChildRow[]
  isEditable: boolean
  onSelect: (rootId: string) => void
  onAddRoot?: () => void
  /** Shown under the branch cards (the saved views). */
  children?: React.ReactNode
}

export default function BranchPicker({
  roots,
  people,
  parentChildRows,
  isEditable,
  onSelect,
  onAddRoot,
  children,
}: BranchPickerProps) {
  const cards = useMemo(() => roots.map(root => {
    const founder = findRootPerson(root.id, people, parentChildRows)
    const memberCount = people.filter(p => p.root_id === root.id && !p.is_shortcut).length
    return { root, founder, memberCount }
  }), [roots, people, parentChildRows])

  return (
    <div className="min-h-full bg-parchment px-4 sm:px-6 py-8 sm:py-12 flex flex-col items-center">
      <div className="w-full max-w-3xl flex flex-col items-center">
        <h1 className="font-sans text-3xl sm:text-4xl font-bold text-charcoal text-center mb-2">
          فروع العائلة
        </h1>
        <p className="font-sans text-lg text-walnut-light text-center mb-10">
          اختر فرعاً لاستكشاف أفراده
        </p>

        {cards.length === 0 && !isEditable && (
          <p className="font-sans text-lg text-walnut-light text-center py-10">
            لا توجد فروع للعائلة بعد.
          </p>
        )}

        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-5">
          {cards.map(({ root, founder, memberCount }) => (
            <button
              key={root.id}
              onClick={() => onSelect(root.id)}
              className="
                flex items-center gap-4 p-5
                bg-white border-2 border-slate-200 rounded-2xl
                text-right
                shadow-card hover:border-walnut hover:shadow-popup
                transition-all duration-150
              "
            >
              <Avatar
                name={founder?.name ?? root.name}
                photoUrl={founder?.photo_url}
                size={56}
              />
              <div className="flex-1 min-w-0">
                <p className="font-sans text-xl font-bold text-charcoal truncate">
                  {root.name}
                </p>
                <p className="font-sans text-base text-walnut-light truncate mt-0.5">
                  {founder ? `يبدأ بـ ${founder.name}` : 'لا يوجد أفراد بعد'} · {memberCount} فرد
                </p>
              </div>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-walnut-light">
                <path d="M6.5 3L13 9l-6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}

          {isEditable && (
            <button
              onClick={onAddRoot}
              className="
                flex items-center justify-center gap-2.5 p-5
                border-2 border-dashed border-walnut/40 rounded-2xl
                text-walnut hover:border-walnut hover:bg-white
                font-sans text-lg font-semibold
                transition-colors duration-150
              "
            >
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M9 5v8M5 9h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              إضافة عائلة جديدة
            </button>
          )}
        </div>
        <div className="w-full mt-10 empty:hidden">{children}</div>
      </div>
    </div>
  )
}

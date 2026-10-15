'use client'

import Avatar from '@/components/ui/Avatar'
import type { PersonRow } from '@/lib/supabase/types'
import { NODE_WIDTH, NODE_HEIGHT } from '@/lib/tree/layout'

interface ShortcutNodeProps {
  person: PersonRow
  x: number
  y: number
  targetRootName?: string
  onNavigateToOriginal: (originalPersonId: string) => void
  onClickPerson: (personId: string) => void
  isEditable: boolean
}

export default function ShortcutNode({
  person,
  x,
  y,
  targetRootName,
  onNavigateToOriginal,
  onClickPerson,
}: ShortcutNodeProps) {
  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (person.original_person_id) onNavigateToOriginal(person.original_person_id)
  }

  return (
    <div
      className="person-node shortcut group"
      style={{ left: x, top: y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      onClick={() => onClickPerson(person.id)}
      title={`${person.name} — من فرع ${targetRootName ?? 'آخر'}`}
    >
      {/* ── Avatar ── */}
      <Avatar name={person.name} photoUrl={person.photo_url} size={58} />

      {/* ── Text ── */}
      <div className="w-full flex flex-col items-center gap-0.5">
        <p className="font-sans text-sm font-bold text-charcoal leading-snug line-clamp-2 w-full">
          {person.name}
        </p>
        {person.nickname && (
          <p className="font-sans text-xs text-walnut-light truncate w-full">
            {person.nickname}
          </p>
        )}
        <p className="font-sans text-xs font-bold text-teal-700 flex items-center gap-1 mt-0.5">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 5h8M6 2l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          فرع {targetRootName ?? 'آخر'}
        </p>
      </div>

      {/* ── Navigate badge ── */}
      <button
        onClick={handleNavigate}
        title={`الانتقال إلى ${person.name} في فرعه الأصلي`}
        className="
          absolute -top-3 -right-3
          w-8 h-8 rounded-full
          bg-teal-500 text-white
          flex items-center justify-center
          shadow-md hover:bg-teal-600
          transition-colors duration-150
        "
        aria-label={`الانتقال إلى ${person.name}`}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M2 6.5h9M8 3l3.5 3.5L8 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}

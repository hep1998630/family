'use client'

import Avatar from '@/components/ui/Avatar'
import type { PersonRow } from '@/lib/supabase/types'
import { NODE_WIDTH, NODE_HEIGHT } from '@/lib/tree/layout'

interface PersonNodeProps {
  person: PersonRow
  x: number
  y: number
  isEditable: boolean
  isHighlighted?: boolean
  isActive?: boolean
  onClickPerson: (personId: string) => void
  onActivate?: (personId: string) => void
  onAddPartner?: (personId: string) => void
  onAddChild?: (personId: string) => void
}

export default function PersonNode({
  person,
  x,
  y,
  isEditable,
  isHighlighted,
  isActive,
  onClickPerson,
  onActivate,
  onAddPartner,
  onAddChild,
}: PersonNodeProps) {
  function handleClick() {
    if (isEditable && !isActive) {
      onActivate?.(person.id)
    } else {
      onClickPerson(person.id)
    }
  }

  return (
    <div
      id={`person-${person.id}`}
      data-person-node
      className={`person-node${person.gender === 'male' ? ' person-node--male' : person.gender === 'female' ? ' person-node--female' : ''}${isHighlighted ? ' person-node--highlighted' : ''}${isActive ? ' person-node--active' : ''}`}
      style={{ left: x, top: y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      onClick={handleClick}
    >
      {/* ── Avatar ── */}
      <Avatar name={person.name} photoUrl={person.photo_url} size={58} />

      {/* ── Text ── */}
      <div className="w-full flex flex-col items-center gap-0.5">
        <p className="name-text node-text font-sans font-bold text-charcoal leading-snug line-clamp-2 w-full">
          {person.name}
        </p>
        {person.nickname && (
          <p className="node-text-small font-sans text-walnut-light truncate w-full">
            {person.nickname}
          </p>
        )}
        {person.birth_date && (
          <p className="node-text-small font-sans text-walnut-light w-full">
            {person.birth_date}
          </p>
        )}
      </div>

      {/* ── Edit buttons (shown on first click, edit mode only) ── */}
      {isEditable && (
        <div
          className={`
            absolute -bottom-12 left-1/2 -translate-x-1/2
            flex items-center gap-2
            transition-opacity duration-150
            whitespace-nowrap
            ${isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}
          `}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => onAddPartner?.(person.id)}
            title="إضافة شريك"
            className="
              flex items-center gap-1.5 px-3 py-2
              bg-white border-2 border-walnut/30 rounded-full
              text-xs font-sans font-bold text-walnut
              hover:border-walnut hover:bg-walnut hover:text-white
              shadow-md transition-all duration-150
            "
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            شريك
          </button>
          <button
            onClick={() => onAddChild?.(person.id)}
            title="إضافة ابن/ابنة"
            className="
              flex items-center gap-1.5 px-3 py-2
              bg-white border-2 border-walnut/30 rounded-full
              text-xs font-sans font-bold text-walnut
              hover:border-walnut hover:bg-walnut hover:text-white
              shadow-md transition-all duration-150
            "
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            ابن/ابنة
          </button>
        </div>
      )}
    </div>
  )
}

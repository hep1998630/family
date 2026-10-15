'use client'

import { useEffect, useRef, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import type { PersonRow } from '@/lib/supabase/types'
import { NODE_WIDTH, NODE_HEIGHT } from '@/lib/tree/layout'

interface ReferenceNodeProps {
  person: PersonRow
  ownerPersonId: string
  x: number
  y: number
  isEditable: boolean
  isCrossBranch: boolean
  targetRootName?: string
  onNavigateToOriginal: (personId: string) => void
  onRemovePartner: (ownerPersonId: string, refPersonId: string) => void
}

export default function ReferenceNode({
  person,
  ownerPersonId,
  x,
  y,
  isEditable,
  isCrossBranch,
  targetRootName,
  onNavigateToOriginal,
  onRemovePartner,
}: ReferenceNodeProps) {
  const [active, setActive] = useState(false)
  const nodeRef = useRef<HTMLDivElement>(null)

  // Collapse when clicking anywhere outside this node
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent) => {
      if (!nodeRef.current?.contains(e.target as Node)) {
        setActive(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [active])

  function handleClick() {
    if (isEditable && !active) {
      // First click in edit mode: lift up and reveal actions
      setActive(true)
    } else {
      // Second click (or any click in view mode): navigate to original
      setActive(false)
      onNavigateToOriginal(person.id)
    }
  }

  return (
    <div
      ref={nodeRef}
      className={`person-node reference${active ? ' person-node--active' : ''}`}
      style={{ left: x, top: y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
      onClick={handleClick}
      title={
        active
          ? isCrossBranch
            ? `اضغط مرة أخرى للانتقال إلى فرع ${targetRootName ?? ''}`
            : `اضغط مرة أخرى للانتقال إلى ${person.name}`
          : `${person.name} — اضغط للخيارات`
      }
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
        <p className="font-sans text-xs font-bold text-amber-700 flex items-center gap-1 mt-0.5">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path
              d="M4.5 6.5a2.5 2.5 0 003.5 0l1.5-1.5a2.5 2.5 0 00-3.5-3.5L5.25 2.75"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            />
            <path
              d="M6.5 4.5a2.5 2.5 0 00-3.5 0L1.5 6a2.5 2.5 0 003.5 3.5l.75-.75"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            />
          </svg>
          {isCrossBranch ? `تزوج من فرع ${targetRootName ?? 'آخر'}` : 'انتقل للأصل'}
        </p>
      </div>

      {/* ── Reference badge ── */}
      <div
        className="
          absolute -top-3 -right-3
          w-7 h-7 rounded-full
          bg-amber-500 text-white
          flex items-center justify-center
          shadow-md
        "
        aria-hidden="true"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M5 2H2.5A1.5 1.5 0 001 3.5v6A1.5 1.5 0 002.5 11h6A1.5 1.5 0 0010 9.5V7M7 1h4m0 0v4M11 1 5.5 6.5"
            stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* ── Action buttons (edit mode, shown after first click) ── */}
      {isEditable && (
        <div
          className={`
            absolute -bottom-12 left-1/2 -translate-x-1/2
            flex items-center gap-2
            transition-opacity duration-150
            whitespace-nowrap
            ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}
          `}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setActive(false)
              onRemovePartner(ownerPersonId, person.id)
            }}
            title="إزالة الشراكة"
            className="
              flex items-center gap-1.5 px-3 py-2
              bg-white border-2 border-red-300 rounded-full
              text-xs font-sans font-bold text-red-500
              hover:border-red-500 hover:bg-red-500 hover:text-white
              shadow-md transition-all duration-150
            "
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            إزالة الشراكة
          </button>
        </div>
      )}
    </div>
  )
}

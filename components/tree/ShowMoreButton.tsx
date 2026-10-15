'use client'

import { NODE_WIDTH } from '@/lib/tree/layout'

interface ShowMoreButtonProps {
  x: number
  y: number
  onClick: () => void
}

/** Rendered below a node whose real children exist but were cut off by maxDepth. */
export default function ShowMoreButton({ x, y, onClick }: ShowMoreButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{ left: x, top: y, width: NODE_WIDTH }}
      className="
        absolute flex flex-col items-center justify-center gap-1.5
        py-5 rounded-2xl
        bg-white border-2 border-dashed border-walnut/40
        text-walnut hover:border-walnut hover:bg-parchment
        font-sans text-xs font-bold text-center
        transition-colors duration-150
      "
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 5.5v7M5.5 9h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      عرض أجيال إضافية
    </button>
  )
}

'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 2
const STEP = 1.25

interface ZoomableTreeProps {
  /** Unscaled size of the tree canvas. */
  width: number
  height: number
  /** Node to center horizontally whenever `centerKey` changes (e.g. a new branch opens). */
  centerOnId: string | null
  centerKey: string
  children: React.ReactNode
}

/**
 * Native-scrolling tree canvas with + / − / fit buttons. Zoom is a plain
 * CSS transform; a sizer div keeps the scroll area matched to the scaled
 * size, so the browser's own scrolling still works (no gesture code).
 */
export default function ZoomableTree({ width, height, centerOnId, centerKey, children }: ZoomableTreeProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  // Content point (unscaled) to keep at the viewport center across a zoom change.
  const anchorRef = useRef<{ x: number; y: number } | null>(null)

  const zoomTo = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const s = scrollerRef.current
    if (!s) return
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next))
    anchorRef.current = anchor ?? {
      x: (s.scrollLeft + s.clientWidth / 2) / zoom,
      y: (s.scrollTop + s.clientHeight / 2) / zoom,
    }
    setZoom(clamped)
  }, [zoom])

  const fit = useCallback(() => {
    const s = scrollerRef.current
    if (!s) return
    const next = Math.min(1, s.clientWidth / width, s.clientHeight / height)
    zoomTo(next, { x: width / 2, y: height / 2 })
  }, [width, height, zoomTo])

  useLayoutEffect(() => {
    const s = scrollerRef.current
    const anchor = anchorRef.current
    if (!s || !anchor) return
    anchorRef.current = null
    s.scrollLeft = anchor.x * zoom - s.clientWidth / 2
    s.scrollTop = anchor.y * zoom - s.clientHeight / 2
  }, [zoom])

  // Center the founder when a branch opens (keeps the top of the tree in view).
  useLayoutEffect(() => {
    const s = scrollerRef.current
    const el = centerOnId ? document.getElementById(`person-${centerOnId}`) : null
    if (!s || !el) return
    const x = (parseFloat(el.style.left) || 0) + el.offsetWidth / 2
    if (zoom === 1) {
      s.scrollLeft = x - s.clientWidth / 2
      s.scrollTop = 0
    } else {
      anchorRef.current = { x, y: s.clientHeight / 2 }
      setZoom(1)
    }
    // Only when the branch changes — not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerKey])

  return (
    <div className="relative flex-1 min-h-0">
      {/* ltr so scrollLeft is the plain 0…max range; node text stays rtl. */}
      <div ref={scrollerRef} dir="ltr" className="branch-scroll absolute inset-0">
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div
            dir="rtl"
            className="relative"
            style={{ width, height, transform: `scale(${zoom})`, transformOrigin: '0 0' }}
          >
            {children}
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 right-4 z-10 flex flex-col gap-2" role="group" aria-label="التكبير">
        <ZoomButton label="تكبير" onClick={() => zoomTo(zoom * STEP)} disabled={zoom >= MAX_ZOOM}>
          <path d="M11 5v12M5 11h12" />
        </ZoomButton>
        <ZoomButton label="تصغير" onClick={() => zoomTo(zoom / STEP)} disabled={zoom <= MIN_ZOOM}>
          <path d="M5 11h12" />
        </ZoomButton>
        <ZoomButton label="ملاءمة الشاشة" onClick={fit}>
          <path d="M4 8V4h4M14 4h4v4M18 14v4h-4M8 18H4v-4" />
        </ZoomButton>
      </div>
    </div>
  )
}

function ZoomButton({ label, onClick, disabled, children }: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="
        w-14 h-14 rounded-2xl flex items-center justify-center
        bg-white border-2 border-slate-200 shadow-popup text-walnut
        hover:border-walnut disabled:opacity-40 transition-colors duration-150
      "
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  )
}

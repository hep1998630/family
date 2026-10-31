'use client'

// The full-screen crop step around PhotoCropper: loads it on demand, and
// owns what must work even when that load fails — the dialog, keyboard focus,
// Escape and «إلغاء». A failed load (offline, or a new version deployed
// since the page opened) shows an error here; the profile underneath and
// the unsaved draft stay as they are.

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PhotoCropperProps } from './PhotoCropper'

type CropperModule = { default: React.ComponentType<PhotoCropperProps> }

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function PhotoCropStep({ src, onDone, onCancel }: PhotoCropperProps) {
  const [cropper, setCropper] = useState<CropperModule | null>(null)
  const [failed, setFailed] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Once cancelled (or closed), a crop still being prepared is dropped.
  const closedRef = useRef(false)
  const onCancelRef = useRef(onCancel)
  const onDoneRef = useRef(onDone)
  useEffect(() => { onCancelRef.current = onCancel; onDoneRef.current = onDone })

  const load = useCallback(() => {
    setFailed(false)
    import('./PhotoCropper').then(
      mod => { if (!closedRef.current) setCropper(mod) },
      () => { if (!closedRef.current) setFailed(true) },
    )
  }, [])
  useEffect(load, [load])

  const cancel = useCallback(() => {
    closedRef.current = true
    onCancelRef.current()
  }, [])
  const done = useCallback((file: File) => {
    if (closedRef.current) return
    closedRef.current = true
    onDoneRef.current(file)
  }, [])

  // Keyboard: focus moves into the dialog and Tab stays inside it; Escape
  // cancels the crop only (not the profile popup underneath); focus goes
  // back where it was on close.
  useEffect(() => {
    closedRef.current = false // (dev mode mounts twice)
    const before = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cancel()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0], last = items[items.length - 1]
      const inside = dialogRef.current.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      closedRef.current = true
      window.removeEventListener('keydown', onKey, true)
      if (before?.isConnected) before.focus()
    }
  }, [cancel])

  const Cropper = cropper?.default
  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="قص الصورة"
      dir="rtl"
      className="fixed inset-0 z-[60] flex flex-col bg-charcoal text-white outline-none"
      data-testid="photo-cropper"
      // Keys used here (Enter on a button, arrows on the slider) must not
      // reach the profile form underneath (React bubbles through portals).
      onKeyDown={e => e.stopPropagation()}
      onKeyUp={e => e.stopPropagation()}
    >
      <p className="px-4 pt-4 pb-2 text-center font-sans text-lg font-bold">
        حرّك الصورة وكبّرها حتى يظهر الوجه داخل الدائرة
      </p>
      {Cropper && !failed ? (
        <CropperBoundary onCancel={cancel}>
          <Cropper src={src} onDone={done} onCancel={cancel} />
        </CropperBoundary>
      ) : (
        <>
          <div className="flex-1 min-h-0 flex items-center justify-center p-6 text-center">
            {failed ? (
              <p role="alert" className="font-sans text-lg">
                تعذّر تحميل أداة قص الصورة. تأكّد من الاتصال بالإنترنت ثم حاول مرة أخرى.
              </p>
            ) : (
              <p role="status" className="font-sans text-lg">جارٍ تحميل الصورة…</p>
            )}
          </div>
          <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex gap-3">
            {failed && (
              <button type="button" onClick={load} className="flex-1 min-h-14 rounded-2xl bg-white text-walnut font-sans text-lg font-bold">
                حاول مرة أخرى
              </button>
            )}
            <button type="button" onClick={cancel} className="flex-1 min-h-14 rounded-2xl border-2 border-white/60 text-white font-sans text-lg font-bold">
              إلغاء
            </button>
          </div>
        </>
      )}
    </div>,
    document.body,
  )
}

/** If the crop area itself breaks, say so and keep «إلغاء» — never lose the page. */
class CropperBoundary extends Component<{ onCancel: () => void; children: ReactNode }, { broken: boolean }> {
  state = { broken: false }
  static getDerivedStateFromError() { return { broken: true } }
  render() {
    if (!this.state.broken) return this.props.children
    return (
      <>
        <p role="alert" className="flex-1 flex items-center justify-center p-6 text-center font-sans text-lg">
          حدث خطأ في أداة قص الصورة. اختر الصورة مرة أخرى.
        </p>
        <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={this.props.onCancel} className="w-full min-h-14 rounded-2xl border-2 border-white/60 text-white font-sans text-lg font-bold">
            إلغاء
          </button>
        </div>
      </>
    )
  }
}

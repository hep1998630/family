'use client'

// Loaded only when someone picks a photo (next/dynamic in ProfileEdit), so
// the cropping library stays out of the main bundle.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Cropper, { type Area } from 'react-easy-crop'
import { cropToBlob, croppedFile } from '@/lib/photos/cropImage'

const MIN_ZOOM = 1
const MAX_ZOOM = 4

interface PhotoCropperProps {
  /** A blob: URL of the chosen photo. */
  src: string
  onDone: (file: File) => void
  onCancel: () => void
}

/**
 * Full-screen crop step: the photo under a round frame — exactly what every
 * avatar shows. Drag (or pinch) to move and zoom, or use the big slider.
 */
export default function PhotoCropper({ src, onDone, onCancel }: PhotoCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [area, setArea] = useState<Area | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error' | 'unreadable'>('idle')

  // Escape cancels the crop only, not the profile popup underneath.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onCancel])

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), [])

  const save = async () => {
    if (!area) return
    setStatus('saving')
    try {
      onDone(croppedFile(await cropToBlob(src, area)))
    } catch {
      setStatus('error')
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="قص الصورة"
      dir="rtl"
      className="fixed inset-0 z-[60] flex flex-col bg-charcoal text-white"
      data-testid="photo-cropper"
    >
      <p className="px-4 pt-4 pb-2 text-center font-sans text-lg font-bold">
        حرّك الصورة وكبّرها حتى يظهر الوجه داخل الدائرة
      </p>

      <div className="relative flex-1 min-h-0">
        {status === 'unreadable' ? (
          <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center font-sans text-lg">
            تعذّر فتح هذه الصورة. جرّب صورة أخرى.
          </p>
        ) : (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            aspect={1}
            cropShape="round"
            showGrid={false}
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            mediaProps={{ onError: () => setStatus('unreadable') }}
          />
        )}
      </div>

      <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-3 bg-charcoal">
        <label className="flex items-center gap-3 font-sans text-base font-semibold">
          <span aria-hidden className="text-2xl leading-none">−</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            aria-label="تكبير الصورة"
            className="photo-zoom flex-1 h-12 accent-white cursor-pointer"
            disabled={status === 'unreadable'}
          />
          <span aria-hidden className="text-2xl leading-none">+</span>
        </label>

        {status === 'error' && (
          <p role="alert" className="font-sans text-base text-center text-red-200">
            تعذّر تجهيز الصورة. حاول مرة أخرى أو اختر صورة أخرى.
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!area || status === 'saving' || status === 'unreadable'}
            className="flex-1 min-h-14 rounded-2xl bg-white text-walnut font-sans text-lg font-bold disabled:opacity-50"
          >
            {status === 'saving' ? 'جارٍ التجهيز…' : 'حفظ الصورة'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-14 rounded-2xl border-2 border-white/60 text-white font-sans text-lg font-bold"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

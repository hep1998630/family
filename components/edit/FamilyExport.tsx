'use client'

import { useCallback, useRef, useState } from 'react'
import type { ExportProgress, ExportResult } from '@/lib/export/runExport'

type Status =
  | { kind: 'idle' }
  | { kind: 'needsSave' }
  | { kind: 'running'; progress: ExportProgress }
  | { kind: 'done'; result: ExportResult }
  | { kind: 'error'; message: string }

const ar = (n: number) => n.toLocaleString('ar-EG')

/**
 * «تصدير العائلة» — the button (placed by the caller) and a status panel.
 * Keeps its state while the menu holding the button closes.
 */
export function useFamilyExport(hasPendingChanges: boolean, onStart?: () => void) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const runningRef = useRef(false)

  const start = useCallback(async () => {
    if (runningRef.current) return
    onStart?.()
    if (hasPendingChanges) { setStatus({ kind: 'needsSave' }); return }
    runningRef.current = true
    setStatus({ kind: 'running', progress: { stage: 'data' } })
    try {
      // Loaded only now, so the zip library isn't part of the normal page.
      const { runFamilyExport } = await import('@/lib/export/runExport')
      const result = await runFamilyExport(progress => setStatus({ kind: 'running', progress }))
      setStatus({ kind: 'done', result })
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      runningRef.current = false
    }
  }, [hasPendingChanges, onStart])

  const close = useCallback(() => setStatus({ kind: 'idle' }), [])
  const running = status.kind === 'running'

  const button = (
    <button
      onClick={start}
      disabled={running}
      className="h-12 rounded-xl border-2 border-walnut/30 font-sans text-base font-bold text-walnut hover:border-walnut disabled:opacity-60 disabled:cursor-wait"
    >
      {running ? 'جارٍ التصدير…' : 'تصدير العائلة'}
    </button>
  )

  const panel = status.kind === 'idle' ? null : (
    <div
      role={status.kind === 'error' || status.kind === 'needsSave' ? 'alert' : 'status'}
      data-testid="export-status"
      className="fixed bottom-4 inset-x-3 sm:inset-x-auto sm:left-4 sm:w-96 z-50 bg-white border-2 border-slate-200 rounded-2xl shadow-popup p-4 flex items-start gap-3"
    >
      <div className="flex-1 min-w-0 font-sans text-base text-charcoal">
        {status.kind === 'needsSave' && (
          <p>لديك تغييرات غير محفوظة. اضغط «حفظ» أولاً، ثم صدّر العائلة.</p>
        )}
        {status.kind === 'running' && (
          <p className="font-semibold">
            {status.progress.stage === 'data' && 'جارٍ تحميل بيانات العائلة…'}
            {status.progress.stage === 'photos' && (status.progress.total > 0
              ? `جارٍ تجهيز الملف… ${ar(status.progress.done)} / ${ar(status.progress.total)} صورة`
              : 'جارٍ تجهيز الملف…')}
            {status.progress.stage === 'zip' && 'جارٍ ضغط الملف…'}
          </p>
        )}
        {status.kind === 'done' && (
          <>
            <p className="font-semibold">تم تنزيل الملف:</p>
            <p dir="ltr" className="text-left text-sm font-medium break-all">{status.result.fileName}</p>
            <p className="text-sm text-walnut-light mt-1">
              {ar(status.result.people)} شخصاً، {ar(status.result.photos)} صورة.
              {status.result.missingPhotos > 0 &&
                ` تعذّر تنزيل ${ar(status.result.missingPhotos)} صورة — روابطها في ملف README.txt.`}
            </p>
          </>
        )}
        {status.kind === 'error' && (
          <>
            <p className="font-semibold text-red-700">تعذّر التصدير. حاول مرة أخرى.</p>
            <p dir="ltr" className="text-sm text-red-600 text-left break-words mt-1">{status.message}</p>
          </>
        )}
      </div>
      {!running && (
        <button onClick={close} aria-label="إغلاق" className="flex-shrink-0 w-9 h-9 rounded-lg text-walnut-light hover:bg-parchment">✕</button>
      )}
    </div>
  )

  return { button, panel }
}

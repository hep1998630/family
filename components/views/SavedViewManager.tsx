'use client'

import { useState } from 'react'
import SavedViewCards, { type ViewCardPerson } from '@/components/views/SavedViewCards'
import type { SavedViewRow } from '@/lib/supabase/types'

interface SavedViewManagerProps {
  views: SavedViewRow[]
  personFor: (id: string) => ViewCardPerson | undefined
  onOpen: (viewId: string) => void
  onCreate: () => void
  onEdit: (viewId: string) => void
  /** Each resolves to an error message, or null on success. */
  onDelete: (viewId: string) => Promise<string | null>
  onMove: (viewId: string, direction: -1 | 1) => Promise<string | null>
}

/** Admin list of saved views: open, create, edit, delete (with confirm) and reorder. */
export default function SavedViewManager({
  views,
  personFor,
  onOpen,
  onCreate,
  onEdit,
  onDelete,
  onMove,
}: SavedViewManagerProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<string | null>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const err = await action()
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="flex flex-col gap-4" data-testid="view-manager">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-sans text-2xl font-bold text-charcoal">عروض مختارة</h2>
        <button
          onClick={onCreate}
          className="flex-shrink-0 h-12 px-5 rounded-xl bg-walnut text-white font-sans text-base font-bold hover:bg-walnut-dark"
        >
          + إنشاء عرض جديد
        </button>
      </div>

      {error && (
        <p role="alert" className="font-sans text-base text-red-700 bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 break-words">
          تعذّر تنفيذ العملية. حاول مرة أخرى.
          <span dir="ltr" className="block text-sm text-red-600 text-left">{error}</span>
        </p>
      )}

      {views.length === 0 && (
        <p className="font-sans text-lg text-walnut-light text-center py-8">
          لا توجد عروض بعد. أنشئ عرضاً ليظهر للجميع في الصفحة الرئيسية.
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {views.map((view, i) => (
          <li key={view.id} className="flex flex-col gap-2" data-view-row={view.id}>
            <SavedViewCards views={[view]} personFor={personFor} onSelect={onOpen} title="" />
            {confirmId === view.id ? (
              <div className="flex flex-wrap items-center gap-2 px-1">
                <p className="flex-1 min-w-0 font-sans text-base font-semibold text-red-700">حذف «{view.name}»؟</p>
                <button
                  onClick={() => run(async () => { const e = await onDelete(view.id); if (!e) setConfirmId(null); return e })}
                  disabled={busy}
                  className="h-11 px-5 rounded-xl bg-red-600 text-white font-sans text-base font-bold hover:bg-red-700 disabled:opacity-60"
                >
                  حذف
                </button>
                <button onClick={() => setConfirmId(null)} className="h-11 px-4 rounded-xl font-sans text-base font-semibold text-walnut-light hover:bg-white">
                  إلغاء
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-1">
                <RowButton onClick={() => onEdit(view.id)}>تعديل</RowButton>
                <RowButton onClick={() => setConfirmId(view.id)} danger>حذف</RowButton>
                <span className="flex-1" />
                <RowButton onClick={() => run(() => onMove(view.id, -1))} disabled={busy || i === 0} label="تحريك لأعلى">↑</RowButton>
                <RowButton onClick={() => run(() => onMove(view.id, 1))} disabled={busy || i === views.length - 1} label="تحريك لأسفل">↓</RowButton>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function RowButton({ onClick, disabled, danger, label, children }: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  label?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`
        h-11 min-w-11 px-4 rounded-xl border-2 bg-white font-sans text-base font-bold
        disabled:opacity-40 transition-colors duration-150
        ${danger ? 'border-red-200 text-red-700 hover:border-red-500' : 'border-slate-200 text-walnut hover:border-walnut'}
      `}
    >
      {children}
    </button>
  )
}

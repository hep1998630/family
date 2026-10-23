'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useFamilyExport } from '@/components/edit/FamilyExport'
import { PERMISSION_DENIED } from '@/lib/supabase/writes'

interface EditToolbarProps {
    hasPendingChanges: boolean
    isSaving: boolean
    onSave: () => void
    adminName?: string
}

/** Save button + account menu, laid out inline inside the top bar. */
export default function EditToolbar({
    hasPendingChanges,
    isSaving,
    onSave,
    adminName,
}: EditToolbarProps) {
    return (
        <>
            <AccountMenu adminName={adminName || 'المدير'} hasPendingChanges={hasPendingChanges} />
            <button
                onClick={onSave}
                disabled={isSaving || !hasPendingChanges}
                className={`
                    flex-shrink-0 flex items-center gap-2
                    h-12 px-4 sm:px-7 rounded-xl
                    font-sans text-lg font-bold whitespace-nowrap
                    transition-all duration-150
                    ${hasPendingChanges && !isSaving
                        ? 'bg-walnut text-white hover:bg-walnut-dark cursor-pointer shadow-md'
                        : 'bg-white text-walnut-light border-2 border-slate-200 cursor-default'}
                    ${isSaving ? 'opacity-60 cursor-wait' : ''}
                `}
            >
                {isSaving ? (
                    <>
                        <svg className="animate-spin" width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <circle
                                cx="9" cy="9" r="7"
                                stroke="currentColor" strokeWidth="2"
                                strokeDasharray="20 10" strokeLinecap="round"
                            />
                        </svg>
                        جارٍ الحفظ…
                    </>
                ) : (
                    <>
                        {hasPendingChanges && <span className="w-2.5 h-2.5 rounded-full bg-gold" />}
                        حفظ
                    </>
                )}
            </button>
        </>
    )
}

/** Full-width save error, shown under the top bar. */
export function SaveErrorBanner({ saveError }: { saveError: string }) {
    return (
        <div
            role="alert"
            className="
                font-sans text-base font-medium text-red-700
                bg-red-50 border-2 border-red-300
                rounded-xl px-4 py-3
                text-right flex flex-col gap-1
            "
        >
            {saveError.startsWith(PERMISSION_DENIED) ? (
                // Retrying won't help: this account isn't allowed to make that change.
                <>
                    <p className="font-bold">{PERMISSION_DENIED}.</p>
                    <p>
                        ما قبله حُفظ. لإلغاء هذا التغيير أعد تحميل الصفحة،
                        أو اطلب من مالك الموقع أن يجريه.
                    </p>
                </>
            ) : (
                <>
                    <p>تعذّر حفظ بعض التغييرات. حاول مرة أخرى — ما تم حفظه لن يتكرر.</p>
                    <p dir="ltr" className="text-sm font-normal text-red-600 text-left break-words">
                        {saveError}
                    </p>
                </>
            )}
        </div>
    )
}

function AccountMenu({ adminName, hasPendingChanges }: { adminName: string; hasPendingChanges: boolean }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    // Lives here, not in the dropdown, so progress survives the menu closing.
    const closeMenu = useCallback(() => setOpen(false), [])
    const familyExport = useFamilyExport(hasPendingChanges, closeMenu)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    const handleLogout = async () => {
        const supabase = createClient()
        try {
            await supabase.auth.signOut()
        } catch {
            // Ignore — navigate to /login regardless, so a broken/already-
            // invalid session can't leave the button looking like it did nothing.
        }
        router.push('/login')
        router.refresh()
    }

    return (
        <div ref={ref} className="relative flex-shrink-0">
            <button
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-label={`الحساب: ${adminName}`}
                className="
                    h-12 min-w-12 px-3 rounded-xl flex items-center justify-center gap-2
                    bg-white border-2 border-slate-200 text-walnut-light
                    hover:text-walnut hover:border-walnut transition-colors duration-150
                "
            >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M3.5 17c1.2-3 3.7-4.5 6.5-4.5s5.3 1.5 6.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span className="hidden md:inline font-sans text-sm font-semibold text-charcoal max-w-32 truncate">
                    {adminName}
                </span>
            </button>
            {open && (
                <div className="absolute top-full mt-2 left-0 z-40 w-60 bg-white border-2 border-slate-200 rounded-2xl shadow-popup p-4 flex flex-col gap-3">
                    <p className="font-sans text-sm text-walnut-light">
                        مسجل الدخول: <span className="font-semibold text-charcoal name-text">{adminName}</span>
                    </p>
                    {familyExport.button}
                    <button
                        onClick={handleLogout}
                        className="h-12 rounded-xl border-2 border-walnut/30 font-sans text-base font-bold text-walnut hover:border-walnut"
                    >
                        تسجيل الخروج
                    </button>
                </div>
            )}
            {familyExport.panel}
        </div>
    )
}

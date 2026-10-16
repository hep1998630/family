'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface EditToolbarProps {
    hasPendingChanges: boolean
    isSaving: boolean
    saveError: string | null
    onSave: () => void
    adminName?: string
}

export default function EditToolbar({
    hasPendingChanges,
    isSaving,
    saveError,
    onSave,
    adminName,
}: EditToolbarProps) {
    const router = useRouter()

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
        <div className="fixed top-5 right-5 z-30 flex flex-col items-end gap-2">
            {adminName && (
                <div className="flex items-center gap-2 bg-white border-2 border-slate-200 rounded-xl px-4 py-2 shadow-card">
                    <span className="font-sans text-sm text-walnut-light">
                        مسجل الدخول: <span className="font-semibold text-charcoal">{adminName}</span>
                    </span>
                    <button
                        onClick={handleLogout}
                        className="font-sans text-sm font-semibold text-walnut hover:text-walnut-dark hover:underline"
                    >
                        تسجيل الخروج
                    </button>
                </div>
            )}
            <button
                onClick={onSave}
                disabled={isSaving || !hasPendingChanges}
                className={`
                    flex items-center gap-2.5
                    px-9 py-5 rounded-2xl
                    font-sans text-xl font-semibold
                    shadow-md transition-all duration-150
                    ${hasPendingChanges && !isSaving
                        ? 'bg-walnut text-white hover:bg-walnut-dark cursor-pointer'
                        : 'bg-white text-walnut-light border-2 border-slate-200 cursor-default'}
                    ${isSaving ? 'opacity-60 cursor-wait' : ''}
                `}
            >
                {isSaving ? (
                    <>
                        <svg
                            className="animate-spin"
                            width="18" height="18" viewBox="0 0 18 18" fill="none"
                        >
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
                        {hasPendingChanges && (
                            <span className="w-2.5 h-2.5 rounded-full bg-gold" />
                        )}
                        حفظ
                    </>
                )}
            </button>

            {/* Save error message */}
            {saveError && !isSaving && (
                <div
                    role="alert"
                    className="
                        font-sans text-base font-medium text-red-700
                        bg-white border-2 border-red-300
                        rounded-xl px-5 py-3 shadow-sm
                        max-w-xs text-right flex flex-col gap-1
                    "
                >
                    <p>تعذّر حفظ بعض التغييرات. حاول مرة أخرى — ما تم حفظه لن يتكرر.</p>
                    <p dir="ltr" className="text-sm font-normal text-red-600 text-left break-words">
                        {saveError}
                    </p>
                </div>
            )}
        </div>
    )
}

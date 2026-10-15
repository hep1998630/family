'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface EditToolbarProps {
    onAddRoot: () => void
    hasPendingChanges: boolean
    isSaving: boolean
    saveError: string | null
    onSave: () => void
    adminName?: string
}

export default function EditToolbar({
    onAddRoot,
    hasPendingChanges,
    isSaving,
    saveError,
    onSave,
    adminName,
}: EditToolbarProps) {
    const router = useRouter()

    const handleLogout = async () => {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
        <>
            {/* ── Save Changes button (top-right corner) ── */}
            <div
                data-no-pan
                className="absolute top-5 right-5 z-20 flex flex-col items-end gap-2"
            >
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
                    <p className="
                        font-sans text-base font-medium text-red-700
                        bg-white border-2 border-red-300
                        rounded-xl px-5 py-3 shadow-sm
                        max-w-xs text-right
                    ">
                        {saveError}
                    </p>
                )}
            </div>

            {/* ── Bottom toolbar (add root) ── */}
            <div
                data-no-pan
                className="absolute left-1/2 -translate-x-1/2 z-20"
                style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
                {/* Add root */}
                <button
                    onClick={onAddRoot}
                    className="
                        flex items-center gap-2.5
                        px-9 py-5 rounded-xl
                        bg-walnut text-white
                        font-sans text-xl font-semibold
                        hover:bg-walnut-dark
                        transition-colors duration-150
                        shadow-sm
                    "
                >
                    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M9 5v8M5 9h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    جذر جديد
                </button>
            </div>
        </>
    )
}

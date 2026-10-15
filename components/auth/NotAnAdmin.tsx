'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'

export default function NotAnAdmin({ email, userId }: { email: string; userId: string }) {
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
    <main className="min-h-screen bg-parchment flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm flex flex-col items-center gap-5">
        <h1 className="font-sans text-2xl font-bold text-charcoal">
          ليس لديك صلاحية التعديل
        </h1>
        <p className="font-sans text-lg text-walnut-light leading-relaxed">
          الحساب {email} ليس من مسؤولي الشجرة. تواصل مع المسؤول الرئيسي لإضافتك.
        </p>
        <p className="font-sans text-sm text-walnut-light/70 leading-relaxed" dir="ltr">
          user id: {userId}
        </p>
        <Button variant="secondary" size="sm" onClick={handleLogout}>
          تسجيل الخروج
        </Button>
      </div>
    </main>
  )
}

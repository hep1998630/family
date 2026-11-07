import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import LoginForm from '@/components/auth/LoginForm'
import { getSiteSettings } from '@/lib/settings/getSiteSettings'

export default async function LoginPage() {
  // Resolved by middleware.ts — see its comment for why this page must
  // not independently call supabase.auth.getUser() itself.
  const headerList = await headers()
  const adminRole = headerList.get('x-admin-role')
  if (adminRole) redirect('/edit')
  const { familyName } = await getSiteSettings()

  return (
    <main className="min-h-screen bg-parchment flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="text-center">
          <p className="font-sans text-xl font-bold text-walnut mb-3 name-text">{familyName}</p>
          <h1 className="font-sans text-3xl font-bold text-charcoal mb-2">
            تسجيل دخول المسؤولين
          </h1>
          <p className="font-sans text-lg text-walnut-light leading-relaxed">
            هذه الصفحة لأعضاء العائلة المخوّلين بتعديل الشجرة فقط
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  )
}

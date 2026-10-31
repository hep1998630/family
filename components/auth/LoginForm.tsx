'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError('البريد الإلكتروني أو كلمة المرور غير صحيحة')
      setSubmitting(false)
      return
    }

    router.push('/edit')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <Input
        type="email"
        label="البريد الإلكتروني"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="name@example.com"
        autoFocus
        autoComplete="email"
      />

      <Input
        type="password"
        label="كلمة المرور"
        required
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
      />

      {error && (
        <p role="alert" className="font-sans text-base font-medium text-red-700 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <Button type="submit" loading={submitting} className="w-full mt-2">
        تسجيل الدخول
      </Button>
    </form>
  )
}

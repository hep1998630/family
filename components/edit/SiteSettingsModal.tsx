'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createClient } from '@/lib/supabase/client'
import { validateSettings } from '@/lib/settings/siteSettings'

/**
 * «إعدادات الموقع» (owner only): the family's name and the optional link to
 * the other family's site. Saved straight away — these are site settings,
 * not tree data, so they don't wait for «حفظ».
 */
export default function SiteSettingsModal({ isOpen, onClose, familyName, otherSiteUrl }: {
  isOpen: boolean
  onClose: () => void
  familyName: string
  otherSiteUrl: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState(familyName)
  const [url, setUrl] = useState(otherSiteUrl ?? '')
  const [errors, setErrors] = useState<{ familyName?: string; otherSiteUrl?: string }>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | { error: string }>('idle')

  const save = async () => {
    const checked = validateSettings(name, url)
    if (!checked.ok) { setErrors(checked.errors); return }
    setErrors({})
    setStatus('saving')
    const { data, error } = await createClient()
      .from('site_settings')
      .update(checked.values)
      .eq('id', 1)
      .select('id')
    if (error) {
      const missing = error.code === 'PGRST205' || error.code === '42P01'
      setStatus({ error: missing
        ? 'لم يتم الحفظ: الإعدادات غير مفعّلة بعد في قاعدة البيانات (الترحيل 008).'
        : `لم يتم الحفظ: ${error.message}` })
      return
    }
    // Row-level security doesn't fail a refused update — it changes 0 rows.
    if (!data || data.length === 0) {
      setStatus({ error: 'لم يتم الحفظ: فقط مالك الموقع يمكنه تغيير الإعدادات.' })
      return
    }
    setStatus('saved')
    router.refresh() // the name in the header, the page title and the home-screen name
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="max-w-lg">
      <div className="p-6 flex flex-col gap-5" dir="rtl">
        <h2 className="font-sans text-2xl font-bold text-charcoal">إعدادات الموقع</h2>

        <Input
          label="اسم العائلة"
          required
          value={name}
          onChange={e => { setName(e.target.value); setStatus('idle') }}
          error={errors.familyName}
          maxLength={60}
          placeholder="مثلاً: عائلة المصطفى"
        />
        <p className="-mt-3 font-sans text-base text-walnut-light">
          يظهر في أعلى الموقع، وفي عنوان الصفحة، وتحت أيقونة الموقع على الهاتف.
        </p>

        <Input
          label="رابط شجرة العائلة الأخرى (اختياري)"
          dir="ltr"
          type="url"
          inputMode="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setStatus('idle') }}
          error={errors.otherSiteUrl}
          placeholder="https://"
          className="text-left"
        />
        <p className="-mt-3 font-sans text-base text-walnut-light">
          يظهر للمسؤولين فقط، داخل قائمة الحساب. لا يظهر أبداً في الصفحة العامة.
        </p>

        {status === 'saved' && (
          <p role="status" className="font-sans text-lg font-bold text-green-800 bg-green-50 border-2 border-green-300 rounded-xl px-4 py-3">
            تم حفظ الإعدادات.
          </p>
        )}
        {typeof status === 'object' && (
          <p role="alert" className="font-sans text-lg font-semibold text-red-700 bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3">
            {status.error}
          </p>
        )}

        <div className="flex gap-3">
          <Button onClick={save} loading={status === 'saving'} className="flex-1">
            حفظ الإعدادات
          </Button>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            {status === 'saved' ? 'إغلاق' : 'إلغاء'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

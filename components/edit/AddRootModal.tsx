'use client'

import { useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface AddRootModalProps {
  isOpen: boolean
  onConfirm: (rootName: string, founderName: string) => Promise<void>
  onCancel: () => void
}

export default function AddRootModal({
  isOpen,
  onConfirm,
  onCancel,
}: AddRootModalProps) {
  const [rootName,    setRootName]    = useState('')
  const [founderName, setFounderName] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [errors,      setErrors]      = useState<{ root?: string; founder?: string }>({})
  // Blocks a double tap from creating the family twice (see AddPersonModal).
  const submittingRef = useRef(false)

  const reset = () => {
    setRootName('')
    setFounderName('')
    setErrors({})
  }

  const handleCancel = () => { reset(); onCancel() }

  const handleConfirm = async () => {
    if (submittingRef.current) return
    const newErrors: typeof errors = {}
    if (!rootName.trim())    newErrors.root    = 'اسم العائلة مطلوب'
    if (!founderName.trim()) newErrors.founder = 'اسم المؤسس مطلوب'

    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }

    submittingRef.current = true
    setSaving(true)
    try {
      await onConfirm(rootName.trim(), founderName.trim())
      reset()
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} maxWidth="max-w-sm">
      <div className="px-6 pt-7 pb-6 flex flex-col gap-5">

        {/* Header */}
        <div>
          <h3 className="font-sans text-2xl font-bold text-charcoal">
            إضافة جذر عائلي
          </h3>
          <p className="font-sans text-base text-walnut-light mt-1">
            ابدأ فرعاً عائلياً جديداً على اللوحة
          </p>
        </div>

        <div className="h-0.5 bg-slate-200" />

        {/* Illustration */}
        <div className="flex justify-center py-1">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
            <circle cx="28" cy="12" r="8" stroke="#1E40AF" strokeWidth="1.8" fill="none" />
            <path d="M28 20v8" stroke="#1E40AF" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M28 28 L16 40" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M28 28 L40 40" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="16" cy="45" r="6" stroke="#1E40AF" strokeWidth="1.5" fill="none" />
            <circle cx="40" cy="45" r="6" stroke="#1E40AF" strokeWidth="1.5" fill="none" />
          </svg>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4">
          <Input
            label="اسم العائلة"
            required
            value={rootName}
            onChange={e => setRootName(e.target.value)}
            error={errors.root}
            placeholder="مثلاً: عائلة الراشدي"
            autoFocus
          />

          <Input
            label="اسم المؤسس / الجد الأول"
            required
            value={founderName}
            onChange={e => setFounderName(e.target.value)}
            error={errors.founder}
            placeholder="مثلاً: إبراهيم الراشدي"
          />

          <p className="font-sans text-base text-walnut-light leading-relaxed">
            سيتم وضع المؤسس كأعلى جد في هذه العائلة.
            يمكنك إضافة تفاصيله بعد الإنشاء.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
            إلغاء
          </Button>
          <Button size="sm" onClick={handleConfirm} loading={saving}>
            إنشاء عائلة
          </Button>
        </div>

      </div>
    </Modal>
  )
}

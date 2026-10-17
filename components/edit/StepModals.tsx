'use client'

import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

/** Shown instead of the add-child form when the person has no partner yet. */
export function NeedPartnerModal({
  isOpen,
  personName,
  onAddPartner,
  onCancel,
}: {
  isOpen: boolean
  personName: string
  onAddPartner: () => void
  onCancel: () => void
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="max-w-sm">
      <div className="px-6 pt-7 pb-6 flex flex-col gap-5">
        <h3 className="font-sans text-2xl font-bold text-charcoal">أضف الزوج أو الزوجة أولاً</h3>
        <p className="font-sans text-lg text-walnut-light leading-relaxed">
          لإضافة ابن أو ابنة لـ {personName}، يجب أولاً إضافة الزوج أو الزوجة، حتى يُربط الابن بوالديه الاثنين.
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={onAddPartner} className="w-full">إضافة شريك الآن</Button>
          <Button variant="ghost" size="sm" onClick={onCancel} className="w-full">إلغاء</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Asks for a person's gender before adding a partner or child for them. */
export function AskGenderModal({
  isOpen,
  personName,
  onPick,
  onCancel,
}: {
  isOpen: boolean
  personName: string
  onPick: (gender: 'male' | 'female') => void
  onCancel: () => void
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="max-w-sm">
      <div className="px-6 pt-7 pb-6 flex flex-col gap-5">
        <h3 className="font-sans text-2xl font-bold text-charcoal">حدّد جنس {personName} أولاً</h3>
        <p className="font-sans text-lg text-walnut-light leading-relaxed">
          نحتاج إلى معرفة إن كان {personName} ذكراً أو أنثى قبل المتابعة.
        </p>
        <div className="flex gap-3">
          <Button onClick={() => onPick('male')} className="flex-1">ذكر</Button>
          <Button onClick={() => onPick('female')} className="flex-1">أنثى</Button>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} className="w-full">إلغاء</Button>
      </div>
    </Modal>
  )
}

/** Confirms removing a marriage (the link only — both people stay). */
export function ConfirmRemovePartnerModal({
  isOpen,
  names,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean
  /** e.g. «محمد مصطفى و سارة» */
  names: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} maxWidth="max-w-sm">
      <div className="px-6 pt-7 pb-6 flex flex-col gap-5">
        <h3 className="font-sans text-2xl font-bold text-charcoal">هل تريد إزالة هذا الزواج؟</h3>
        <p className="font-sans text-lg text-walnut-light leading-relaxed">
          سيُزال الزواج بين {names}. لن يُحذف أي شخص.
        </p>
        <div className="flex flex-col gap-3">
          <Button variant="danger" onClick={onConfirm} className="w-full">إزالة الزواج</Button>
          <Button variant="ghost" size="sm" onClick={onCancel} className="w-full">إلغاء</Button>
        </div>
      </div>
    </Modal>
  )
}

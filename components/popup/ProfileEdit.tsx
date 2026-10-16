'use client'

import { useRef, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import type { PersonRow } from '@/lib/supabase/types'
import type { PersonFormValues } from '@/types'
import { partnersOf, type Lineage } from '@/lib/tree/lineage'

interface ProfileEditProps {
  person: PersonRow
  allPeople: PersonRow[]
  partnerships: { id: string; person_a_id: string; person_b_id: string; created_at: string }[]
  lineage: Lineage
  onSave: (personId: string, values: PersonFormValues, photoFile: File | null) => Promise<void>
  onCancel: () => void
  onDelete: (personId: string) => void
  hasConnections: boolean
  isOwner: boolean
}

export default function ProfileEdit({
  person,
  allPeople,
  partnerships,
  onSave,
  onCancel,
  onDelete,
  hasConnections,
  isOwner,
  lineage,
}: ProfileEditProps) {
  const [values, setValues] = useState<PersonFormValues>(() => ({
    name: person.name,
    nickname: person.nickname ?? '',
    birth_date: person.birth_date ?? '',
    bio: person.bio ?? '',
    photo_url: person.photo_url ?? '',
    mother_id: lineage.motherOf(person.id)?.id ?? null,
    father_id: lineage.fatherOf(person.id)?.id ?? null,
    gender: (person.gender ?? '') as 'male' | 'female' | '',
  }))
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(person.photo_url ?? null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof PersonFormValues, string>>>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = (key: keyof PersonFormValues, value: string | null) =>
    setValues(prev => ({ ...prev, [key]: value }))

  const validate = (): boolean => {
    const newErrors: typeof errors = {}
    if (!values.name.trim()) newErrors.name = 'الاسم مطلوب'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    await onSave(person.id, values, photoFile)
    setSaving(false)
  }

  const peopleById = new Map(allPeople.map(p => [p.id, p]))
  const byLabel = (a: PersonRow, b: PersonRow) => lineage.label(a).localeCompare(lineage.label(b), 'ar')
  // Always keep the current choice selectable, even if it no longer fits the
  // filter (e.g. a parent whose gender was never set).
  const withCurrent = (list: PersonRow[], id: string | null) => {
    const current = id ? peopleById.get(id) : undefined
    return current && !list.some(p => p.id === current.id) ? [current, ...list] : list
  }

  const fatherOptions = withCurrent(
    allPeople.filter(p => p.gender === 'male' && p.id !== person.id && !p.is_shortcut).sort(byLabel),
    values.father_id,
  )
  // The mother is one of the chosen father's wives; with no father chosen,
  // any woman can be picked (e.g. a child whose father isn't recorded).
  const motherOptions = withCurrent(
    (values.father_id
      ? partnersOf(values.father_id, partnerships, peopleById).filter(p => p.gender !== 'male')
      : allPeople.filter(p => p.gender === 'female' && !p.is_shortcut)
    ).filter(p => p.id !== person.id).sort(byLabel),
    values.mother_id,
  )

  const setFather = (fatherId: string | null) => {
    setValues(prev => {
      // Picking a different father clears a mother who isn't his wife.
      const wives = fatherId ? partnersOf(fatherId, partnerships, peopleById).map(p => p.id) : null
      const keepMother = !wives || (prev.mother_id !== null && wives.includes(prev.mother_id))
      return { ...prev, father_id: fatherId, mother_id: keepMother ? prev.mother_id : null }
    })
  }

  return (
    <div className="flex flex-col">

      {/* ── Photo area ── */}
      <div
        className="
          relative w-full h-44
          bg-slate-100 flex items-center justify-center
          cursor-pointer group overflow-hidden
        "
        onClick={() => fileInputRef.current?.click()}
      >
        {photoPreview ? (
          <img
            src={photoPreview}
            alt="Preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <Avatar name={values.name || person.name} size={80} />
        )}

        {/* Hover overlay */}
        <div className="
          absolute inset-0 bg-charcoal/50
          flex items-center justify-center
          opacity-0 group-hover:opacity-100
          transition-opacity duration-150
        ">
          <div className="text-center text-white">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="mx-auto mb-2">
              <path d="M14 2v24M2 14h24" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <p className="font-sans text-base font-semibold">تغيير الصورة</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />

        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
      </div>

      {/* ── Form ── */}
      <div className="px-6 pb-7 pt-2 flex flex-col gap-4">

        <Input
          label="الاسم"
          required
          value={values.name}
          onChange={e => set('name', e.target.value)}
          error={errors.name}
          placeholder="الاسم الكامل"
        />

        <Input
          label="اللقب / المعروف بـ"
          value={values.nickname}
          onChange={e => set('nickname', e.target.value)}
          placeholder="مثلاً: أبو أحمد"
        />

        <Input
          label="تاريخ الميلاد"
          value={values.birth_date}
          onChange={e => set('birth_date', e.target.value)}
          placeholder="مثلاً: 1990، حوالي 1945"
        />

        {/* Gender */}
        <div className="flex flex-col gap-1.5">
          <label className="font-sans text-base font-semibold text-charcoal">
            الجنس
          </label>
          <div className="flex gap-3">
            {(['male', 'female'] as const).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => set('gender', values.gender === g ? '' : g)}
                className={`
                  flex-1 py-4 px-3 rounded-xl font-sans text-base font-semibold
                  border-2 transition-colors duration-150
                  ${values.gender === g
                    ? 'bg-walnut text-white border-walnut'
                    : 'bg-white text-walnut-light border-slate-300 hover:border-walnut/50 hover:text-walnut'}
                `}
              >
                {g === 'male' ? 'ذكر' : 'أنثى'}
              </button>
            ))}
          </div>
        </div>

        {/* Parents — editing these rewrites the child's parent links */}
        <ParentSelect
          label="الأب"
          value={values.father_id}
          options={fatherOptions}
          labelFor={lineage.label}
          onChange={setFather}
        />
        <ParentSelect
          label="الأم"
          value={values.mother_id}
          options={motherOptions}
          labelFor={lineage.label}
          onChange={id => set('mother_id', id)}
        />

        <Textarea
          label="السيرة / الوصف"
          value={values.bio}
          onChange={e => set('bio', e.target.value)}
          placeholder="بضع كلمات عن هذا الشخص…"
          rows={3}
        />

        {/* ── Delete ── */}
        {!showDeleteConfirm ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={hasConnections || !isOwner}
            title={!isOwner ? 'فقط المالك يمكنه الحذف' : hasConnections ? 'لا يمكن الحذف — لديه أبناء' : undefined}
            className="w-full"
          >
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
              <path d="M2.5 4.5h12M6 4.5V3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v1.5M13.5 4.5l-.7 9a1 1 0 0 1-1 .9H5.2a1 1 0 0 1-1-.9l-.7-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {!isOwner ? 'فقط المالك يمكنه الحذف' : hasConnections ? 'لا يمكن الحذف — لديه أبناء' : 'حذف الشخص'}
          </Button>
        ) : (
          <div className="flex flex-col gap-3 p-4 rounded-2xl bg-red-50 border-2 border-red-200">
            <p className="font-sans text-base font-semibold text-red-700">
              حذف {person.name}؟ لا يمكن التراجع عن هذا.
            </p>
            <div className="flex gap-3">
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDelete(person.id)}
                className="flex-1"
              >
                نعم، احذف
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1"
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}

        {/* ── Save / Cancel ── */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            إلغاء
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving}>
            حفظ
          </Button>
        </div>

      </div>
    </div>
  )
}

function ParentSelect({
  label,
  value,
  options,
  labelFor,
  onChange,
}: {
  label: string
  value: string | null
  options: PersonRow[]
  labelFor: (p: PersonRow) => string
  onChange: (id: string | null) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-sans text-base font-semibold text-charcoal">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="
          w-full px-4 py-3.5 rounded-xl
          font-sans text-lg text-charcoal
          bg-white border-2 border-slate-300
          focus:outline-none focus:border-walnut focus:ring-2 focus:ring-walnut/20
          transition-colors duration-150
        "
      >
        <option value="">— غير محدد —</option>
        {options.map(p => (
          <option key={p.id} value={p.id}>
            {labelFor(p)}{p.nickname ? ` (${p.nickname})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

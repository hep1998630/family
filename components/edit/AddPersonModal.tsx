'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import { Input, Textarea } from '@/components/ui/Input'
import type { PersonRow, RootRow } from '@/lib/supabase/types'
import type { PersonFormValues } from '@/types'

type AddPersonMode = 'partner' | 'child'

interface AddPersonModalProps {
  isOpen: boolean
  mode: AddPersonMode
  relativeName: string
  currentPerson?: PersonRow | null
  allPeople?: PersonRow[]
  existingPartnerIds?: string[]
  roots?: RootRow[]
  onLinkExisting?: (personId: string) => Promise<void>
  onConfirm: (values: PersonFormValues) => Promise<void>
  onCancel: () => void
}

const EMPTY_FORM: PersonFormValues = {
  name:       '',
  nickname:   '',
  birth_date: '',
  bio:        '',
  photo_url:  '',
  mother_id:  null,
  gender:     '',
}

export default function AddPersonModal({
  isOpen,
  mode,
  relativeName,
  currentPerson,
  allPeople = [],
  existingPartnerIds = [],
  roots = [],
  onLinkExisting,
  onConfirm,
  onCancel,
}: AddPersonModalProps) {
  const [saving, setSaving] = useState(false)
  // A double tap can fire the confirm handler twice before `saving`
  // re-renders the button as disabled — this ref blocks the second call.
  const submittingRef = useRef(false)

  const [partnerTab, setPartnerTab] = useState<'existing' | 'new'>('existing')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [values, setValues] = useState<PersonFormValues>(EMPTY_FORM)
  const [nameError, setNameError] = useState('')

  const set = (key: keyof PersonFormValues, value: string | null) =>
    setValues(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    if (!isOpen) {
      setValues(EMPTY_FORM)
      setNameError('')
      setPartnerTab('existing')
      setSelectedId(null)
      setSearch('')
    }
  }, [isOpen])

  const handleCancel = () => { onCancel() }

  const handleConfirmNew = async () => {
    if (submittingRef.current) return
    if (!values.name.trim()) { setNameError('الاسم مطلوب'); return }
    setNameError('')
    submittingRef.current = true
    setSaving(true)
    try {
      await onConfirm(values)
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  const handleConfirmExisting = async () => {
    if (submittingRef.current) return
    if (!selectedId || !onLinkExisting) return
    submittingRef.current = true
    setSaving(true)
    try {
      await onLinkExisting(selectedId)
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  const rootsMap = useMemo(
    () => new Map(roots.map(r => [r.id, r.name])),
    [roots]
  )

  const eligible = useMemo(() => {
    if (!currentPerson) return []
    return allPeople.filter(p => {
      if (p.id === currentPerson.id) return false
      if (existingPartnerIds.includes(p.id)) return false
      if (p.is_shortcut) return false
      if (currentPerson.gender === 'male'   && p.gender === 'male')   return false
      if (currentPerson.gender === 'female' && p.gender === 'female') return false
      return true
    })
  }, [allPeople, currentPerson, existingPartnerIds])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return eligible
    return eligible.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.nickname?.toLowerCase().includes(q) ?? false)
    )
  }, [eligible, search])

  // ── Child mode ──────────────────────────────────────────────
  if (mode === 'child') {
    return (
      <Modal isOpen={isOpen} onClose={handleCancel} maxWidth="max-w-sm">
        <div className="px-6 pt-7 pb-6 flex flex-col gap-5">
          <div>
            <h3 className="font-sans text-2xl font-bold text-charcoal">إضافة ابن/ابنة</h3>
            <p className="font-sans text-base text-walnut-light mt-1">
              إضافة ابن/ابنة تحت {relativeName}
            </p>
          </div>
          <div className="h-0.5 bg-slate-200" />
          <div className="flex flex-col gap-4">
            <Input
              label="الاسم" required
              value={values.name}
              onChange={e => set('name', e.target.value)}
              error={nameError}
              placeholder="الاسم الكامل"
              autoFocus
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
            <GenderToggle value={values.gender} onChange={g => set('gender', g)} />
            <Textarea
              label="السيرة"
              value={values.bio}
              onChange={e => set('bio', e.target.value)}
              placeholder="وصف مختصر…"
              rows={2}
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-1">
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>إلغاء</Button>
            <Button size="sm" onClick={handleConfirmNew} loading={saving}>إضافة ابن/ابنة</Button>
          </div>
        </div>
      </Modal>
    )
  }

  // ── Partner mode ────────────────────────────────────────────
  return (
    <Modal isOpen={isOpen} onClose={handleCancel} maxWidth="max-w-sm">
      <div className="px-6 pt-7 pb-6 flex flex-col gap-5">

        {/* Header */}
        <div>
          <h3 className="font-sans text-2xl font-bold text-charcoal">إضافة شريك</h3>
          <p className="font-sans text-base text-walnut-light mt-1">
            إضافة شريك لـ {relativeName}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1.5 p-1.5 bg-slate-100 rounded-2xl">
          {(['existing', 'new'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setPartnerTab(tab)}
              className={`
                flex-1 py-4 px-3 rounded-xl font-sans text-base font-semibold
                transition-all duration-150
                ${partnerTab === tab
                  ? 'bg-white text-charcoal shadow-sm'
                  : 'text-walnut-light hover:text-walnut'}
              `}
            >
              {tab === 'existing' ? 'اختر موجوداً' : 'أضف شخصاً جديداً'}
            </button>
          ))}
        </div>

        <div className="h-0.5 bg-slate-200" />

        {/* ── Select existing tab ── */}
        {partnerTab === 'existing' && (
          <>
            <Input
              label=""
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالاسم…"
              autoFocus
            />

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="font-sans text-lg text-walnut-light">
                  {eligible.length === 0
                    ? 'لا يوجد أشخاص مؤهلون في الشجرة.'
                    : 'لا توجد نتائج لبحثك.'}
                </p>
                {eligible.length === 0 && (
                  <button
                    onClick={() => setPartnerTab('new')}
                    className="font-sans text-base font-semibold text-walnut underline hover:no-underline"
                  >
                    أضف شخصاً جديداً بدلاً من ذلك
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                {filtered.map(p => {
                  const isSelected = selectedId === p.id
                  const rootName = rootsMap.get(p.root_id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(isSelected ? null : p.id)}
                      className={`
                        flex items-center gap-3 px-4 py-4 rounded-xl text-right
                        border-2 transition-colors duration-100
                        ${isSelected
                          ? 'bg-walnut text-white border-walnut'
                          : 'border-slate-200 hover:border-walnut/40 hover:bg-slate-50'}
                      `}
                    >
                      <Avatar name={p.name} photoUrl={p.photo_url} size={38} />
                      <div className="flex-1 min-w-0">
                        <p className={`font-sans text-base font-semibold truncate ${isSelected ? 'text-white' : 'text-charcoal'}`}>
                          {p.name}
                          {p.nickname && (
                            <span className={`font-normal mr-1.5 ${isSelected ? 'text-white/70' : 'text-walnut-light'}`}>
                              ({p.nickname})
                            </span>
                          )}
                        </p>
                        {rootName && (
                          <p className={`font-sans text-sm truncate ${isSelected ? 'text-white/70' : 'text-walnut-light'}`}>
                            {rootName}
                          </p>
                        )}
                      </div>
                      {p.gender && (
                        <span className={`font-sans text-sm flex-shrink-0 font-semibold ${isSelected ? 'text-white/80' : 'text-walnut-light'}`}>
                          {p.gender === 'male' ? 'ذكر' : 'أنثى'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>إلغاء</Button>
              <Button
                size="sm"
                onClick={handleConfirmExisting}
                loading={saving}
                disabled={!selectedId}
              >
                ربط كشريك
              </Button>
            </div>
          </>
        )}

        {/* ── Add new person tab ── */}
        {partnerTab === 'new' && (
          <>
            <div className="flex flex-col gap-4">
              <Input
                label="الاسم" required
                value={values.name}
                onChange={e => set('name', e.target.value)}
                error={nameError}
                placeholder="الاسم الكامل"
                autoFocus
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
              <GenderToggle value={values.gender} onChange={g => set('gender', g)} />
              <Textarea
                label="السيرة"
                value={values.bio}
                onChange={e => set('bio', e.target.value)}
                placeholder="وصف مختصر…"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>إلغاء</Button>
              <Button size="sm" onClick={handleConfirmNew} loading={saving}>إضافة شريك</Button>
            </div>
          </>
        )}

      </div>
    </Modal>
  )
}

// ── Gender toggle ─────────────────────────────────────────────
function GenderToggle({
  value,
  onChange,
}: {
  value: 'male' | 'female' | ''
  onChange: (v: 'male' | 'female' | '') => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-sans text-base font-semibold text-charcoal">
        الجنس
      </label>
      <div className="flex gap-3">
        {(['male', 'female'] as const).map(g => (
          <button
            key={g}
            type="button"
            onClick={() => onChange(value === g ? '' : g)}
            className={`
              flex-1 py-4 px-3 rounded-xl font-sans text-base font-semibold
              border-2 transition-colors duration-150
              ${value === g
                ? 'bg-walnut text-white border-walnut'
                : 'bg-white text-walnut-light border-slate-300 hover:border-walnut/50 hover:text-walnut'}
            `}
          >
            {g === 'male' ? 'ذكر' : 'أنثى'}
          </button>
        ))}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import { Input, Select, Textarea } from '@/components/ui/Input'
import type { PersonRow, RootRow } from '@/lib/supabase/types'
import type { PersonFormValues } from '@/types'
import { matchesArabic, normalizeArabic } from '@/lib/search/arabic'

type AddPersonMode = 'partner' | 'child'

interface AddPersonModalProps {
  isOpen: boolean
  mode: AddPersonMode
  /** The person being added to, as «name fatherName». */
  relativeName: string
  currentPerson?: PersonRow | null
  allPeople?: PersonRow[]
  /** Never offered as an existing partner: current partners and close family. */
  excludedIds?: string[]
  roots?: RootRow[]
  /** «name fatherName» for any person, so same first names can be told apart. */
  labelFor?: (p: PersonRow) => string
  /** Child mode: the other parent to choose, from the current person's partners. */
  otherParent?: { role: 'mother' | 'father'; options: PersonRow[] }
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
  father_id:  null,
  gender:     '',
}

export default function AddPersonModal({
  isOpen,
  mode,
  relativeName,
  currentPerson,
  allPeople = [],
  excludedIds = [],
  roots = [],
  labelFor = p => p.name,
  otherParent,
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
  const [parentError, setParentError] = useState('')

  const set = (key: keyof PersonFormValues, value: string | null) =>
    setValues(prev => ({ ...prev, [key]: value }))

  // Partners are always the opposite gender of the person they're added to.
  const partnerGender: 'male' | 'female' | null =
    currentPerson?.gender === 'male' ? 'female'
      : currentPerson?.gender === 'female' ? 'male'
        : null

  const parentKey = otherParent?.role === 'father' ? 'father_id' : 'mother_id'
  const onlyParentId = otherParent?.options.length === 1 ? otherParent.options[0].id : null

  useEffect(() => {
    if (!isOpen) {
      setValues(EMPTY_FORM)
      setNameError('')
      setParentError('')
      setPartnerTab('existing')
      setSelectedId(null)
      setSearch('')
    } else if (onlyParentId) {
      // Preselect when there's exactly one possible other parent.
      setValues(prev => ({ ...prev, [parentKey]: prev[parentKey] ?? onlyParentId }))
    }
  }, [isOpen, onlyParentId, parentKey])

  const handleCancel = () => { onCancel() }

  const handleConfirmNew = async () => {
    if (submittingRef.current) return
    let ok = true
    if (!values.name.trim()) { setNameError('الاسم مطلوب'); ok = false } else setNameError('')
    if (mode === 'child' && otherParent && !values[parentKey]) {
      setParentError(otherParent.role === 'father' ? 'اختر الأب' : 'اختر الأم')
      ok = false
    } else setParentError('')
    if (!ok) return

    submittingRef.current = true
    setSaving(true)
    try {
      await onConfirm(mode === 'partner' && partnerGender ? { ...values, gender: partnerGender } : values)
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

  const candidates = useMemo(() => {
    if (!currentPerson) return []
    return allPeople.filter(p =>
      p.id !== currentPerson.id && !excludedIds.includes(p.id) && !p.is_shortcut)
  }, [allPeople, currentPerson, excludedIds])

  // Only the opposite gender can be linked as a partner.
  const eligible = useMemo(
    () => candidates.filter(p => partnerGender !== null && p.gender === partnerGender),
    [candidates, partnerGender]
  )
  const hiddenWithoutGender = candidates.filter(p => !p.gender).length

  const filtered = useMemo(() => {
    if (!normalizeArabic(search)) return eligible
    return eligible.filter(p => matchesArabic(labelFor(p), search) || matchesArabic(p.nickname, search))
  }, [eligible, search, labelFor])

  // ── Child mode ──────────────────────────────────────────────
  if (mode === 'child') {
    const roleLabel = otherParent?.role === 'father' ? 'الأب' : 'الأم'
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
            {otherParent && (
              <Select
                label={roleLabel}
                required
                error={parentError}
                value={values[parentKey] ?? ''}
                onChange={e => set(parentKey, e.target.value || null)}
              >
                {otherParent.options.length > 1 && <option value="">— اختر {roleLabel} —</option>}
                {otherParent.options.map(p => (
                  <option key={p.id} value={p.id}>{labelFor(p)}</option>
                ))}
              </Select>
            )}
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
          <h3 className="font-sans text-2xl font-bold text-charcoal">
            {partnerGender === 'female' ? 'إضافة زوجة' : partnerGender === 'male' ? 'إضافة زوج' : 'إضافة شريك'}
          </h3>
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
                          {labelFor(p)}
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
                    </button>
                  )
                })}
              </div>
            )}

            {hiddenWithoutGender > 0 && (
              <p className="font-sans text-sm text-walnut-light leading-relaxed">
                لا يظهر هنا من لم يُحدَّد جنسه ({hiddenWithoutGender}). يمكنك تحديد الجنس من صفحة الشخص.
              </p>
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
              {partnerGender && (
                <p className="font-sans text-base text-charcoal">
                  <span className="font-semibold">الجنس:</span> {partnerGender === 'male' ? 'ذكر' : 'أنثى'}
                </p>
              )}
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

'use client'

import { useMemo, useRef, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import FamilyRoot from '@/components/tree/FamilyRoot'
import ZoomableTree from '@/components/tree/ZoomableTree'
import { computeViewLayout } from '@/lib/tree/layout'
import { partnersOf, type Lineage } from '@/lib/tree/lineage'
import { DEPTH_OPTIONS } from '@/lib/views'
import type { SavedViewInput } from '@/hooks/useSavedViews'
import type { PersonRow, PartnershipRow, ParentChildRow, RootRow, SavedViewRow } from '@/lib/supabase/types'
import { matchesArabic, normalizeArabic } from '@/lib/search/arabic'

interface ViewBuilderProps {
  /** The view being edited; omit to create a new one. */
  view?: SavedViewRow
  /** Prefill the top person (e.g. from a person's profile). */
  initialTopPersonId?: string
  roots: RootRow[]
  people: PersonRow[]
  peopleById: Map<string, PersonRow>
  partnerships: PartnershipRow[]
  parentChildRows: ParentChildRow[]
  rootNamesById: Map<string, string>
  lineage: Lineage
  /** People or marriages added in this session that aren't saved yet. */
  isUnsaved: (id: string) => boolean
  /** Resolves to an error message, or null when saved. */
  onSave: (input: SavedViewInput) => Promise<string | null>
  onCancel: () => void
}

const noop = () => {}

/** «إنشاء عرض جديد» / «تعديل العرض»: settings on one side, a live preview of the tree on the other. */
export default function ViewBuilder({
  view,
  initialTopPersonId,
  roots,
  people,
  peopleById,
  partnerships,
  parentChildRows,
  rootNamesById,
  lineage,
  isUnsaved,
  onSave,
  onCancel,
}: ViewBuilderProps) {
  const [topId, setTopId] = useState<string | null>(view?.top_person_id ?? initialTopPersonId ?? null)
  const [depth, setDepth] = useState<number | null>(view ? view.depth : null)
  const [partnerId, setPartnerId] = useState<string>(view?.partner_id ?? '')
  const [name, setName] = useState(view?.name ?? '')
  // Until the admin types a name, it follows the chosen people.
  const [nameTouched, setNameTouched] = useState(!!view)
  const [query, setQuery] = useState('')
  const [picking, setPicking] = useState(!topId)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const top = topId ? peopleById.get(topId) : undefined
  const partners = useMemo(
    () => (topId ? partnersOf(topId, partnerships, peopleById) : []),
    [topId, partnerships, peopleById]
  )
  const partner = partners.find(p => p.id === partnerId)
  const suggestedName = top ? `ذرية ${lineage.label(top)}${partner ? ` من ${partner.name}` : ''}` : ''
  const shownName = nameTouched ? name : suggestedName

  const results = useMemo(() => {
    if (!normalizeArabic(query)) return []
    return people
      .filter(p => !p.is_shortcut && (matchesArabic(lineage.label(p), query) || matchesArabic(p.nickname, query)))
      .slice(0, 8)
  }, [query, people, lineage])

  const preview = useMemo(() => topId
    ? computeViewLayout(topId, roots, people, partnerships, parentChildRows, {
        maxDepth: depth,
        partnerFilterId: partnerId || null,
      })
    : null,
    [topId, depth, partnerId, roots, people, partnerships, parentChildRows]
  )
  const previewSize = preview ? {
    width: Math.max(...preview.layout.allNodes.map(n => n.x + 160)) + 100,
    height: Math.max(...preview.layout.allNodes.map(n => n.y + 80)) + 180,
  } : null

  const pickTop = (id: string) => {
    setTopId(id)
    setPicking(false)
    setQuery('')
    setError(null)
    // Keep the marriage only if it belongs to the new person.
    if (!partnersOf(id, partnerships, peopleById).some(p => p.id === partnerId)) setPartnerId('')
  }

  const save = async () => {
    if (savingRef.current) return
    setError(null)
    if (!top) return setError('اختر الشخص الذي يبدأ منه العرض.')
    if (!shownName.trim()) return setError('اكتب اسماً للعرض.')
    const marriage = partner && partnerships.find(ps =>
      (ps.person_a_id === top.id && ps.person_b_id === partner.id) ||
      (ps.person_b_id === top.id && ps.person_a_id === partner.id))
    if (isUnsaved(top.id) || (partner && isUnsaved(partner.id)) || (marriage && isUnsaved(marriage.id))) {
      return setError('بعض هذه البيانات لم تُحفظ بعد — اضغط «حفظ» في الأعلى أولاً، ثم احفظ العرض.')
    }
    savingRef.current = true
    setSaving(true)
    try {
      const err = await onSave({ name: shownName, top_person_id: top.id, depth, partner_id: partner?.id ?? null })
      if (err) setError(`تعذّر حفظ العرض. حاول مرة أخرى.\n${err}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-parchment" data-testid="view-builder">
      <div className="flex-shrink-0 bg-white border-b-2 border-slate-200 px-3 sm:px-5 py-3 flex items-center gap-2">
        <button
          onClick={onCancel}
          aria-label="رجوع"
          className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-walnut hover:bg-parchment"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M6.5 3L12 8l-5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="flex-1 min-w-0 font-sans text-xl sm:text-2xl font-bold text-charcoal">
          {view ? 'تعديل العرض' : 'إنشاء عرض جديد'}
        </h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row">
        {/* ── Settings ── */}
        <div className="md:w-[420px] md:flex-shrink-0 md:overflow-y-auto bg-white md:border-l-2 border-slate-200 p-4 flex flex-col gap-5">
          {/* Top person */}
          <Field label="يبدأ العرض من" htmlFor="vb-top-search">
            {top && !picking ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-walnut/30 bg-parchment">
                <Avatar name={top.name} photoUrl={top.photo_url} size={44} />
                <span className="flex-1 min-w-0">
                  <span className="block font-sans text-lg font-bold text-charcoal name-text" data-testid="vb-top">{lineage.label(top)}</span>
                  <span className="block font-sans text-sm text-walnut-light">{rootNamesById.get(top.root_id)}</span>
                </span>
                <button onClick={() => setPicking(true)} className="flex-shrink-0 h-11 px-4 rounded-xl border-2 border-walnut/30 font-sans text-base font-bold text-walnut hover:border-walnut">
                  تغيير
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  id="vb-top-search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="ابحث بالاسم…"
                  autoComplete="off"
                  className="h-12 w-full px-4 rounded-xl border-2 border-slate-200 bg-white font-sans text-lg text-charcoal focus:outline-none focus:border-walnut"
                />
                {query.trim() && results.length === 0 && (
                  <p className="font-sans text-base text-walnut-light px-1">لا توجد نتائج.</p>
                )}
                {results.length > 0 && (
                  <ul className="flex flex-col gap-2" role="listbox" aria-label="نتائج البحث">
                    {results.map(p => (
                      <li key={p.id}>
                        <button
                          role="option"
                          aria-selected={p.id === topId}
                          onClick={() => pickTop(p.id)}
                          className="w-full min-h-[56px] flex items-center gap-3 p-2.5 text-right rounded-xl border-2 border-slate-200 hover:border-walnut bg-white"
                        >
                          <Avatar name={p.name} photoUrl={p.photo_url} size={38} />
                          <span className="flex-1 min-w-0">
                            <span className="block font-sans text-base font-semibold text-charcoal name-text">{lineage.label(p)}</span>
                            <span className="block font-sans text-sm text-walnut-light">{rootNamesById.get(p.root_id)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {top && (
                  <button onClick={() => { setPicking(false); setQuery('') }} className="self-start font-sans text-base font-semibold text-walnut px-1">
                    إبقاء {lineage.label(top)}
                  </button>
                )}
              </div>
            )}
          </Field>

          {/* Depth */}
          <Field label="إلى أي جيل" as="fieldset">
            <div className="grid grid-cols-2 gap-2">
              {DEPTH_OPTIONS.map(o => (
                <button
                  key={String(o.value)}
                  role="radio"
                  aria-checked={depth === o.value}
                  onClick={() => setDepth(o.value)}
                  className={`
                    min-h-[48px] px-3 rounded-xl border-2 font-sans text-base font-bold transition-colors
                    ${depth === o.value ? 'bg-walnut border-walnut text-white' : 'bg-white border-slate-200 text-walnut-light hover:border-walnut'}
                  `}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Partner */}
          <Field label={top?.gender === 'female' ? 'من الزوج' : 'من الزوجة'} htmlFor="vb-partner">
            <select
              id="vb-partner"
              value={partner ? partnerId : ''}
              onChange={e => setPartnerId(e.target.value)}
              disabled={partners.length === 0}
              className="h-12 w-full px-3 rounded-xl border-2 border-slate-200 bg-white font-sans text-lg text-charcoal disabled:bg-parchment disabled:text-walnut-light"
            >
              <option value="">{partners.length === 0 ? (top ? 'لا يوجد أزواج مسجلون' : '—') : 'الكل'}</option>
              {partners.map(p => <option key={p.id} value={p.id}>{lineage.label(p)}</option>)}
            </select>
          </Field>

          {/* Name */}
          <Field label="اسم العرض" htmlFor="vb-name">
            <input
              id="vb-name"
              value={shownName}
              onChange={e => { setName(e.target.value); setNameTouched(true) }}
              placeholder="مثال: ذرية محمد مصطفى من تهاني"
              className="h-12 w-full px-4 rounded-xl border-2 border-slate-200 bg-white font-sans text-lg text-charcoal focus:outline-none focus:border-walnut"
            />
          </Field>

          {error && (
            <p role="alert" className="font-sans text-base text-red-700 bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 whitespace-pre-line break-words">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 h-14 rounded-xl bg-walnut text-white font-sans text-lg font-bold hover:bg-walnut-dark disabled:opacity-60"
            >
              {saving ? 'جارٍ الحفظ…' : 'حفظ العرض'}
            </button>
            <button onClick={onCancel} className="h-14 px-6 rounded-xl border-2 border-slate-200 bg-white font-sans text-lg font-semibold text-walnut-light hover:border-walnut">
              إلغاء
            </button>
          </div>
        </div>

        {/* ── Live preview ── */}
        <div className="h-[65vh] md:h-auto md:flex-1 md:min-w-0 flex-shrink-0 flex flex-col" aria-label="معاينة">
          <p className="flex-shrink-0 font-sans text-base font-bold text-walnut-light px-4 py-2 border-b-2 border-slate-200 bg-white">
            معاينة
            {preview && preview.ambiguousChildIds.length > 0 && (
              <span role="note" className="block font-normal text-sm text-amber-900">
                {preview.ambiguousChildIds.length === 1 ? 'ابن واحد' : `${preview.ambiguousChildIds.length} أبناء`} بدون والد/والدة مسجلة لن يُعرضوا: {preview.ambiguousChildIds.map(id => peopleById.get(id)?.name).join('، ')}
              </span>
            )}
          </p>
          {preview && previewSize ? (
            <ZoomableTree
              width={previewSize.width}
              height={previewSize.height}
              centerOnId={preview.layout.rootNode.person.id}
              centerKey={`builder:${topId}:${partnerId}:${depth}`}
            >
              <FamilyRoot
                layoutedRoot={preview.layout}
                isEditable={false}
                highlightedPersonId={null}
                activeNodeId={null}
                peopleById={peopleById}
                rootNamesById={rootNamesById}
                onClickPerson={noop}
                onActivateNode={noop}
                onAddPartner={noop}
                onAddChild={noop}
                onNavigateToOriginal={noop}
                onRemovePartner={noop}
              />
            </ZoomableTree>
          ) : (
            <p className="font-sans text-lg text-walnut-light text-center py-16 px-4">اختر شخصاً لتظهر المعاينة هنا.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, htmlFor, as = 'div', children }: {
  label: string
  htmlFor?: string
  as?: 'div' | 'fieldset'
  children: React.ReactNode
}) {
  if (as === 'fieldset') {
    return (
      <fieldset className="flex flex-col gap-2" role="radiogroup" aria-label={label}>
        <legend className="font-sans text-base font-bold text-charcoal mb-2">{label}</legend>
        {children}
      </fieldset>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="font-sans text-base font-bold text-charcoal">{label}</label>
      {children}
    </div>
  )
}

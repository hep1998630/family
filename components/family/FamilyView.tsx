'use client'

import { useMemo } from 'react'
import Avatar from '@/components/ui/Avatar'
import { partnersOf, type Lineage } from '@/lib/tree/lineage'
import type { PersonRow, PartnershipRow, ParentChildRow } from '@/lib/supabase/types'

interface FamilyViewProps {
  focusId: string
  founderId: string | null
  canGoBack: boolean
  isEditable: boolean
  peopleById: Map<string, PersonRow>
  partnerships: PartnershipRow[]
  parentChildRows: ParentChildRow[]
  lineage: Lineage
  onFocus: (personId: string) => void
  onBack: () => void
  onOpenProfile: (personId: string) => void
  onAddChild: (personId: string) => void
  onAddPartner: (personId: string) => void
}

/** A shortcut row stands in for a person from another branch — show the real one. */
function resolve(person: PersonRow | undefined, peopleById: Map<string, PersonRow>) {
  if (person?.is_shortcut && person.original_person_id) {
    return peopleById.get(person.original_person_id) ?? person
  }
  return person
}

function uniqueById(list: (PersonRow | undefined)[]): PersonRow[] {
  const seen = new Set<string>()
  return list.filter((p): p is PersonRow => {
    if (!p || seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

const byAge = (a: PersonRow, b: PersonRow) =>
  (a.birth_date ?? '9999').localeCompare(b.birth_date ?? '9999') ||
  a.created_at.localeCompare(b.created_at)

/**
 * Phone-first "family view": one person in focus, their parents above,
 * partners beside and children below. Tapping a relative moves the focus.
 */
export default function FamilyView({
  focusId,
  founderId,
  canGoBack,
  isEditable,
  peopleById,
  partnerships,
  parentChildRows,
  lineage,
  onFocus,
  onBack,
  onOpenProfile,
  onAddChild,
  onAddPartner,
}: FamilyViewProps) {
  const person = resolve(peopleById.get(focusId), peopleById)

  const family = useMemo(() => {
    if (!person) return null
    const parents = uniqueById(parentChildRows
      .filter(r => r.child_id === person.id)
      .map(r => resolve(peopleById.get(r.parent_id), peopleById)))
      // Father first, then mother.
      .sort((a, b) => (a.gender === 'male' ? 0 : 1) - (b.gender === 'male' ? 0 : 1))
    const partners = partnersOf(person.id, partnerships, peopleById)
    const children = uniqueById(parentChildRows
      .filter(r => r.parent_id === person.id)
      .map(r => resolve(peopleById.get(r.child_id), peopleById)))
      .sort(byAge)
    return { parents, partners, children }
  }, [person, parentChildRows, partnerships, peopleById])

  if (!person || !family) {
    return (
      <p className="font-sans text-lg text-walnut-light text-center py-16">
        لم يتم العثور على هذا الشخص.
      </p>
    )
  }

  const { parents, partners, children } = family
  // With more than one partner, say which one each child is from.
  const otherParentName = (child: PersonRow) => {
    if (partners.length < 2) return null
    const other = person.gender === 'female' ? lineage.fatherOf(child.id) : lineage.motherOf(child.id)
    return other && other.id !== person.id ? other.name : null
  }

  return (
    <div className="family-view h-full overflow-y-auto overflow-x-hidden" data-testid="family-view">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-24 flex flex-col gap-6">
        {/* ── Navigation ── */}
        <div className="flex items-center gap-3">
          <NavButton onClick={onBack} disabled={!canGoBack} label="رجوع">
            <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </NavButton>
          {founderId && (
            <NavButton onClick={() => onFocus(founderId)} disabled={founderId === person.id} label="إلى المؤسس" ariaLabel="الذهاب إلى المؤسس">
              <path d="M10 3v14M4 9l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </NavButton>
          )}
        </div>

        {/* ── Parents ── */}
        {parents.length > 0 && (
          <Section title="الوالدان">
            <div className="grid grid-cols-2 gap-3">
              {parents.map(p => (
                <RelativeCard key={p.id} person={p} label={lineage.label(p)} onClick={() => onFocus(p.id)}
                  role={p.gender === 'female' ? 'الأم' : p.gender === 'male' ? 'الأب' : 'الوالد'} />
              ))}
            </div>
            <Connector />
          </Section>
        )}

        {/* ── Person in focus + partners ── */}
        <div className="flex flex-col md:flex-row md:items-stretch gap-3">
          <div
            className={`
              family-focus flex-1 min-w-0 flex flex-col items-center gap-3 text-center
              bg-white rounded-3xl border-2 border-t-[6px] px-4 py-6 shadow-popup
              ${person.gender === 'female' ? 'border-pink-200 border-t-pink-600' : person.gender === 'male' ? 'border-blue-200 border-t-blue-600' : 'border-slate-200 border-t-slate-400'}
            `}
          >
            <Avatar name={person.name} photoUrl={person.photo_url} size={104} />
            <div className="w-full min-w-0">
              <h2 className="font-sans text-2xl font-bold text-charcoal leading-snug break-words">
                {lineage.label(person)}
              </h2>
              {person.nickname && <p className="font-sans text-lg text-walnut-light mt-1">{person.nickname}</p>}
              {person.birth_date && <p className="font-sans text-base text-walnut-light mt-1">{person.birth_date}</p>}
            </div>
            <div className="w-full flex flex-wrap justify-center gap-2 pt-1">
              <ActionButton onClick={() => onOpenProfile(person.id)} primary={!isEditable}>
                {isEditable ? 'تعديل' : 'التفاصيل'}
              </ActionButton>
              {isEditable && (
                <>
                  <ActionButton onClick={() => onAddChild(person.id)}>+ ابن/ابنة</ActionButton>
                  <ActionButton onClick={() => onAddPartner(person.id)}>+ زوج/زوجة</ActionButton>
                </>
              )}
            </div>
          </div>

          {partners.length > 0 && (
            <div className="md:w-56 flex flex-col gap-2">
              <h3 className="font-sans text-lg font-bold text-walnut-light px-1">
                {person.gender === 'female' ? (partners.length > 1 ? 'الأزواج' : 'الزوج') : (partners.length > 1 ? 'الزوجات' : 'الزوجة')}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                {partners.map(p => (
                  <RelativeCard key={p.id} person={p} label={lineage.label(p)} onClick={() => onFocus(p.id)} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Children ── */}
        <Section title={children.length > 0 ? `الأبناء (${children.length})` : 'الأبناء'}>
          {children.length > 0 && <Connector />}
          {children.length === 0 ? (
            <p className="font-sans text-lg text-walnut-light text-center py-4">لا يوجد أبناء مسجلون.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {children.map(c => (
                <RelativeCard key={c.id} person={c} label={c.name} note={otherParentName(c)} onClick={() => onFocus(c.id)} />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-sans text-lg font-bold text-walnut-light px-1">{title}</h3>
      {children}
    </section>
  )
}

function Connector() {
  return <div aria-hidden className="mx-auto h-4 w-0.5 bg-slate-300" />
}

function RelativeCard({ person, label, role, note, onClick }: {
  person: PersonRow
  label: string
  role?: string
  note?: string | null
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        min-w-0 min-h-[64px] flex items-center gap-3 p-3 text-right
        bg-white rounded-2xl border-2 border-r-[6px] shadow-card
        active:scale-[0.98] hover:border-walnut transition-all duration-150
        ${person.gender === 'female' ? 'border-pink-100 border-r-pink-500' : person.gender === 'male' ? 'border-blue-100 border-r-blue-500' : 'border-slate-200 border-r-slate-400'}
      `}
    >
      <Avatar name={person.name} photoUrl={person.photo_url} size={44} />
      <span className="flex-1 min-w-0">
        {role && <span className="block font-sans text-sm text-walnut-light leading-tight">{role}</span>}
        <span className="block font-sans text-lg font-semibold text-charcoal leading-snug break-words">{label}</span>
        {note && <span className="block font-sans text-sm text-walnut-light leading-tight truncate">من {note}</span>}
      </span>
    </button>
  )
}

function NavButton({ onClick, disabled, label, ariaLabel, children }: {
  onClick: () => void
  disabled?: boolean
  label: string
  ariaLabel?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="
        flex items-center gap-2 min-h-[48px] px-4 rounded-xl whitespace-nowrap
        bg-white border-2 border-slate-200 shadow-card
        font-sans text-base font-semibold text-walnut
        hover:border-walnut disabled:opacity-40 disabled:cursor-default disabled:hover:border-slate-200
        transition-colors duration-150
      "
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>{children}</svg>
      {label}
    </button>
  )
}

function ActionButton({ onClick, primary, children }: {
  onClick: () => void
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`
        min-h-[48px] px-5 rounded-xl font-sans text-base font-bold border-2 transition-colors duration-150
        ${primary
          ? 'bg-walnut text-white border-walnut hover:bg-walnut-dark'
          : 'bg-white text-walnut border-walnut/30 hover:border-walnut'}
      `}
    >
      {children}
    </button>
  )
}

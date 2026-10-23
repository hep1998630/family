'use client'

import Image from 'next/image'
import Avatar from '@/components/ui/Avatar'
import type { PersonRow } from '@/lib/supabase/types'

interface ProfileViewProps {
  person: PersonRow
  parentNames: string[]
  childrenNames: string[]
  motherName: string | null
}

export default function ProfileView({
  person,
  parentNames,
  childrenNames,
  motherName,
}: ProfileViewProps) {
  return (
    <div className="flex flex-col">

      {/* ── Hero photo ── */}
      <div className="relative w-full h-56 bg-slate-100 flex items-center justify-center overflow-hidden">
        {person.photo_url ? (
          <Image
            src={person.photo_url}
            alt={person.name}
            fill
            sizes="448px"
            className="object-cover"
          />
        ) : (
          <Avatar name={person.name} size={96} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
      </div>

      {/* ── Content ── */}
      <div className="relative bg-white px-6 pb-7 -mt-4 flex flex-col gap-5">

        {/* Name block */}
        <div>
          <h2 className="name-text font-sans text-2xl font-bold text-charcoal leading-tight">
            {person.name}
          </h2>
          {person.nickname && (
            <p className="font-sans text-lg text-walnut-light mt-1">
              {person.nickname}
            </p>
          )}
        </div>

        {/* Meta row */}
        {(person.birth_date || motherName) && (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {person.birth_date && (
              <MetaItem icon="calendar" label="المولد" value={person.birth_date} />
            )}
            {motherName && (
              <MetaItem icon="mother" label="الأم" value={motherName} />
            )}
          </div>
        )}

        {/* Divider */}
        {(parentNames.length > 0 || childrenNames.length > 0) && (
          <div className="h-0.5 bg-slate-200 rounded-full" />
        )}

        {/* Relationships */}
        <div className="flex flex-col gap-4">
          {parentNames.length > 0 && (
            <RelationSection label="الوالدان" names={parentNames} />
          )}
          {childrenNames.length > 0 && (
            <RelationSection label="الأبناء" names={childrenNames} />
          )}
        </div>

        {/* Bio */}
        {person.bio && (
          <>
            <div className="h-0.5 bg-slate-200 rounded-full" />
            <p className="font-sans text-lg text-charcoal leading-relaxed whitespace-pre-wrap">
              {person.bio}
            </p>
          </>
        )}

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetaItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon === 'calendar' && (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-walnut flex-shrink-0">
          <rect x="1.5" y="3" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1.5 7h15" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 1.5v3M13 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      {icon === 'mother' && (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-walnut flex-shrink-0">
          <circle cx="9" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2 17c0-3.87 3.13-7 7-7s7 3.13 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      <span className="font-sans text-base text-walnut-light">{label}:</span>
      <span className="font-sans text-base font-semibold text-charcoal">{value}</span>
    </div>
  )
}

function RelationSection({ label, names }: { label: string; names: string[] }) {
  return (
    <div>
      <p className="font-sans text-base font-bold text-walnut-light mb-2">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {names.map(name => (
          <span
            key={name}
            className="
              font-sans text-base font-medium text-charcoal
              bg-parchment border-2 border-slate-200
              px-5 py-3 rounded-xl
            "
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}

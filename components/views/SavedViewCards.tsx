import Link from 'next/link'
import Avatar from '@/components/ui/Avatar'
import { depthLabel, viewPath } from '@/lib/views'
import type { SavedViewRow } from '@/lib/supabase/types'

export interface ViewCardPerson {
  name: string
  photo_url: string | null
}

interface SavedViewCardsProps {
  views: SavedViewRow[]
  /** Top person of each view, for the avatar and subtitle. */
  personFor: (id: string) => ViewCardPerson | undefined
  /** In-app selection; without it each card is a link to the view's page. */
  onSelect?: (viewId: string) => void
  /** Section heading; pass '' for none. */
  title?: string
}

/**
 * Large one-tap cards for the saved views («عروض مختارة»). No hooks, so it
 * renders on the server (landing page) as well as inside the app.
 */
export default function SavedViewCards({ views, personFor, onSelect, title = 'عروض مختارة' }: SavedViewCardsProps) {
  if (views.length === 0) return null
  return (
    <section className="w-full flex flex-col gap-4" aria-label={title || undefined}>
      {title && <h2 className="font-sans text-2xl font-bold text-charcoal">{title}</h2>}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
        {views.map(view => {
          const top = personFor(view.top_person_id)
          const partner = view.partner_id ? personFor(view.partner_id) : undefined
          const subtitle = [
            top ? `ذرية ${top.name}${partner ? ` من ${partner.name}` : ''}` : null,
            depthLabel(view.depth),
          ].filter(Boolean).join(' · ')
          const body = (
            <>
              <Avatar name={top?.name ?? view.name} photoUrl={top?.photo_url} size={56} />
              <span className="flex-1 min-w-0">
                <span className="block font-sans text-xl font-bold text-charcoal leading-snug break-words">
                  {view.name}
                </span>
                <span className="block font-sans text-base text-walnut-light leading-snug mt-0.5 break-words">
                  {subtitle}
                </span>
              </span>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-walnut-light" aria-hidden>
                <path d="M6.5 3L13 9l-6.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )
          const className = `
            w-full min-h-[84px] flex items-center gap-4 p-4 text-right
            bg-white border-2 border-slate-200 border-r-[6px] border-r-gold rounded-2xl
            shadow-card hover:border-walnut hover:shadow-popup
            transition-all duration-150
          `
          return onSelect ? (
            <button key={view.id} onClick={() => onSelect(view.id)} className={className} data-view-card>
              {body}
            </button>
          ) : (
            <Link key={view.id} href={viewPath(view.id)} className={className} data-view-card>
              {body}
            </Link>
          )
        })}
      </div>
    </section>
  )
}

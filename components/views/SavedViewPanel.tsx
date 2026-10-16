'use client'

import FamilyRoot from '@/components/tree/FamilyRoot'
import ZoomableTree from '@/components/tree/ZoomableTree'
import ShareViewButton from '@/components/views/ShareViewButton'
import { depthLabel } from '@/lib/views'
import type { ViewLayout } from '@/lib/tree/layout'
import type { Lineage } from '@/lib/tree/lineage'
import type { PersonRow, SavedViewRow } from '@/lib/supabase/types'

interface SavedViewPanelProps {
  view: SavedViewRow
  viewLayout: ViewLayout | null
  isEditable: boolean
  peopleById: Map<string, PersonRow>
  rootNamesById: Map<string, string>
  lineage: Lineage
  highlightedPersonId: string | null
  activeNodeId: string | null
  onBackToList: () => void
  onClickPerson: (personId: string) => void
  onActivateNode: (personId: string) => void
  onAddPartner: (personId: string) => void
  onAddChild: (personId: string) => void
  onNavigateToOriginal: (personId: string) => void
  onRemovePartner: (ownerPersonId: string, refPersonId: string) => void
}

/** One saved view: its name, a share button, and its tree (zoom/fit like the full tree). */
export default function SavedViewPanel({
  view,
  viewLayout,
  isEditable,
  peopleById,
  rootNamesById,
  lineage,
  highlightedPersonId,
  activeNodeId,
  onBackToList,
  onClickPerson,
  onActivateNode,
  onAddPartner,
  onAddChild,
  onNavigateToOriginal,
  onRemovePartner,
}: SavedViewPanelProps) {
  const top = peopleById.get(view.top_person_id)
  const partner = view.partner_id ? peopleById.get(view.partner_id) : undefined
  const subtitle = [
    top ? `ذرية ${lineage.label(top)}${partner ? ` من ${lineage.label(partner)}` : ''}` : null,
    depthLabel(view.depth),
  ].filter(Boolean).join(' · ')

  const layout = viewLayout?.layout
  const ambiguous = viewLayout?.ambiguousChildIds ?? []
  const size = layout ? {
    width: Math.max(...layout.allNodes.map(n => n.x + 160)) + 100,
    height: Math.max(...layout.allNodes.map(n => n.y + 80)) + 180,
  } : null

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="saved-view">
      <div className="flex-shrink-0 bg-white border-b-2 border-slate-200 px-3 sm:px-5 py-2.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToList}
            aria-label="كل العروض"
            title="كل العروض"
            className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-walnut hover:bg-parchment"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M6.5 3L12 8l-5.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="flex-1 min-w-0 font-sans text-xl sm:text-2xl font-bold text-charcoal leading-snug break-words">{view.name}</h2>
        </div>
        <div className="flex items-center gap-3 ps-14">
          <p className="flex-1 min-w-0 font-sans text-base text-walnut-light leading-snug break-words">{subtitle}</p>
          <ShareViewButton viewId={view.id} name={view.name} />
        </div>
      </div>

      {ambiguous.length > 0 && (
        <p role="note" className="flex-shrink-0 font-sans text-sm text-amber-900 bg-amber-50 border-b-2 border-amber-200 px-4 py-2">
          {ambiguous.length === 1 ? 'ابن واحد' : `${ambiguous.length} أبناء`} بدون والد/والدة مسجلة لم يُعرضوا
          {isEditable && `: ${ambiguous.map(id => peopleById.get(id)?.name).filter(Boolean).join('، ')} — أكمل بياناتهم ليظهروا هنا.`}
        </p>
      )}

      {layout && size ? (
        <ZoomableTree width={size.width} height={size.height} centerOnId={view.top_person_id} centerKey={`view:${view.id}`}>
          <FamilyRoot
            layoutedRoot={layout}
            isEditable={isEditable}
            highlightedPersonId={highlightedPersonId}
            activeNodeId={activeNodeId}
            peopleById={peopleById}
            rootNamesById={rootNamesById}
            onClickPerson={onClickPerson}
            onActivateNode={onActivateNode}
            onAddPartner={onAddPartner}
            onAddChild={onAddChild}
            onNavigateToOriginal={onNavigateToOriginal}
            onRemovePartner={onRemovePartner}
          />
        </ZoomableTree>
      ) : (
        <p className="font-sans text-lg text-walnut-light text-center py-16">
          لم يعد هذا العرض متاحاً.
        </p>
      )}
    </div>
  )
}

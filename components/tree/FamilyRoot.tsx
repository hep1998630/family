'use client'

import PersonNode from '@/components/nodes/PersonNode'
import ShortcutNode from '@/components/nodes/ShortcutNode'
import ReferenceNode from '@/components/nodes/ReferenceNode'
import ConnectorLines from '@/components/tree/ConnectorLines'
import ShowMoreButton from '@/components/tree/ShowMoreButton'
import { NODE_HEIGHT } from '@/lib/tree/layout'
import type { LayoutedRoot } from '@/types'
import type { PersonRow } from '@/lib/supabase/types'

interface FamilyRootProps {
  layoutedRoot: LayoutedRoot
  isEditable: boolean
  highlightedPersonId: string | null
  activeNodeId: string | null
  /** All people across every branch — needed to resolve a reference/shortcut's real home branch. */
  peopleById: Map<string, PersonRow>
  /** Root id → root name — needed for the "married into X branch" label. */
  rootNamesById: Map<string, string>
  onClickPerson: (personId: string) => void
  onActivateNode: (personId: string) => void
  onAddPartner: (personId: string) => void
  onAddChild: (personId: string) => void
  onNavigateToOriginal: (originalPersonId: string) => void
  onRemovePartner: (ownerPersonId: string, refPersonId: string) => void
  onExpand: () => void
}

export default function FamilyRoot({
  layoutedRoot,
  isEditable,
  highlightedPersonId,
  activeNodeId,
  peopleById,
  rootNamesById,
  onClickPerson,
  onActivateNode,
  onAddPartner,
  onAddChild,
  onNavigateToOriginal,
  onRemovePartner,
  onExpand,
}: FamilyRootProps) {
  const { allNodes, edges, partnershipEdges } = layoutedRoot
  const currentRootId = layoutedRoot.root.id

  // Compute bounding box for SVG canvas size. The extra bottom padding
  // leaves room for a "show more generations" button under any truncated
  // node — kept generous and unconditional so it matches the scroll
  // container's own bounding-box calc in TreeApp exactly.
  const maxX = Math.max(...allNodes.map(n => n.x + 160)) + 100
  const maxY = Math.max(...allNodes.map(n => n.y + 80)) + 180

  return (
    <>
      {/* SVG connector lines layer (rendered first, behind nodes) */}
      <ConnectorLines
        edges={edges}
        partnershipEdges={partnershipEdges}
        width={maxX}
        height={maxY}
      />

      {/* Root family label */}
      <div
        style={{
          position: 'absolute',
          left: layoutedRoot.rootNode.x,
          top: layoutedRoot.rootNode.y - 32,
        }}
        className="font-serif text-xs text-walnut/40 tracking-widest uppercase select-none"
      >
        {layoutedRoot.root.name}
      </div>

      {/* Person nodes */}
      {allNodes.map((node, i) => {
        const person = node.person

        if (node.isReference) {
          return (
            <ReferenceNode
              key={`${person.id}-ref-${i}`}
              person={person}
              ownerPersonId={node.ownerPersonId ?? ''}
              x={node.x}
              y={node.y}
              isEditable={isEditable}
              isCrossBranch={person.root_id !== currentRootId}
              targetRootName={rootNamesById.get(person.root_id)}
              onNavigateToOriginal={onNavigateToOriginal}
              onRemovePartner={onRemovePartner}
            />
          )
        }

        if (person.is_shortcut) {
          const target = person.original_person_id ? peopleById.get(person.original_person_id) : undefined
          return (
            <ShortcutNode
              key={person.id}
              person={person}
              x={node.x}
              y={node.y}
              isEditable={isEditable}
              targetRootName={target ? rootNamesById.get(target.root_id) : undefined}
              onClickPerson={onClickPerson}
              onNavigateToOriginal={onNavigateToOriginal}
            />
          )
        }

        return (
          <PersonNode
            key={person.id}
            person={person}
            x={node.x}
            y={node.y}
            isEditable={isEditable}
            isHighlighted={highlightedPersonId === person.id}
            isActive={activeNodeId === person.id}
            onClickPerson={onClickPerson}
            onActivate={onActivateNode}
            onAddPartner={isEditable ? onAddPartner : undefined}
            onAddChild={isEditable ? onAddChild : undefined}
          />
        )
      })}

      {/* "Show more generations" affordance for nodes cut off by maxDepth */}
      {allNodes.filter(n => n.truncated).map(n => (
        <ShowMoreButton
          key={`more-${n.person.id}`}
          x={n.x}
          y={n.y + NODE_HEIGHT + 16}
          onClick={onExpand}
        />
      ))}
    </>
  )
}
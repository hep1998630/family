// types/index.ts

import type { PersonRow, PartnershipRow, ParentChildRow, RootRow } from '@/lib/supabase/types'

// Re-export DB row types for convenience
export type { PersonRow, PartnershipRow, ParentChildRow, RootRow }

// ── Computed tree node (after layout engine runs) ─────────────────────────────

export interface TreeNode {
  person: PersonRow
  x: number
  y: number
  /** All partners laid out horizontally beside this person */
  partners: TreeNode[]
  /** All children laid out below this person (regardless of which partner) */
  children: TreeNode[]
  /**
   * True when this node is a visual placeholder that points to the person's
   * real position elsewhere in the tree. Rendered as ReferenceNode, not PersonNode.
   */
  isReference?: boolean
  /**
   * For reference nodes: the id of the person this node is displayed beside
   * (the "owner" of the partnership). Used to locate the partnership row for removal.
   */
  ownerPersonId?: string
  /**
   * True when this node's real children exist but were not built because
   * `maxDepth` was reached — a "show more generations" affordance should
   * render here instead.
   */
  truncated?: boolean
}

// ── A fully laid-out family root ──────────────────────────────────────────────

export interface LayoutedRoot {
  root: RootRow
  /** The topmost ancestor node with the full subtree attached */
  rootNode: TreeNode
  /** Flat list of every node in this root (for rendering) */
  allNodes: TreeNode[]
  /** Every parent→child edge for drawing connector lines */
  edges: Edge[]
  /** Every partnership edge for drawing marriage lines */
  partnershipEdges: PartnershipEdge[]
}

// ── Edges for SVG connector rendering ────────────────────────────────────────

export interface Edge {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export interface PartnershipEdge {
  id: string
  personAX: number
  personAY: number
  personBX: number
  personBY: number
}

// ── UI state ──────────────────────────────────────────────────────────────────

export interface PopupState {
  isOpen: boolean
  personId: string | null
  /** 'view' in /view route, 'edit' in /edit route */
  mode: 'view' | 'edit'
}

// ── Form types ────────────────────────────────────────────────────────────────

export type PersonFormValues = {
  name: string
  nickname: string
  birth_date: string
  bio: string
  photo_url: string
  mother_id: string | null
  /** Only used by forms that set a person's parents (add child, edit profile). */
  father_id: string | null
  gender: 'male' | 'female' | ''
}
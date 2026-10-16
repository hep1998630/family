// lib/tree/layout.ts
//
// Pure layout engine: takes raw DB rows and returns fully-positioned TreeNodes.
//
// Layout rules (from design spec):
//  - Tree grows top-down
//  - Partners sit side-by-side horizontally, connected by a marriage line
//  - Multiple partners all laid out horizontally
//  - All children listed below the person regardless of which partner is their mother
//  - Children are centered under their parent group

import type { PersonRow, PartnershipRow, ParentChildRow } from '@/lib/supabase/types'
import type { TreeNode, Edge, PartnershipEdge, LayoutedRoot } from '@/types'
import type { RootRow } from '@/lib/supabase/types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const NODE_WIDTH = 150
export const NODE_HEIGHT = 160
export const H_GAP = 50    // horizontal gap between nodes on same level
export const V_GAP = 100   // vertical gap between generations
export const PARTNER_GAP = 24    // tight gap between a person and their partner(s)
export const LEAF_V_GAP = 30     // vertical gap between vertically-stacked leaf siblings
export const ROOT_OFFSET_X = 180  // base X offset between separate family roots

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Given raw DB data, compute layout for all roots.
 * Returns one LayoutedRoot per root, each with fully-positioned nodes and edges.
 */
export function computeLayout(
  roots: RootRow[],
  people: PersonRow[],
  partnerships: PartnershipRow[],
  parentChildRows: ParentChildRow[],
  maxDepth: number = Infinity,
): LayoutedRoot[] {
  // Build lookup maps
  const peopleById = new Map<string, PersonRow>(people.map(p => [p.id, p]))
  const partnerMap = buildPartnerMap(partnerships)
  const childrenMap = buildChildrenMap(parentChildRows)

  // People who appear as a child in parent_child have a natural tree position.
  // Used by buildTreeNode to decide reference vs full partner node.
  const childIdsSet = new Set(parentChildRows.map(pc => pc.child_id))

  const results: LayoutedRoot[] = []
  let canvasOffsetX = 100 // starting X for the first root

  for (const root of roots) {
    const rootPerson = findRootPerson(root.id, people, parentChildRows)

    if (!rootPerson) continue

    // Build tree recursively, starting with a temporary position
    const visited = new Set<string>()
    const rootNode = buildTreeNode(
      rootPerson,
      peopleById,
      partnerMap,
      childrenMap,
      childIdsSet,
      visited,
      0,
      maxDepth,
    )

    // Compute subtree widths bottom-up, then assign x/y positions top-down
    const subtreeWidth = computeSubtreeWidth(rootNode)
    assignPositions(rootNode, canvasOffsetX, 100, partnerMap, childrenMap, peopleById)

    // Flatten all nodes
    const allNodes = flattenTree(rootNode)

    // Build edges
    const edges = buildEdges(allNodes)
    const partnershipEdges = buildPartnershipEdges(allNodes)

    results.push({ root, rootNode, allNodes, edges, partnershipEdges })

    // Next root starts after this one with a gap
    canvasOffsetX += subtreeWidth + ROOT_OFFSET_X
  }

  return results
}

/**
 * Finds the topmost ancestor of a root: the person in this root with no
 * parent in parent_child, who is also not a shortcut. Used both by
 * computeLayout and by the branch picker (which needs a founder to show
 * without running full layout).
 */
export function findRootPerson(
  rootId: string,
  people: PersonRow[],
  parentChildRows: ParentChildRow[],
): PersonRow | undefined {
  const childIdsSet = new Set(parentChildRows.map(pc => pc.child_id))
  const rootPeople = people.filter(p => p.root_id === rootId && !p.is_shortcut)
  return rootPeople.find(p => !childIdsSet.has(p.id)) ?? rootPeople[0]
}

/**
 * Number of parent_child hops from the root person down to `personId`
 * (root person itself = depth 0). Used to make sure a search/navigation
 * target is never hidden behind a `maxDepth` cap.
 */
export function computeDepthFromRoot(
  personId: string,
  parentChildRows: ParentChildRow[],
): number {
  const childToParent = new Map(parentChildRows.map(pc => [pc.child_id, pc.parent_id]))
  let depth = 0
  let current = personId
  const seen = new Set<string>()
  while (childToParent.has(current) && !seen.has(current)) {
    seen.add(current)
    current = childToParent.get(current)!
    depth++
  }
  return depth
}

// ── Tree building ─────────────────────────────────────────────────────────────

function buildTreeNode(
  person: PersonRow,
  peopleById: Map<string, PersonRow>,
  partnerMap: Map<string, string[]>,
  childrenMap: Map<string, string[]>,
  childIdsSet: Set<string>,
  visited: Set<string>,
  depth: number,
  maxDepth: number,
): TreeNode {
  visited.add(person.id)

  // Build partner nodes (laid out horizontally, never recursed into)
  const partnerIds = partnerMap.get(person.id) ?? []
  const partnerNodes: TreeNode[] = []
  for (const pid of partnerIds) {
    const p = peopleById.get(pid)
    if (!p) continue

    if (childIdsSet.has(p.id) || visited.has(p.id)) {
      // This person is someone's child (has a natural parent-child position in the tree),
      // or was already placed during this traversal.
      // Either way, they appear in their own spot — show a reference node here instead
      // of claiming them as a full partner and losing their original position.
      partnerNodes.push({ person: p, x: 0, y: 0, partners: [], children: [], isReference: true, ownerPersonId: person.id })
    } else if (p.root_id !== person.root_id && !p.is_shortcut) {
      // Real person from a different family — they will have their own full node
      // in their own root. Show a reference node here instead of duplicating.
      partnerNodes.push({ person: p, x: 0, y: 0, partners: [], children: [], isReference: true, ownerPersonId: person.id })
    } else {
      // Genuinely unplaced partner (new person, no parent, same family): place normally.
      visited.add(p.id)
      partnerNodes.push({ person: p, x: 0, y: 0, partners: [], children: [] })
    }
  }

  // Build children nodes recursively.
  // Include children of same-root partners so that a child added through
  // the mother (parent_child.parent_id = mother.id) still appears under
  // the original/father node rather than going orphaned.
  const ownChildIds = childrenMap.get(person.id) ?? []
  const partnerChildIds = partnerNodes
    .filter(pn => !pn.isReference && pn.person.root_id === person.root_id)
    .flatMap(pn => childrenMap.get(pn.person.id) ?? [])
  const allChildIds = [...new Set([...ownChildIds, ...partnerChildIds])]

  // A child is linked to both parents, so it can be reached from either one.
  // Only draw it in its own branch (a mother who married in from another
  // family must not pull her children into her birth family's tree), and
  // only once (the visited check below runs per child, right before it is
  // built, so a sibling's subtree that already placed it wins).
  const unvisitedChildren = allChildIds
    .map(cid => peopleById.get(cid))
    .filter((p): p is PersonRow => !!p && !visited.has(p.id) && p.root_id === person.root_id)

  // Depth cap reached and there's real children below: stop recursing and
  // flag this node so the UI can offer a "show more generations" action
  // instead of silently dropping people from the tree.
  const truncated = unvisitedChildren.length > 0 && depth >= maxDepth

  const childNodes: TreeNode[] = []
  if (!truncated) {
    for (const p of unvisitedChildren) {
      if (visited.has(p.id)) continue
      childNodes.push(
        buildTreeNode(p, peopleById, partnerMap, childrenMap, childIdsSet, visited, depth + 1, maxDepth)
      )
    }
  }

  return { person, x: 0, y: 0, partners: partnerNodes, children: childNodes, truncated }
}

// ── Width computation (bottom-up) ─────────────────────────────────────────────

function computeSubtreeWidth(node: TreeNode): number {
  // Width of the couple group: person + all partners
  const coupleCount = 1 + node.partners.length
  const coupleWidth = coupleCount * NODE_WIDTH + (coupleCount - 1) * PARTNER_GAP

  if (node.children.length === 0) return coupleWidth

  // If all children are leaf nodes (no grandchildren), they stack vertically —
  // no horizontal expansion needed, just the widest child couple.
  const allChildrenAreLeaves = node.children.every(c => c.children.length === 0)
  if (allChildrenAreLeaves) {
    const maxChildCoupleWidth = Math.max(...node.children.map(c => {
      const cc = 1 + c.partners.length
      return cc * NODE_WIDTH + (cc - 1) * PARTNER_GAP
    }))
    return Math.max(coupleWidth, maxChildCoupleWidth)
  }

  // Width of all children subtrees (normal horizontal layout)
  const childrenTotalWidth = node.children.reduce((sum, child) => {
    return sum + computeSubtreeWidth(child)
  }, 0) + (node.children.length - 1) * H_GAP

  return Math.max(coupleWidth, childrenTotalWidth)
}

// ── Position assignment (top-down) ────────────────────────────────────────────

function assignPositions(
  node: TreeNode,
  x: number,
  y: number,
  partnerMap: Map<string, string[]>,
  childrenMap: Map<string, string[]>,
  peopleById: Map<string, PersonRow>,
): void {
  const coupleCount = 1 + node.partners.length
  const coupleWidth = coupleCount * NODE_WIDTH + (coupleCount - 1) * PARTNER_GAP

  // Center the couple within the allocated subtree space so that children
  // (which may be wider than the couple) don't bleed into sibling territory.
  const subtreeW = computeSubtreeWidth(node)
  const coupleX = x + Math.max(0, subtreeW - coupleWidth) / 2

  // Place the main person
  node.x = coupleX
  node.y = y

  // Place partners immediately to the right
  let partnerX = coupleX + NODE_WIDTH + PARTNER_GAP
  for (const partner of node.partners) {
    partner.x = partnerX
    partner.y = y
    partnerX += NODE_WIDTH + PARTNER_GAP
  }

  if (node.children.length === 0) return

  const coupleMidX = coupleX + coupleWidth / 2
  const childY = y + NODE_HEIGHT + V_GAP

  // If all children are leaf nodes, stack them vertically to reduce horizontal sprawl
  const allChildrenAreLeaves = node.children.every(c => c.children.length === 0)
  if (allChildrenAreLeaves) {
    const maxChildCoupleWidth = Math.max(...node.children.map(c => {
      const cc = 1 + c.partners.length
      return cc * NODE_WIDTH + (cc - 1) * PARTNER_GAP
    }))
    const stackLeft = coupleMidX - maxChildCoupleWidth / 2
    let stackY = childY
    for (const child of node.children) {
      assignPositions(child, stackLeft, stackY, partnerMap, childrenMap, peopleById)
      stackY += NODE_HEIGHT + LEAF_V_GAP
    }
    return
  }

  // Normal horizontal layout for children who have their own children
  const childrenWidths = node.children.map(computeSubtreeWidth)
  const totalChildrenWidth =
    childrenWidths.reduce((a, b) => a + b, 0) +
    (node.children.length - 1) * H_GAP

  let childX = coupleMidX - totalChildrenWidth / 2

  for (let i = 0; i < node.children.length; i++) {
    assignPositions(node.children[i], childX, childY, partnerMap, childrenMap, peopleById)
    childX += childrenWidths[i] + H_GAP
  }
}

// ── Flatten ───────────────────────────────────────────────────────────────────

export function flattenTree(node: TreeNode, result: TreeNode[] = []): TreeNode[] {
  result.push(node)
  for (const p of node.partners) result.push(p)
  for (const c of node.children) flattenTree(c, result)
  return result
}

// ── Edge building ─────────────────────────────────────────────────────────────

function buildEdges(nodes: TreeNode[]): Edge[] {
  const edges: Edge[] = []
  const nodeById = new Map(nodes.map(n => [n.person.id, n]))

  for (const node of nodes) {
    for (const child of node.children) {
      edges.push({
        id: `${node.person.id}->${child.person.id}`,
        fromX: node.x + NODE_WIDTH / 2,
        fromY: node.y + NODE_HEIGHT,
        toX: child.x + NODE_WIDTH / 2,
        toY: child.y,
      })
    }
  }

  return edges
}

function buildPartnershipEdges(nodes: TreeNode[]): PartnershipEdge[] {
  const edges: PartnershipEdge[] = []

  for (const node of nodes) {
    for (const partner of node.partners) {
      edges.push({
        id: `${node.person.id}--${partner.person.id}`,
        personAX: node.x + NODE_WIDTH,
        personAY: node.y + NODE_HEIGHT / 2,
        personBX: partner.x,
        personBY: partner.y + NODE_HEIGHT / 2,
      })
    }
  }

  return edges
}

// ── Helper maps ───────────────────────────────────────────────────────────────

function buildPartnerMap(partnerships: PartnershipRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const ps of partnerships) {
    if (!map.has(ps.person_a_id)) map.set(ps.person_a_id, [])
    if (!map.has(ps.person_b_id)) map.set(ps.person_b_id, [])
    map.get(ps.person_a_id)!.push(ps.person_b_id)
    map.get(ps.person_b_id)!.push(ps.person_a_id)
  }
  return map
}

function buildChildrenMap(parentChild: ParentChildRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const pc of parentChild) {
    if (!map.has(pc.parent_id)) map.set(pc.parent_id, [])
    map.get(pc.parent_id)!.push(pc.child_id)
  }
  return map
}
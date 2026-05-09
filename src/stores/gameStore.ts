import { writable, derived, get } from 'svelte/store'

// ---- Types ----

export type ToolMode = 'portal' | 'link' | 'delete'

export interface Portal {
  id: string
  x: number
  y: number
  label: string
}

export interface Agent {
  id: string
  name: string
  linkCount: number
  fieldCount: number
  ap: number
}

export type Link = [sourceId: string, targetId: string, agentId: string]
export type Field = [p1Id: string, p2Id: string, p3Id: string, agentId: string]

export interface GameState {
  mode: ToolMode
  portals: Portal[]
  agents: Agent[]
  selectedAgentId: string | null
  links: Link[]
  fields: Field[]
  pendingLinkPortalId: string | null
}

// ---- Helper functions ----

function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

function segmentsIntersect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  q1: { x: number; y: number },
  q2: { x: number; y: number }
): boolean {
  function orient(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  }
  const o1 = orient(p1, p2, q1)
  const o2 = orient(p1, p2, q2)
  const o3 = orient(q1, q2, p1)
  const o4 = orient(q1, q2, p2)
  if (o1 * o2 < 0 && o3 * o4 < 0) return true
  return false
}

function wouldCrossLink(
  portals: Portal[],
  links: Link[],
  aId: string,
  bId: string
): boolean {
  const getPortal = (id: string) => portals.find(p => p.id === id)!
  const pa = getPortal(aId)
  const pb = getPortal(bId)

  for (const [sId, tId] of links) {
    if (sId === aId && tId === bId) return false
    if (sId === bId && tId === aId) return false
    if (sId === aId || sId === bId || tId === aId || tId === bId) continue
    const ps = getPortal(sId)
    const pt = getPortal(tId)
    if (segmentsIntersect(pa, pb, ps, pt)) return true
  }
  return false
}

function detectNewFields(
  state: GameState,
  agentId: string,
  aId: string,
  bId: string
): Field[] {
  const newFields: Field[] = []
  const existingFieldSet = new Set(
    state.fields.map(f => [f[0], f[1], f[2]].sort().join(','))
  )
  const linkSet = new Set(
    state.links.map(l => sortPair(l[0], l[1]).join(','))
  )
  const connectedToA = new Set<string>()
  const connectedToB = new Set<string>()
  for (const [s, t] of state.links) {
    if (s === aId) connectedToA.add(t)
    if (t === aId) connectedToA.add(s)
    if (s === bId) connectedToB.add(t)
    if (t === bId) connectedToB.add(s)
  }
  for (const cId of connectedToA) {
    if (cId === bId) continue
    if (connectedToB.has(cId)) {
      if (
        linkSet.has(sortPair(aId, cId).join(',')) &&
        linkSet.has(sortPair(bId, cId).join(','))
      ) {
        const triIds = [aId, bId, cId].sort().join(',')
        if (!existingFieldSet.has(triIds)) {
          newFields.push([aId, bId, cId, agentId])
          existingFieldSet.add(triIds)
        }
      }
    }
  }
  return newFields
}

// ---- Store ----

function createGameStore() {
  const { subscribe, update, set } = writable<GameState>({
    mode: 'portal',
    portals: [],
    agents: [],
    selectedAgentId: null,
    links: [],
    fields: [],
    pendingLinkPortalId: null,
  })

  const selectedAgent = derived({ subscribe }, $state => {
    if (!$state.selectedAgentId) return null
    return $state.agents.find(a => a.id === $state.selectedAgentId) ?? null
  })

  // ---- Actions ----

  function setMode(mode: ToolMode) {
    update(s => ({ ...s, mode, pendingLinkPortalId: null }))
  }

  function addAgent(name: string) {
    update(s => {
      if (s.agents.length >= 16) return s
      const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      return { ...s, agents: [...s.agents, { id, name, linkCount: 0, fieldCount: 0, ap: 0 }] }
    })
  }

  function selectAgent(id: string | null) {
    update(s => ({ ...s, selectedAgentId: id }))
  }

  function addPortal(x: number, y: number) {
    update(s => {
      const num = s.portals.length + 1
      const id = `portal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      return {
        ...s,
        portals: [...s.portals, { id, x, y, label: `P${num}` }],
        pendingLinkPortalId: null,
      }
    })
  }

  function handleLinkClick(portalId: string) {
    update(s => {
      const agent = s.selectedAgentId
      if (!agent) {
        alert('Please select an Agent first')
        return { ...s, pendingLinkPortalId: null }
      }
      if (s.pendingLinkPortalId === null) {
        return { ...s, pendingLinkPortalId: portalId }
      }
      const srcId = s.pendingLinkPortalId
      const tgtId = portalId
      if (srcId === tgtId) return { ...s, pendingLinkPortalId: null }

      const existingLink = s.links.find(
        ([a, b]) => (a === srcId && b === tgtId) || (a === tgtId && b === srcId)
      )
      if (existingLink) {
        alert('Link already exists between these portals')
        return { ...s, pendingLinkPortalId: null }
      }
      if (wouldCrossLink(s.portals, s.links, srcId, tgtId)) {
        alert('Link would cross an existing link!')
        return { ...s, pendingLinkPortalId: null }
      }

      const newLink: Link = [srcId, tgtId, agent]
      const newFields = detectNewFields(s, agent, srcId, tgtId)

      const newAgents = s.agents.map(a => {
        if (a.id !== agent) return a
        let { linkCount, fieldCount, ap } = a
        linkCount += 1
        ap += 313
        for (const _ of newFields) {
          fieldCount += 1
          ap += 1250
        }
        return { ...a, linkCount, fieldCount, ap }
      })

      return { ...s, links: [...s.links, newLink], fields: [...s.fields, ...newFields], agents: newAgents, pendingLinkPortalId: null }
    })
  }

  function deletePortal(portalId: string) {
    update(s => {
      const portal = s.portals.find(p => p.id === portalId)
      if (!portal) return s

      const linksToRemove = s.links.filter(([a, b]) => a === portalId || b === portalId)
      const fieldsToRemove = s.fields.filter(f => f[0] === portalId || f[1] === portalId || f[2] === portalId)

      const agentChanges = new Map<string, { linkDelta: number; fieldDelta: number; apDelta: number }>()
      for (const [, , agentId] of linksToRemove) {
        const ch = agentChanges.get(agentId) ?? { linkDelta: 0, fieldDelta: 0, apDelta: 0 }
        ch.linkDelta -= 1; ch.apDelta -= 313
        agentChanges.set(agentId, ch)
      }
      for (const [, , , agentId] of fieldsToRemove) {
        const ch = agentChanges.get(agentId) ?? { linkDelta: 0, fieldDelta: 0, apDelta: 0 }
        ch.fieldDelta -= 1; ch.apDelta -= 1250
        agentChanges.set(agentId, ch)
      }

      const newAgents = s.agents.map(a => {
        const ch = agentChanges.get(a.id)
        if (!ch) return a
        return { ...a, linkCount: Math.max(0, a.linkCount + ch.linkDelta), fieldCount: Math.max(0, a.fieldCount + ch.fieldDelta), ap: Math.max(0, a.ap + ch.apDelta) }
      })

      return {
        ...s,
        portals: s.portals.filter(p => p.id !== portalId),
        links: s.links.filter(([a, b]) => !(a === portalId || b === portalId)),
        fields: s.fields.filter(f => !fieldsToRemove.includes(f)),
        agents: newAgents,
        pendingLinkPortalId: null,
      }
    })
  }

  function deleteLink(linkIdx: number) {
    update(s => {
      if (linkIdx < 0 || linkIdx >= s.links.length) return s
      const link = s.links[linkIdx]
      const linkKey = sortPair(link[0], link[1]).join(',')
      const fieldsToRemove = s.fields.filter(f => {
        const triKeys = [sortPair(f[0], f[1]).join(','), sortPair(f[1], f[2]).join(','), sortPair(f[0], f[2]).join(',')]
        return triKeys.includes(linkKey)
      })

      const newLinks = s.links.filter((_, i) => i !== linkIdx)
      const newFields = s.fields.filter(f => !fieldsToRemove.includes(f))

      const agentChanges = new Map<string, { linkDelta: number; fieldDelta: number; apDelta: number }>()
      const [, , linkAgentId] = link
      const lc = agentChanges.get(linkAgentId) ?? { linkDelta: 0, fieldDelta: 0, apDelta: 0 }
      lc.linkDelta -= 1; lc.apDelta -= 313
      agentChanges.set(linkAgentId, lc)
      for (const [, , , fAgentId] of fieldsToRemove) {
        const fc = agentChanges.get(fAgentId) ?? { linkDelta: 0, fieldDelta: 0, apDelta: 0 }
        fc.fieldDelta -= 1; fc.apDelta -= 1250
        agentChanges.set(fAgentId, fc)
      }

      const newAgents = s.agents.map(a => {
        const ch = agentChanges.get(a.id)
        if (!ch) return a
        return { ...a, linkCount: Math.max(0, a.linkCount + ch.linkDelta), fieldCount: Math.max(0, a.fieldCount + ch.fieldDelta), ap: Math.max(0, a.ap + ch.apDelta) }
      })

      return { ...s, links: newLinks, fields: newFields, agents: newAgents, pendingLinkPortalId: null }
    })
  }

  function findLinkAt(cx: number, cy: number, portals: Portal[], links: Link[], threshold = 8): number {
    for (let i = 0; i < links.length; i++) {
      const [aId, bId] = links[i]
      const pa = portals.find(p => p.id === aId)
      const pb = portals.find(p => p.id === bId)
      if (!pa || !pb) continue
      const dist = pointToSegmentDist(cx, cy, pa.x, pa.y, pb.x, pb.y)
      if (dist <= threshold) return i
    }
    return -1
  }

  function findPortalAt(cx: number, cy: number, portals: Portal[], radius = 16): string | null {
    for (const p of portals) {
      const dx = cx - p.x
      const dy = cy - p.y
      if (dx * dx + dy * dy <= radius * radius) return p.id
    }
    return null
  }

  function handleCanvasClick(cx: number, cy: number) {
    const state = get({ subscribe })
    switch (state.mode) {
      case 'portal':
        addPortal(cx, cy)
        break
      case 'link': {
        const portalId = findPortalAt(cx, cy, state.portals)
        if (portalId) handleLinkClick(portalId)
        else update(s => ({ ...s, pendingLinkPortalId: null }))
        break
      }
      case 'delete': {
        const portalId = findPortalAt(cx, cy, state.portals)
        if (portalId) {
          deletePortal(portalId)
          return
        }
        const linkIdx = findLinkAt(cx, cy, state.portals, state.links)
        if (linkIdx >= 0) deleteLink(linkIdx)
        break
      }
    }
  }

  function clearAllPortals() {
    update(s => ({
      ...s,
      portals: [],
      links: [],
      fields: [],
      pendingLinkPortalId: null,
      agents: s.agents.map(a => ({ ...a, linkCount: 0, fieldCount: 0, ap: 0 })),
    }))
  }

  function clearAllLinks() {
    update(s => ({
      ...s,
      links: [],
      fields: [],
      pendingLinkPortalId: null,
      agents: s.agents.map(a => ({ ...a, linkCount: 0, fieldCount: 0, ap: 0 })),
    }))
  }

  function getState(): GameState {
    return get({ subscribe })
  }

  return {
    subscribe, set, selectedAgent, getState,
    setMode, addAgent, selectAgent, addPortal,
    handleLinkClick, handleCanvasClick,
    deletePortal, deleteLink,
    findPortalAt, findLinkAt,
    clearAllPortals, clearAllLinks,
  }
}

export const gameStore = createGameStore()

function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

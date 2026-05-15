import { writable, derived, get } from 'svelte/store'
import { computeScores } from './scoringRules'

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
  score: number
}

export type Link = [sourceId: string, targetId: string, agentId: string]
export type Field = [p1Id: string, p2Id: string, p3Id: string, agentId: string, linkAgents?: [string, string, string]]

export interface TimelineEntry {
  id: string
  srcId: string
  tgtId: string
  agentId: string
  fieldsCreated: Field[]
}

export interface GameState {
  mode: ToolMode
  portals: Portal[]
  agents: Agent[]
  selectedAgentId: string | null
  links: Link[]
  fields: Field[]
  pendingLinkPortalId: string | null
  portalSource: 'manual' | 'imported'
  importedPortalTitles: Map<string, string>
  timelineEntries: TimelineEntry[]
  timelineStep: number
  isPlaying: boolean
  playSpeed: number
  scoringRuleId: string | null
  _fitViewNonce: number
}

export interface ToastMessage {
  id: string
  text: string
  type: 'info' | 'warning' | 'error' | 'success'
}

export const MIN_PORTAL_DISTANCE = 30
export const MAX_LINKS_PER_PORTAL = 40
export const LINK_WARNING_THRESHOLD = 8

export const AGENT_COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff',
  '#9a6324', '#fffac8', '#800000', '#aaffc3',
]

export function getAgentColor(agentId: string, agents: Array<{ id: string }>): string {
  const idx = agents.findIndex(a => a.id === agentId)
  return AGENT_COLORS[Math.max(0, idx) % AGENT_COLORS.length]
}

// ---- Toast Store ----

function createToastStore() {
  const { subscribe, update } = writable<ToastMessage[]>([])

  function add(text: string, type: ToastMessage['type'] = 'info') {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    update(messages => [...messages, { id, text, type }])
    // Auto-remove after 3 seconds
    setTimeout(() => {
      update(messages => messages.filter(m => m.id !== id))
    }, 3000)
  }

  return { subscribe, add }
}

export const toastStore = createToastStore()

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

let playTimer: ReturnType<typeof setTimeout> | null = null

function createGameStore() {
  const { subscribe, update, set } = writable<GameState>({
    mode: 'portal',
    portals: [],
    agents: [{ id: 'agent-default', name: 'Agent01', linkCount: 0, fieldCount: 0, ap: 0, score: 0 }],
    selectedAgentId: 'agent-default',
    links: [],
    fields: [],
    pendingLinkPortalId: null,
    portalSource: 'manual',
    importedPortalTitles: new Map(),
    timelineEntries: [],
    timelineStep: 0,
    isPlaying: false,
    playSpeed: 1000,
    scoringRuleId: null,
    _fitViewNonce: 0,
  })

  const selectedAgent = derived({ subscribe }, $state => {
    if (!$state.selectedAgentId) return null
    return $state.agents.find(a => a.id === $state.selectedAgentId) ?? null
  })

  function applyScores(s: GameState): GameState {
    const scoreMap = computeScores({ links: s.links, fields: s.fields, agents: s.agents }, s.scoringRuleId)
    return { ...s, agents: s.agents.map(a => ({ ...a, score: scoreMap.get(a.id) ?? 0 })) }
  }

  function rebuildFromTimeline(entries: TimelineEntry[], step: number, agents: Agent[], scoringRuleId: string | null): { links: Link[]; fields: Field[]; agents: Agent[] } {
    const slice = entries.slice(0, step)
    const links: Link[] = slice.map(e => [e.srcId, e.tgtId, e.agentId])
    const fields: Field[] = slice.flatMap(e => e.fieldsCreated)

    const stats = new Map<string, { linkCount: number; fieldCount: number; ap: number }>()
    for (const e of slice) {
      const s = stats.get(e.agentId) ?? { linkCount: 0, fieldCount: 0, ap: 0 }
      s.linkCount += 1
      s.ap += 313
      s.fieldCount += e.fieldsCreated.length
      s.ap += e.fieldsCreated.length * 1250
      stats.set(e.agentId, s)
    }

    const scoreMap = computeScores({ links, fields, agents }, scoringRuleId)

    const newAgents = agents.map(a => {
      const s = stats.get(a.id)
      if (!s) return { ...a, linkCount: 0, fieldCount: 0, ap: 0, score: scoreMap.get(a.id) ?? 0 }
      return { ...a, ...s, score: scoreMap.get(a.id) ?? 0 }
    })

    return { links, fields, agents: newAgents }
  }

  // ---- Actions ----

  function setMode(mode: ToolMode) {
    update(s => ({ ...s, mode, pendingLinkPortalId: null }))
  }

  function addAgent(name: string) {
    update(s => {
      if (s.agents.length >= 16) return s
      const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      return { ...s, agents: [...s.agents, { id, name, linkCount: 0, fieldCount: 0, ap: 0, score: 0 }] }
    })
  }

  function selectAgent(id: string | null) {
    update(s => ({ ...s, selectedAgentId: id }))
  }

  function renameAgent(id: string, newName: string): { ok: boolean; error?: string } {
    const trimmed = newName.trim()
    if (trimmed.length === 0) return { ok: false, error: 'Name cannot be empty' }
    if (trimmed.length > 32) return { ok: false, error: 'Name cannot exceed 32 characters' }
    if (/[\\\/"'\x00-\x1f]/.test(trimmed)) return { ok: false, error: 'Name contains invalid characters' }

    let finalName = trimmed
    update(s => {
      const others = s.agents.filter(a => a.id !== id).map(a => a.name)
      if (others.includes(finalName)) {
        let suffix = 2
        while (others.includes(`${finalName}#${suffix}`)) suffix++
        finalName = `${finalName}#${suffix}`
      }
      return {
        ...s,
        agents: s.agents.map(a => a.id === id ? { ...a, name: finalName } : a),
      }
    })
    return { ok: true }
  }

  function addPortal(x: number, y: number) {
    update(s => {
      const num = s.portals.length + 1
      const id = `portal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      return { ...s, portals: [...s.portals, { id, x, y, label: `P${num}` }], pendingLinkPortalId: null }
    })
  }

  function handleLinkClick(portalId: string) {
    update(s => {
      const agent = s.selectedAgentId
      if (!agent) {
        toastStore.add('Please select an Agent first', 'warning')
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
        toastStore.add('Link already exists between these portals', 'warning')
        return { ...s, pendingLinkPortalId: null }
      }
      if (wouldCrossLink(s.portals, s.links, srcId, tgtId)) {
        toastStore.add('Link would cross an existing link!', 'error')
        return { ...s, pendingLinkPortalId: null }
      }

      const srcOut = s.links.filter(l => l[0] === srcId).length
      if (srcOut >= MAX_LINKS_PER_PORTAL) {
        const label = s.portalSource === 'imported' ? (s.importedPortalTitles.get(srcId) ?? srcId) : (s.portals.find(p => p.id === srcId)?.label ?? srcId)
        toastStore.add(`${label} has reached the maximum of ${MAX_LINKS_PER_PORTAL} outbound links!`, 'error')
        return { ...s, pendingLinkPortalId: null }
      }

      const newLink: Link = [srcId, tgtId, agent]
      const newFields = detectNewFields(s, agent, srcId, tgtId)

      const linksWithNew = [...s.links, newLink]
      const linkAgentLookup = new Map<string, string>()
      for (const [a, b, aId] of linksWithNew) {
        linkAgentLookup.set(sortPair(a, b).join(','), aId)
      }
      const enrichedFields: Field[] = newFields.map(f => {
        const [p1, p2, p3, fAgent] = f
        const la = linkAgentLookup.get(sortPair(p1, p2).join(',')) ?? fAgent
        const lb = linkAgentLookup.get(sortPair(p2, p3).join(',')) ?? fAgent
        const lc = linkAgentLookup.get(sortPair(p1, p3).join(',')) ?? fAgent
        return [p1, p2, p3, fAgent, [la, lb, lc]]
      })

      const newAgents = s.agents.map(a => {
        if (a.id !== agent) return a
        let { linkCount, fieldCount, ap } = a
        linkCount += 1
        ap += 313
        for (const _ of enrichedFields) {
          fieldCount += 1
          ap += 1250
        }
        return { ...a, linkCount, fieldCount, ap }
      })

      const truncatedEntries = s.timelineEntries.slice(0, s.timelineStep)
      const newEntry: TimelineEntry = {
        id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        srcId,
        tgtId,
        agentId: agent,
        fieldsCreated: enrichedFields,
      }

      const updated: GameState = {
        ...s,
        links: [...s.links, newLink],
        fields: [...s.fields, ...enrichedFields],
        agents: newAgents,
        pendingLinkPortalId: null,
        timelineEntries: [...truncatedEntries, newEntry],
        timelineStep: truncatedEntries.length + 1,
      }
      return applyScores(updated)
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

      const newEntries = s.timelineEntries.filter(e => e.srcId !== portalId && e.tgtId !== portalId)
      const newStep = Math.min(s.timelineStep, newEntries.length)

      const updated: GameState = {
        ...s,
        portals: s.portals.filter(p => p.id !== portalId),
        links: s.links.filter(([a, b]) => !(a === portalId || b === portalId)),
        fields: s.fields.filter(f => !fieldsToRemove.includes(f)),
        agents: newAgents,
        pendingLinkPortalId: null,
        timelineEntries: newEntries,
        timelineStep: newStep,
      }
      return applyScores(updated)
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

      const newEntries = s.timelineEntries.filter((_, i) => i !== linkIdx)
      const newStep = Math.min(s.timelineStep, newEntries.length)

      const updated: GameState = { ...s, links: newLinks, fields: newFields, agents: newAgents, pendingLinkPortalId: null, timelineEntries: newEntries, timelineStep: newStep }
      return applyScores(updated)
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
    let best: string | null = null
    let bestDistSq = radius * radius
    for (const p of portals) {
      const dx = cx - p.x
      const dy = cy - p.y
      const distSq = dx * dx + dy * dy
      if (distSq <= bestDistSq) {
        bestDistSq = distSq
        best = p.id
      }
    }
    return best
  }

  function handleCanvasClick(cx: number, cy: number) {
    const state = get({ subscribe })
    switch (state.mode) {
      case 'portal': {
        if (state.portalSource === 'imported') {
          toastStore.add('Cannot add portals when using imported data', 'warning')
          return
        }
        const tooClose = state.portals.some(p => Math.hypot(cx - p.x, cy - p.y) < MIN_PORTAL_DISTANCE)
        if (tooClose) {
          toastStore.add('Too close to an existing portal!', 'error')
          return
        }
        addPortal(cx, cy)
        break
      }
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
    if (playTimer) { clearTimeout(playTimer); playTimer = null }
    update(s => ({
      ...s,
      portals: [],
      links: [],
      fields: [],
      pendingLinkPortalId: null,
      portalSource: 'manual',
      importedPortalTitles: new Map(),
      agents: s.agents.map(a => ({ ...a, linkCount: 0, fieldCount: 0, ap: 0, score: 0 })),
      timelineEntries: [],
      timelineStep: 0,
      isPlaying: false,
    }))
  }

  function clearAllLinks() {
    if (playTimer) { clearTimeout(playTimer); playTimer = null }
    update(s => ({
      ...s,
      links: [],
      fields: [],
      pendingLinkPortalId: null,
      agents: s.agents.map(a => ({ ...a, linkCount: 0, fieldCount: 0, ap: 0, score: 0 })),
      timelineEntries: [],
      timelineStep: 0,
      isPlaying: false,
    }))
  }

  const CANVAS_WIDTH = 1200
  const CANVAS_HEIGHT = 900
  const BBOX_PADDING = 50

  function importIITCPortals(portalsJson: string) {
    let parsed: Array<{ guid?: string; title?: string; coordinates?: { lat?: string; lng?: string } }>
    try {
      parsed = JSON.parse(portalsJson)
    } catch {
      toastStore.add('Invalid JSON file', 'error')
      return
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      toastStore.add('JSON file contains no portals', 'error')
      return
    }
    const valid = parsed.filter(
      p => p.coordinates && p.coordinates.lat && p.coordinates.lng
    )
    if (valid.length === 0) {
      toastStore.add('No valid portal coordinates found in JSON', 'error')
      return
    }

    const MAX_PORTALS = 1024
    if (valid.length > MAX_PORTALS) {
      toastStore.add(`Only first ${MAX_PORTALS} portals imported (total: ${valid.length})`, 'warning')
      valid.length = MAX_PORTALS
    }

    const lats = valid.map(p => parseFloat(p.coordinates!.lat!))
    const lngs = valid.map(p => parseFloat(p.coordinates!.lng!))
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    const latRange = maxLat - minLat || 0.001
    const lngRange = maxLng - minLng || 0.001

    const titles = new Map<string, string>()
    const portals: Portal[] = valid.map((p, i) => {
      const id = `imported-${Date.now()}-${i}`
      const lat = parseFloat(p.coordinates!.lat!)
      const lng = parseFloat(p.coordinates!.lng!)
      const x = BBOX_PADDING + ((lng - minLng) / lngRange) * (CANVAS_WIDTH - 2 * BBOX_PADDING)
      const y = BBOX_PADDING + ((maxLat - lat) / latRange) * (CANVAS_HEIGHT - 2 * BBOX_PADDING)
      const title = p.title || `Portal ${i + 1}`
      titles.set(id, title)
      return { id, x, y, label: '' }
    })

    update(s => ({
      ...s,
      portals,
      links: [],
      fields: [],
      pendingLinkPortalId: null,
      portalSource: 'imported',
      importedPortalTitles: titles,
      agents: s.agents.map(a => ({ ...a, linkCount: 0, fieldCount: 0, ap: 0, score: 0 })),
      mode: 'link',
      timelineEntries: [],
      timelineStep: 0,
      isPlaying: false,
    }))

    toastStore.add(`Imported ${portals.length} portals`, 'success')
  }

  function getImportedTitle(portalId: string): string | null {
    const state = get({ subscribe })
    return state.importedPortalTitles.get(portalId) ?? null
  }

  function findNearbyPortals(cx: number, cy: number, portals: Portal[], radius = 90): Set<string> {
    const result = new Set<string>()
    for (const p of portals) {
      const dx = cx - p.x
      const dy = cy - p.y
      if (dx * dx + dy * dy <= radius * radius) result.add(p.id)
    }
    return result
  }

  function getState(): GameState {
    return get({ subscribe })
  }

  function exportAgentKeys(agentId: string) {
    const state = get({ subscribe })
    const agent = state.agents.find(a => a.id === agentId)
    if (!agent) {
      toastStore.add('Agent not found', 'error')
      return
    }

    const keyCounts = new Map<string, number>()
    for (const [, tgtId, aId] of state.links) {
      if (aId !== agentId) continue
      keyCounts.set(tgtId, (keyCounts.get(tgtId) ?? 0) + 1)
    }

    if (keyCounts.size === 0) {
      toastStore.add(`${agent.name} has no links`, 'warning')
      return
    }

    const getLabel = (id: string) => {
      if (state.portalSource === 'imported') {
        return state.importedPortalTitles.get(id) ?? id
      }
      return state.portals.find(p => p.id === id)?.label ?? id
    }

    const sorted = [...keyCounts.entries()].sort((a, b) => b[1] - a[1])
    const total = sorted.reduce((s, [, c]) => s + c, 0)
    const items = sorted.map(([pid, count]) => `- ${getLabel(pid)} ×${count}`)

    const md = [
      `# ${agent.name} Key List`,
      '',
      ...items,
      '',
      `**Total: ${total} keys**`,
      '',
    ].join('\n')

    navigator.clipboard.writeText(md).then(
      () => toastStore.add('Key list copied to clipboard', 'success'),
      () => toastStore.add('Failed to copy to clipboard', 'error'),
    )
  }

  function goToTimelineStep(step: number) {
    update(s => {
      const clamped = Math.max(0, Math.min(step, s.timelineEntries.length))
      const rebuilt = rebuildFromTimeline(s.timelineEntries, clamped, s.agents, s.scoringRuleId)
      return { ...s, ...rebuilt, timelineStep: clamped }
    })
  }

  function playTimeline() {
    update(s => {
      if (s.timelineEntries.length === 0) return s
      if (s.timelineStep >= s.timelineEntries.length) return s
      return { ...s, isPlaying: true }
    })
    const tick = () => {
      const state = get({ subscribe })
      if (!state.isPlaying) return
      if (state.timelineStep >= state.timelineEntries.length) {
        update(s => ({ ...s, isPlaying: false }))
        playTimer = null
        return
      }
      goToTimelineStep(state.timelineStep + 1)
      playTimer = setTimeout(tick, get({ subscribe }).playSpeed)
    }
    if (!playTimer) {
      const state = get({ subscribe })
      playTimer = setTimeout(tick, state.playSpeed)
    }
  }

  function pauseTimeline() {
    if (playTimer) { clearTimeout(playTimer); playTimer = null }
    update(s => ({ ...s, isPlaying: false }))
  }

  function setPlaySpeed(ms: number) {
    update(s => ({ ...s, playSpeed: ms }))
  }

  function setScoringRule(ruleId: string | null) {
    update(s => applyScores({ ...s, scoringRuleId: ruleId }))
  }

  function exportPlan() {
    const state = get({ subscribe })
    if (state.links.length === 0) return
    const activeAgentIds = new Set(state.timelineEntries.map(e => e.agentId))
    const plan = {
      version: 1,
      portals: state.portals,
      portalSource: state.portalSource,
      importedPortalTitles: Object.fromEntries(state.importedPortalTitles),
      agents: state.agents.filter(a => activeAgentIds.has(a.id)).map(a => ({ id: a.id, name: a.name })),
      timelineEntries: state.timelineEntries,
      scoringRuleId: state.scoringRuleId,
    }
    const json = JSON.stringify(plan, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ingress-plan-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toastStore.add('Plan exported', 'success')
  }

  function importPlan(jsonStr: string) {
    let plan: any
    try {
      plan = JSON.parse(jsonStr)
    } catch {
      toastStore.add('Invalid JSON file', 'error')
      return
    }
    if (!plan || !Array.isArray(plan.portals) || !Array.isArray(plan.agents) || !Array.isArray(plan.timelineEntries)) {
      toastStore.add('Invalid plan format', 'error')
      return
    }
    if (plan.portals.length === 0) {
      toastStore.add('Plan contains no portals', 'error')
      return
    }

    const portals: Portal[] = plan.portals
    const portalSource: 'manual' | 'imported' = plan.portalSource === 'imported' ? 'imported' : 'manual'
    const importedPortalTitles = new Map<string, string>(
      Object.entries(plan.importedPortalTitles ?? {}).map(([k, v]) => [k, String(v)])
    )
    const agents: Agent[] = plan.agents.map((a: any) => ({
      id: a.id,
      name: a.name,
      linkCount: 0,
      fieldCount: 0,
      ap: 0,
      score: 0,
    }))
    const timelineEntries: TimelineEntry[] = plan.timelineEntries
    const scoringRuleId: string | null = plan.scoringRuleId ?? null

    if (playTimer) { clearTimeout(playTimer); playTimer = null }

    update(s => ({
      ...s,
      portals,
      portalSource,
      importedPortalTitles,
      agents: agents.length > 0 ? agents : s.agents,
      selectedAgentId: agents.length > 0 ? agents[0].id : null,
      links: [],
      fields: [],
      pendingLinkPortalId: null,
      mode: 'link',
      timelineEntries,
      timelineStep: 0,
      isPlaying: false,
      playSpeed: 125,
      scoringRuleId,
      _fitViewNonce: s._fitViewNonce + 1,
    }))

    toastStore.add(`Imported plan with ${portals.length} portals, ${timelineEntries.length} links`, 'success')

    setTimeout(() => playTimeline(), 50)
  }

  return {
    subscribe, set, selectedAgent, getState,
    setMode, addAgent, selectAgent, renameAgent, addPortal,
    handleLinkClick, handleCanvasClick,
    deletePortal, deleteLink,
    findPortalAt, findLinkAt, findNearbyPortals,
    clearAllPortals, clearAllLinks,
    importIITCPortals, getImportedTitle, exportAgentKeys,
    goToTimelineStep, playTimeline, pauseTimeline, setPlaySpeed,
    setScoringRule,
    exportPlan, importPlan,
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

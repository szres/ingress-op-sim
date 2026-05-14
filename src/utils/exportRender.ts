import type { Portal, Link, Field, Agent, TimelineEntry } from '../stores/gameStore'
import { getAgentColor, LINK_WARNING_THRESHOLD, MAX_LINKS_PER_PORTAL } from '../stores/gameStore'
import { computeScores } from '../stores/scoringRules'
import { GifEncoder } from './gifEncoder'

const PORTAL_RADIUS = 12
const LINK_WIDTH = 2.5
const FIELD_OPACITY = 0.12
const ARROW_SIZE = 8
const PADDING = 50

interface FrameState {
  portals: Portal[]
  links: Link[]
  fields: Field[]
  agents: Agent[]
  newLinkSrcId: string | null
  newLinkTgtId: string | null
}

function rebuildFrame(
  entries: TimelineEntry[],
  step: number,
  allPortals: Portal[],
  allAgents: Agent[],
  participatingAgentIds: Set<string>,
  allLinkedPortalIds: Set<string>,
  scoringRuleId: string | null,
): FrameState {
  const slice = entries.slice(0, step)
  const links: Link[] = slice.map(e => [e.srcId, e.tgtId, e.agentId])
  const fields: Field[] = slice.flatMap(e => e.fieldsCreated)

  const portals = allPortals.filter(p => allLinkedPortalIds.has(p.id))

  const stats = new Map<string, { linkCount: number; fieldCount: number; ap: number }>()
  for (const e of slice) {
    const s = stats.get(e.agentId) ?? { linkCount: 0, fieldCount: 0, ap: 0 }
    s.linkCount += 1
    s.ap += 313
    s.fieldCount += e.fieldsCreated.length
    s.ap += e.fieldsCreated.length * 1250
    stats.set(e.agentId, s)
  }

  const scoreMap = computeScores({ links, fields, agents: allAgents }, scoringRuleId)

  const agents = allAgents
    .filter(a => participatingAgentIds.has(a.id))
    .map(a => {
      const s = stats.get(a.id)
      if (!s) return { ...a, linkCount: 0, fieldCount: 0, ap: 0, score: scoreMap.get(a.id) ?? 0 }
      return { ...a, ...s, score: scoreMap.get(a.id) ?? 0 }
    })

  const newEntry = step > 0 && step <= entries.length ? entries[step - 1] : null

  return {
    portals, links, fields, agents,
    newLinkSrcId: newEntry?.srcId ?? null,
    newLinkTgtId: newEntry?.tgtId ?? null,
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, color: string) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(size, 0)
  ctx.lineTo(-size * 0.6, -size * 0.5)
  ctx.lineTo(-size * 0.6, size * 0.5)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.restore()
}

function drawAgentOverlay(ctx: CanvasRenderingContext2D, agents: Agent[], w: number, h: number) {
  if (agents.length === 0) return

  const lineH = 18
  const headerH = 22
  const panelW = 260
  const panelH = headerH + agents.length * lineH + 10
  const px = w - panelW - 10
  const py = h - panelH - 10

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
  ctx.beginPath()
  ctx.roundRect(px, py, panelW, panelH, 6)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 12px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('Agent Stats', px + 10, py + 6)

  let y = py + headerH
  for (const a of agents) {
    const color = getAgentColor(a.id, agents)
    ctx.fillStyle = color
    ctx.font = 'bold 11px sans-serif'
    ctx.fillText(a.name.length > 10 ? a.name.slice(0, 10) : a.name, px + 10, y + 1)

    ctx.fillStyle = a.linkCount > 0 ? '#cccccc' : '#666666'
    ctx.font = '10px monospace'
    const stats = `L:${a.linkCount} F:${a.fieldCount} AP:${a.ap.toLocaleString()} S:${a.score}`
    ctx.fillText(stats, px + 80, y + 2)

    y += lineH
  }
}

interface Viewport {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, frame: FrameState, viewport: Viewport | null, portalTitles: Map<string, string>) {
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, w, h)

  const { portals, links, fields, agents } = frame
  if (!viewport) {
    drawAgentOverlay(ctx, agents, w, h)
    return
  }

  const { minX: rawMinX, minY: rawMinY, maxX: rawMaxX, maxY: rawMaxY } = viewport
  const pad = PORTAL_RADIUS + PADDING
  const minX = rawMinX - pad, minY = rawMinY - pad
  const maxX = rawMaxX + pad, maxY = rawMaxY + pad

  const bboxW = maxX - minX || 1
  const bboxH = maxY - minY || 1
  const scale = Math.min(w / bboxW, h / bboxH)
  const offsetX = (w - bboxW * scale) / 2
  const offsetY = (h - bboxH * scale) / 2

  function tx(x: number) { return (x - minX) * scale + offsetX }
  function ty(y: number) { return (y - minY) * scale + offsetY }

  for (const f of fields) {
    const [p1Id, p2Id, p3Id, aId] = f
    const p1 = portals.find(p => p.id === p1Id)
    const p2 = portals.find(p => p.id === p2Id)
    const p3 = portals.find(p => p.id === p3Id)
    if (!p1 || !p2 || !p3) continue
    const color = getAgentColor(aId, agents)
    ctx.beginPath()
    ctx.moveTo(tx(p1.x), ty(p1.y))
    ctx.lineTo(tx(p2.x), ty(p2.y))
    ctx.lineTo(tx(p3.x), ty(p3.y))
    ctx.closePath()
    const alpha = Math.round(FIELD_OPACITY * 255).toString(16).padStart(2, '0')
    ctx.fillStyle = color + alpha
    ctx.fill()
  }

  for (const l of links) {
    const [p1Id, p2Id, aId] = l
    const p1 = portals.find(p => p.id === p1Id)
    const p2 = portals.find(p => p.id === p2Id)
    if (!p1 || !p2) continue
    const color = getAgentColor(aId, agents)
    const x1 = tx(p1.x), y1 = ty(p1.y), x2 = tx(p2.x), y2 = ty(p2.y)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = color
    ctx.lineWidth = LINK_WIDTH
    ctx.stroke()

    const dx = x2 - x1, dy = y2 - y1
    const dist = Math.hypot(dx, dy)
    const offset = PORTAL_RADIUS * 2 * scale
    if (dist > offset + ARROW_SIZE) {
      const angle = Math.atan2(dy, dx)
      const mx = x2 - (dx / dist) * offset
      const my = y2 - (dy / dist) * offset
      drawArrow(ctx, mx, my, angle, ARROW_SIZE, color)
    }
  }

  const ps = scale
  for (const p of portals) {
    const px = tx(p.x), py = ty(p.y)
    ctx.beginPath()
    ctx.arc(px, py, (PORTAL_RADIUS + 3) * ps, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0, 150, 255, 0.2)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(px, py, PORTAL_RADIUS * ps, 0, Math.PI * 2)
    ctx.fillStyle = '#0066cc'
    ctx.fill()
    ctx.strokeStyle = '#0099ff'
    ctx.lineWidth = 2 * ps
    ctx.stroke()
  }

  const outboundCounts = new Map<string, number>()
  for (const [a, b] of links) {
    outboundCounts.set(a, (outboundCounts.get(a) ?? 0) + 1)
    outboundCounts.set(b, (outboundCounts.get(b) ?? 0) + 1)
  }
  for (const p of portals) {
    const count = outboundCounts.get(p.id) ?? 0
    if (count > LINK_WARNING_THRESHOLD) {
      const isMax = count >= MAX_LINKS_PER_PORTAL
      const fontSize = Math.round(10 * ps)
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = isMax ? '#ff4444' : '#ffcc00'
      ctx.fillText(count.toString(), tx(p.x), ty(p.y))
    }
  }

  const isNewSrc = frame.newLinkSrcId
  const isNewTgt = frame.newLinkTgtId

  for (const p of portals) {
    const name = portalTitles.get(p.id) || p.label || ''
    if (!name) continue
    const px = tx(p.x), py = ty(p.y)
    const isHighlight = p.id === isNewSrc || p.id === isNewTgt
    const fontSize = Math.round((isHighlight ? 12 : 10) * ps)
    ctx.font = `${isHighlight ? 'bold ' : ''}${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    if (isHighlight) {
      const tw = ctx.measureText(name).width
      const bgX = px - tw / 2 - 4 * ps
      const bgY = py - (PORTAL_RADIUS + 6) * ps - fontSize - 2 * ps
      ctx.fillStyle = 'rgba(255, 102, 0, 0.85)'
      ctx.beginPath()
      ctx.roundRect(bgX, bgY, tw + 8 * ps, fontSize + 4 * ps, 3 * ps)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
    } else {
      ctx.fillStyle = '#ffffff'
    }
    ctx.fillText(name, px, py - (PORTAL_RADIUS + 4) * ps)
  }

  drawAgentOverlay(ctx, agents, w, h)
}

export async function exportTimelineGif(
  entries: TimelineEntry[],
  allPortals: Portal[],
  allAgents: Agent[],
  portalTitles: Map<string, string>,
  playSpeed: number,
  scoringRuleId: string | null,
  onProgress?: (step: number, total: number) => void,
): Promise<Blob> {
  const CW = 800
  const CH = 600

  const canvas = document.createElement('canvas')
  canvas.width = CW
  canvas.height = CH
  const ctx = canvas.getContext('2d')!

  const encoder = new GifEncoder(CW, CH)
  encoder.setRepeat(0)

  const totalSteps = entries.length

  const participatingAgentIds = new Set(entries.map(e => e.agentId))

  const allLinkedPortalIds = new Set<string>()
  for (const e of entries) {
    allLinkedPortalIds.add(e.srcId)
    allLinkedPortalIds.add(e.tgtId)
  }
  const linkedPortals = allPortals.filter(p => allLinkedPortalIds.has(p.id))

  let globalViewport: Viewport | null = null
  if (linkedPortals.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of linkedPortals) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
    }
    globalViewport = { minX, minY, maxX, maxY }
  }

  for (let step = 0; step <= totalSteps; step++) {
    const frame = rebuildFrame(entries, step, allPortals, allAgents, participatingAgentIds, allLinkedPortalIds, scoringRuleId)
    drawFrame(ctx, CW, CH, frame, globalViewport, portalTitles)

    const rgba = ctx.getImageData(0, 0, CW, CH).data
    const delay = step === 0 ? 500 : step === totalSteps ? 3000 : playSpeed
    encoder.addFrame(rgba, delay)

    if (onProgress) onProgress(step, totalSteps)

    await new Promise(r => setTimeout(r, 0))
  }

  const data = encoder.encode()
  return new Blob([data], { type: 'image/gif' })
}

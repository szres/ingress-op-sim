<script lang="ts">
  import { onMount } from 'svelte'
  import { gameStore, getAgentColor, MIN_PORTAL_DISTANCE } from '../stores/gameStore'

  let canvasEl: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null

  const PORTAL_RADIUS = 12
  const LINK_WIDTH = 2.5
  const FIELD_OPACITY = 0.12
  const ARROW_SIZE = 8

  let mouseX = 0
  let mouseY = 0
  let mouseInCanvas = false
  let hoveredPortalId: string | null = null
  let cursorForbidden = false

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

  function render() {
    if (!ctx) return
    const state = gameStore.getState()
    const { portals, links, fields, agents, pendingLinkPortalId, selectedAgentId, mode } = state

    // Sync canvas internal size to its CSS display size
    const rect = canvasEl.getBoundingClientRect()
    const dpr = 1 // devicePixelRatio - keep at 1 for simplicity
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w
      canvasEl.height = h
    }

    ctx.clearRect(0, 0, w, h)

    // Draw fields
    for (const f of fields) {
      const [p1Id, p2Id, p3Id, aId] = f
      const p1 = portals.find(p => p.id === p1Id)
      const p2 = portals.find(p => p.id === p2Id)
      const p3 = portals.find(p => p.id === p3Id)
      if (!p1 || !p2 || !p3) continue
      const color = getAgentColor(aId, agents)
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.lineTo(p3.x, p3.y)
      ctx.closePath()
      const alpha = Math.round(FIELD_OPACITY * 255).toString(16).padStart(2, '0')
      ctx.fillStyle = color + alpha
      ctx.fill()
    }

    // Draw links
    for (const l of links) {
      const [p1Id, p2Id, aId] = l
      const p1 = portals.find(p => p.id === p1Id)
      const p2 = portals.find(p => p.id === p2Id)
      if (!p1 || !p2) continue
      const color = getAgentColor(aId, agents)
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.strokeStyle = color
      ctx.lineWidth = LINK_WIDTH
      ctx.stroke()
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const dist = Math.hypot(dx, dy)
      const offset = PORTAL_RADIUS * 2
      if (dist > offset + ARROW_SIZE) {
        const angle = Math.atan2(dy, dx)
        const mx = p2.x - (dx / dist) * offset
        const my = p2.y - (dy / dist) * offset
        drawArrow(ctx, mx, my, angle, ARROW_SIZE, color)
      }
    }

    // Draw pending link preview (using selected agent's color)
    if (mode === 'link' && pendingLinkPortalId && mouseX > 0 && mouseY > 0) {
      const src = portals.find(p => p.id === pendingLinkPortalId)
      if (src) {
        const color = selectedAgentId ? getAgentColor(selectedAgentId, agents) : '#ff6600'
        const target = hoveredPortalId && hoveredPortalId !== pendingLinkPortalId
          ? portals.find(p => p.id === hoveredPortalId)
          : null
        const endX = target ? target.x : mouseX
        const endY = target ? target.y : mouseY
        ctx.beginPath()
        ctx.moveTo(src.x, src.y)
        ctx.lineTo(endX, endY)
        ctx.strokeStyle = color
        ctx.lineWidth = LINK_WIDTH
        ctx.setLineDash([6, 4])
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Compute key consumption for selected agent
    const keyCounts = new Map<string, number>()
    if (selectedAgentId) {
      for (const [, targetId, aId] of links) {
        if (aId === selectedAgentId) {
          keyCounts.set(targetId, (keyCounts.get(targetId) ?? 0) + 1)
        }
      }
    }

    // Draw portals
    for (const p of portals) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, PORTAL_RADIUS + 3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0, 150, 255, 0.2)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(p.x, p.y, PORTAL_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = '#0066cc'
      ctx.fill()
      ctx.strokeStyle = '#0099ff'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(p.label, p.x, p.y - PORTAL_RADIUS - 4)
      const kc = keyCounts.get(p.id)
      if (kc && kc > 0) {
        ctx.font = 'bold 10px sans-serif'
        ctx.textBaseline = 'top'
        const badgeText = `🔑 ${kc}`
        const badgeW = ctx.measureText(badgeText).width + 8
        const badgeX = p.x - badgeW / 2
        const badgeY = p.y + PORTAL_RADIUS + 4
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
        ctx.beginPath()
        ctx.roundRect(badgeX, badgeY, badgeW, 16, 4)
        ctx.fill()
        ctx.fillStyle = '#ffcc00'
        ctx.textAlign = 'center'
        ctx.fillText(badgeText, p.x, badgeY + 2)
      }
    }

    // Highlight selected portal in link mode
    if (mode === 'link' && pendingLinkPortalId) {
      const sp = portals.find(p => p.id === pendingLinkPortalId)
      if (sp) {
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, PORTAL_RADIUS + 5, 0, Math.PI * 2)
        ctx.strokeStyle = '#ff6600'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    // Hover highlight in link mode
    if (mode === 'link' && hoveredPortalId) {
      const hp = portals.find(p => p.id === hoveredPortalId)
      if (hp && hoveredPortalId !== pendingLinkPortalId) {
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, PORTAL_RADIUS + 6, 0, Math.PI * 2)
        ctx.strokeStyle = '#00ff88'
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, PORTAL_RADIUS + 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0, 255, 136, 0.15)'
        ctx.fill()
      }
    }

    // Hover highlight in delete mode
    if (mode === 'delete' && hoveredPortalId) {
      const hp = portals.find(p => p.id === hoveredPortalId)
      if (hp) {
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, PORTAL_RADIUS + 6, 0, Math.PI * 2)
        ctx.strokeStyle = '#ff4444'
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, PORTAL_RADIUS + 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 68, 68, 0.15)'
        ctx.fill()
      }
    }

    // Ghost portal cursor in portal mode
    if (mode === 'portal' && mouseInCanvas && mouseX > 0 && mouseY > 0) {
      const nearestDist = portals.reduce((min, p) => Math.min(min, Math.hypot(mouseX - p.x, mouseY - p.y)), Infinity)
      const tooClose = nearestDist < MIN_PORTAL_DISTANCE
      const fillColor = tooClose ? 'rgba(255, 50, 50, 0.4)' : 'rgba(0, 102, 204, 0.3)'
      const strokeColor = tooClose ? '#ff3333' : 'rgba(0, 153, 255, 0.5)'

      ctx.beginPath()
      ctx.arc(mouseX, mouseY, PORTAL_RADIUS + 3, 0, Math.PI * 2)
      ctx.fillStyle = tooClose ? 'rgba(255, 50, 50, 0.15)' : 'rgba(0, 150, 255, 0.1)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(mouseX, mouseY, PORTAL_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = fillColor
      ctx.fill()
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 2
      ctx.stroke()

      if (tooClose) {
        ctx.strokeStyle = '#ff3333'
        ctx.lineWidth = 2.5
        const s = 5
        ctx.beginPath()
        ctx.moveTo(mouseX - s, mouseY - s)
        ctx.lineTo(mouseX + s, mouseY + s)
        ctx.moveTo(mouseX + s, mouseY - s)
        ctx.lineTo(mouseX - s, mouseY + s)
        ctx.stroke()
      }
    }
  }

  function handleClick(e: MouseEvent) {
    const rect = canvasEl.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    gameStore.handleCanvasClick(cx, cy)
  }

  function handleMouseMove(e: MouseEvent) {
    const rect = canvasEl.getBoundingClientRect()
    mouseX = e.clientX - rect.left
    mouseY = e.clientY - rect.top
    mouseInCanvas = true
    const state = gameStore.getState()
    if (state.mode === 'link' || state.mode === 'delete') {
      hoveredPortalId = gameStore.findPortalAt(mouseX, mouseY, state.portals)
    } else {
      hoveredPortalId = null
    }
    cursorForbidden = state.mode === 'portal' && state.portals.some(p => Math.hypot(mouseX - p.x, mouseY - p.y) < MIN_PORTAL_DISTANCE)
    render()
  }

  function handleMouseLeave() {
    mouseInCanvas = false
    hoveredPortalId = null
    cursorForbidden = false
    render()
  }

  function resizeCanvas() {
    if (!canvasEl) return false
    const rect = canvasEl.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return false
    canvasEl.width = rect.width
    canvasEl.height = rect.height
    return true
  }

  onMount(() => {
    ctx = canvasEl.getContext('2d')

    // Try to resize immediately, and retry if canvas has no size yet
    let attempts = 0
    const tryResize = () => {
      if (resizeCanvas()) {
        render()
        return
      }
      attempts++
      if (attempts < 20) { // retry up to ~2 seconds
        setTimeout(tryResize, 100)
      }
    }
    tryResize()

    window.addEventListener('resize', () => {
      resizeCanvas()
      render()
    })

    const unsub = gameStore.subscribe(() => {
      render()
    })

    return () => {
      window.removeEventListener('resize', () => {})
      unsub()
    }
  })
</script>

<canvas
  bind:this={canvasEl}
  class="w-full h-full"
  style="min-width: 200px; min-height: 200px; background: #1a1a2e; display: block; cursor: {cursorForbidden ? 'not-allowed' : 'default'};"
  onclick={handleClick}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
></canvas>

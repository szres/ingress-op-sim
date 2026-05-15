<script lang="ts">
  import { onMount } from 'svelte'
  import { gameStore, getAgentColor, MIN_PORTAL_DISTANCE, LINK_WARNING_THRESHOLD, MAX_LINKS_PER_PORTAL } from '../stores/gameStore'

  let canvasEl: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null

  const PORTAL_RADIUS = 12
  const LINK_WIDTH = 2.5
  const FIELD_OPACITY = 0.12
  const ARROW_SIZE = 8
  const BBOX_PADDING = 30

  let mouseX = 0
  let mouseY = 0
  let mouseInCanvas = false
  let hoveredPortalId: string | null = null
  let nearbyPortalIds: Set<string> = new Set()
  let cursorForbidden = false

  // Viewport state
  let panX = 0
  let panY = 0
  let scale = 1
  let isPanning = false
  let panStartScreenX = 0
  let panStartScreenY = 0
  let panStartPanX = 0
  let panStartPanY = 0

  // Theme-aware canvas colors
  let isDark = $state(true)
  const C = $derived(isDark ? {
    bg: '#0a1929',
    grid: 'rgba(100, 160, 220, 0.08)',
    portalFill: '#009999',
    portalStroke: '#00cccc',
    portalGlow: 'rgba(0, 200, 200, 0.2)',
    labelText: '#ffffff',
    hoverLabelBg: '#ff8800',
    hoverLabelBorder: '#000000',
    hoverLabelText: '#000000',
    keyBadgeBg: 'rgba(0, 0, 0, 0.6)',
    keyBadgeText: '#ffcc00',
    outboundNormal: '#ffcc00',
    outboundMax: '#ff4444',
    pendingLink: '#ff6600',
    hoverLinkStroke: '#00ff88',
    hoverLinkFill: 'rgba(0, 255, 136, 0.15)',
    hoverDeleteStroke: '#ff4444',
    hoverDeleteFill: 'rgba(255, 68, 68, 0.15)',
    ghostFill: 'rgba(0, 153, 153, 0.3)',
    ghostStroke: 'rgba(0, 204, 204, 0.5)',
    ghostGlow: 'rgba(0, 200, 200, 0.1)',
    ghostCloseFill: 'rgba(255, 50, 50, 0.4)',
    ghostCloseStroke: '#ff3333',
    ghostCloseGlow: 'rgba(255, 50, 50, 0.15)',
    tooCloseX: '#ff3333',
  } : {
    bg: '#f0f4f8',
    grid: 'rgba(100, 160, 220, 0.15)',
    portalFill: '#0e7490',
    portalStroke: '#22d3ee',
    portalGlow: 'rgba(14, 116, 144, 0.15)',
    labelText: '#1e293b',
    hoverLabelBg: '#ea580c',
    hoverLabelBorder: '#9a3412',
    hoverLabelText: '#ffffff',
    keyBadgeBg: 'rgba(0, 0, 0, 0.7)',
    keyBadgeText: '#f59e0b',
    outboundNormal: '#d97706',
    outboundMax: '#dc2626',
    pendingLink: '#ea580c',
    hoverLinkStroke: '#059669',
    hoverLinkFill: 'rgba(5, 150, 105, 0.12)',
    hoverDeleteStroke: '#dc2626',
    hoverDeleteFill: 'rgba(220, 38, 38, 0.12)',
    ghostFill: 'rgba(14, 116, 144, 0.25)',
    ghostStroke: 'rgba(14, 116, 144, 0.5)',
    ghostGlow: 'rgba(14, 116, 144, 0.1)',
    ghostCloseFill: 'rgba(220, 38, 38, 0.35)',
    ghostCloseStroke: '#dc2626',
    ghostCloseGlow: 'rgba(220, 38, 38, 0.12)',
    tooCloseX: '#dc2626',
  })

  function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val))
  }

  function screenToWorld(sx: number, sy: number): [number, number] {
    return [sx / scale + panX, sy / scale + panY]
  }

  function getPortalsBBox(portals: Array<{ x: number; y: number }>): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (portals.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of portals) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    const pad = PORTAL_RADIUS + BBOX_PADDING
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
  }

  function clampPan() {
    const state = gameStore.getState()
    const bbox = getPortalsBBox(state.portals)
    if (!bbox) {
      panX = 0
      panY = 0
      return
    }
    const rect = canvasEl.getBoundingClientRect()
    const viewW = rect.width / scale
    const viewH = rect.height / scale
    const bboxW = bbox.maxX - bbox.minX
    const bboxH = bbox.maxY - bbox.minY

    if (viewW >= bboxW) {
      panX = clamp(panX, bbox.maxX - viewW, bbox.minX)
    } else {
      panX = clamp(panX, bbox.minX, bbox.maxX - viewW)
    }

    if (viewH >= bboxH) {
      panY = clamp(panY, bbox.maxY - viewH, bbox.minY)
    } else {
      panY = clamp(panY, bbox.minY, bbox.maxY - viewH)
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

    // Apply viewport transform
    ctx.setTransform(scale, 0, 0, scale, -panX * scale, -panY * scale)

    // Draw blueprint grid
    const GRID_STEP = 50
    const gridLeft = Math.floor(panX / GRID_STEP) * GRID_STEP
    const gridTop = Math.floor(panY / GRID_STEP) * GRID_STEP
    const gridRight = panX + w / scale
    const gridBottom = panY + h / scale
    ctx.strokeStyle = C.grid
    ctx.lineWidth = 1 / scale
    ctx.beginPath()
    for (let x = gridLeft; x <= gridRight; x += GRID_STEP) {
      ctx.moveTo(x, gridTop)
      ctx.lineTo(x, gridBottom)
    }
    for (let y = gridTop; y <= gridBottom; y += GRID_STEP) {
      ctx.moveTo(gridLeft, y)
      ctx.lineTo(gridRight, y)
    }
    ctx.stroke()

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
    if (mode === 'link' && pendingLinkPortalId && mouseInCanvas) {
      const src = portals.find(p => p.id === pendingLinkPortalId)
      if (src) {
        const color = selectedAgentId ? getAgentColor(selectedAgentId, agents) : C.pendingLink
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

    // When zoomed past 100%, scale down portal visual sizes to keep them constant on screen
    const ps = scale > 1.0 ? 1.0 / scale : 1.0

    // Draw portal circles (skip hovered portal — drawn last on top)
    for (const p of portals) {
      if (p.id === hoveredPortalId) continue
      ctx.beginPath()
      ctx.arc(p.x, p.y, (PORTAL_RADIUS + 3) * ps, 0, Math.PI  * 2)
      ctx.fillStyle = C.portalGlow
      ctx.fill()
      ctx.beginPath()
      ctx.arc(p.x, p.y, PORTAL_RADIUS * ps, 0, Math.PI * 2)
      ctx.fillStyle = C.portalFill
      ctx.fill()
      ctx.strokeStyle = C.portalStroke
      ctx.lineWidth = 2 * ps
      ctx.stroke()
    }

    // Compute outbound link counts per portal
    const outboundCounts = new Map<string, number>()
    for (const [a, b] of links) {
      outboundCounts.set(a, (outboundCounts.get(a) ?? 0) + 1)
      outboundCounts.set(b, (outboundCounts.get(b) ?? 0) + 1)
    }

    // Draw outbound link count on portal center when > threshold
    for (const p of portals) {
      const count = outboundCounts.get(p.id) ?? 0
      if (count > LINK_WARNING_THRESHOLD) {
        const isMax = count >= MAX_LINKS_PER_PORTAL
        const fontSize = Math.round(10 * ps)
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = isMax ? C.outboundMax : C.outboundNormal
        ctx.fillText(count.toString(), p.x, p.y)
      }
    }

    // Draw key badges (above portal circles)
    for (const p of portals) {
      const kc = keyCounts.get(p.id)
      if (kc && kc > 0) {
        ctx.font = `bold ${Math.round(10 * ps)}px sans-serif`
        ctx.textBaseline = 'top'
        const badgeText = `🔑 ${kc}`
        const badgeW = ctx.measureText(badgeText).width + 8 * ps
        const badgeX = p.x - badgeW / 2
        const badgeY = p.y + (PORTAL_RADIUS + 4) * ps
        ctx.fillStyle = C.keyBadgeBg
        ctx.beginPath()
        ctx.roundRect(badgeX, badgeY, badgeW, 16 * ps, 4 * ps)
        ctx.fill()
        ctx.fillStyle = C.keyBadgeText
        ctx.textAlign = 'center'
        ctx.fillText(badgeText, p.x, badgeY + 2 * ps)
      }
    }

    // Draw portal labels (skip hovered portal — drawn last on top)
    for (const p of portals) {
      if (p.id === hoveredPortalId) continue
      const showLabel = state.portalSource === 'imported'
        ? (nearbyPortalIds.has(p.id) || p.id === pendingLinkPortalId)
        : true
      if (showLabel) {
        const labelText = state.portalSource === 'imported'
          ? (state.importedPortalTitles.get(p.id) ?? '')
          : p.label
        if (labelText) {
          ctx.fillStyle = C.labelText
          ctx.font = `bold ${Math.round(11 * ps)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText(labelText, p.x, p.y - (PORTAL_RADIUS + 4) * ps)
        }
      }
    }

    // Highlight selected portal in link mode
    if (mode === 'link' && pendingLinkPortalId) {
      const sp = portals.find(p => p.id === pendingLinkPortalId)
      if (sp) {
        ctx.beginPath()
        ctx.arc(sp.x, sp.y, (PORTAL_RADIUS + 5) * ps, 0, Math.PI * 2)
        ctx.strokeStyle = C.pendingLink
        ctx.lineWidth = 2 * ps
        ctx.stroke()
      }
    }

    // Hover highlight in link mode
    if (mode === 'link' && hoveredPortalId) {
      const hp = portals.find(p => p.id === hoveredPortalId)
      if (hp && hoveredPortalId !== pendingLinkPortalId) {
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, (PORTAL_RADIUS + 6) * ps, 0, Math.PI * 2)
        ctx.strokeStyle = C.hoverLinkStroke
        ctx.lineWidth = 2.5 * ps
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, (PORTAL_RADIUS + 3) * ps, 0, Math.PI * 2)
        ctx.fillStyle = C.hoverLinkFill
        ctx.fill()
      }
    }

    // Hover highlight in delete mode
    if (mode === 'delete' && hoveredPortalId) {
      const hp = portals.find(p => p.id === hoveredPortalId)
      if (hp) {
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, (PORTAL_RADIUS + 6) * ps, 0, Math.PI * 2)
        ctx.strokeStyle = C.hoverDeleteStroke
        ctx.lineWidth = 2.5 * ps
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, (PORTAL_RADIUS + 3) * ps, 0, Math.PI * 2)
        ctx.fillStyle = C.hoverDeleteFill
        ctx.fill()
      }
    }

    // Draw hovered portal on top (circle + emphasized label with background)
    if (hoveredPortalId) {
      const hp = portals.find(p => p.id === hoveredPortalId)
      if (hp) {
        // Portal circle
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, (PORTAL_RADIUS + 3) * ps, 0, Math.PI * 2)
        ctx.fillStyle = C.portalGlow
        ctx.fill()
        ctx.beginPath()
        ctx.arc(hp.x, hp.y, PORTAL_RADIUS * ps, 0, Math.PI * 2)
        ctx.fillStyle = C.portalFill
        ctx.fill()
        ctx.strokeStyle = C.portalStroke
        ctx.lineWidth = 2 * ps
        ctx.stroke()

        // Emphasized label with background
        const labelText = state.portalSource === 'imported'
          ? (state.importedPortalTitles.get(hp.id) ?? hp.label)
          : hp.label
        if (labelText) {
          const fontSize = Math.round(15 * ps)
          ctx.font = `bold ${fontSize}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          const textW = ctx.measureText(labelText).width
          const padX = 8 * ps
          const padY = 4 * ps
          const bgX = hp.x - textW / 2 - padX
          const bgY = hp.y - (PORTAL_RADIUS + 4) * ps - fontSize - padY
          const bgW = textW + padX * 2
          const bgH = fontSize + padY * 2
          ctx.fillStyle = C.hoverLabelBg
          ctx.beginPath()
          ctx.roundRect(bgX, bgY, bgW, bgH, 4 * ps)
          ctx.fill()
          ctx.strokeStyle = C.hoverLabelBorder
          ctx.lineWidth = 1.5 * ps
          ctx.stroke()
          ctx.fillStyle = C.hoverLabelText
          ctx.fillText(labelText, hp.x, hp.y - (PORTAL_RADIUS + 4) * ps)
        }

        // Key badge for hovered portal
        const kc = keyCounts.get(hp.id)
        if (kc && kc > 0) {
          ctx.font = `bold ${Math.round(10 * ps)}px sans-serif`
          ctx.textBaseline = 'top'
          const badgeText = `🔑 ${kc}`
          const badgeW = ctx.measureText(badgeText).width + 8 * ps
          const badgeX = hp.x - badgeW / 2
          const badgeY = hp.y + (PORTAL_RADIUS + 4) * ps
          ctx.fillStyle = C.keyBadgeBg
          ctx.beginPath()
          ctx.roundRect(badgeX, badgeY, badgeW, 16 * ps, 4 * ps)
          ctx.fill()
          ctx.fillStyle = C.keyBadgeText
          ctx.textAlign = 'center'
          ctx.fillText(badgeText, hp.x, badgeY + 2 * ps)
        }

        // Outbound link count for hovered portal
        const count = outboundCounts.get(hp.id) ?? 0
        if (count > LINK_WARNING_THRESHOLD) {
          const isMax = count >= MAX_LINKS_PER_PORTAL
          const fontSize = Math.round(10 * ps)
          ctx.font = `bold ${fontSize}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = isMax ? C.outboundMax : C.outboundNormal
          ctx.fillText(count.toString(), hp.x, hp.y)
        }
      }
    }

    // Ghost portal cursor in portal mode
    if (mode === 'portal' && mouseInCanvas) {
      const nearestDist = portals.reduce((min, p) => Math.min(min, Math.hypot(mouseX - p.x, mouseY - p.y)), Infinity)
      const tooClose = nearestDist < MIN_PORTAL_DISTANCE
      const fillColor = tooClose ? C.ghostCloseFill : C.ghostFill
      const strokeColor = tooClose ? C.ghostCloseStroke : C.ghostStroke

      ctx.beginPath()
      ctx.arc(mouseX, mouseY, (PORTAL_RADIUS + 3) * ps, 0, Math.PI * 2)
      ctx.fillStyle = tooClose ? C.ghostCloseGlow : C.ghostGlow
      ctx.fill()
      ctx.beginPath()
      ctx.arc(mouseX, mouseY, PORTAL_RADIUS * ps, 0, Math.PI * 2)
      ctx.fillStyle = fillColor
      ctx.fill()
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 2 * ps
      ctx.stroke()

      if (tooClose) {
        ctx.strokeStyle = C.tooCloseX
        ctx.lineWidth = 2.5 * ps
        const s = 5 * ps
        ctx.beginPath()
        ctx.moveTo(mouseX - s, mouseY - s)
        ctx.lineTo(mouseX + s, mouseY + s)
        ctx.moveTo(mouseX + s, mouseY - s)
        ctx.lineTo(mouseX - s, mouseY + s)
        ctx.stroke()
      }
    }

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  function handleClick(e: MouseEvent) {
    if (isPanning) return
    const rect = canvasEl.getBoundingClientRect()
    const [wx, wy] = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
    gameStore.handleCanvasClick(wx, wy)
  }

  function handleMouseMove(e: MouseEvent) {
    const rect = canvasEl.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (isPanning) {
      panX = panStartPanX - (e.clientX - panStartScreenX) / scale
      panY = panStartPanY - (e.clientY - panStartScreenY) / scale
      clampPan()
      render()
      return
    }

    const [wx, wy] = screenToWorld(sx, sy)
    mouseX = wx
    mouseY = wy
    mouseInCanvas = true
    const state = gameStore.getState()
    if (state.mode === 'link' || state.mode === 'delete') {
      hoveredPortalId = gameStore.findPortalAt(mouseX, mouseY, state.portals)
    } else {
      hoveredPortalId = null
    }
    nearbyPortalIds = gameStore.findNearbyPortals(mouseX, mouseY, state.portals)
    cursorForbidden = state.mode === 'portal' && (state.portalSource === 'imported' || state.portals.some(p => Math.hypot(mouseX - p.x, mouseY - p.y) < MIN_PORTAL_DISTANCE))
    render()
  }

  function handleMouseLeave() {
    mouseInCanvas = false
    hoveredPortalId = null
    nearbyPortalIds = new Set()
    cursorForbidden = false
    render()
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button === 1) {
      isPanning = true
      panStartScreenX = e.clientX
      panStartScreenY = e.clientY
      panStartPanX = panX
      panStartPanY = panY
      e.preventDefault()
    }
  }

  function handleMouseUp(e: MouseEvent) {
    if (e.button === 1 && isPanning) {
      isPanning = false
      render()
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault()
    const rect = canvasEl.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    const [worldX, worldY] = screenToWorld(screenX, screenY)

    const oldScale = scale
    scale = clamp(scale * (1 - e.deltaY * 0.001), 0.5, 2.0)
    if (scale === oldScale) return

    panX = worldX - screenX / scale
    panY = worldY - screenY / scale
    clampPan()
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

  function fitView() {
    const state = gameStore.getState()
    const bbox = getPortalsBBox(state.portals)
    if (!bbox) {
      panX = 0
      panY = 0
      scale = 1
      return
    }
    const rect = canvasEl.getBoundingClientRect()
    const bboxW = bbox.maxX - bbox.minX
    const bboxH = bbox.maxY - bbox.minY
    if (bboxW <= 0 || bboxH <= 0) return
    const idealScale = clamp(Math.min(rect.width / bboxW, rect.height / bboxH), 0.5, 2.0)
    // Record old scale to know if we changed it
    const oldScale = scale
    if (idealScale < scale) {
      scale = idealScale
    }
    // Adjust pan to keep the current viewport center stable after scale change
    if (scale !== oldScale) {
      const cx = panX + (rect.width / oldScale) / 2
      const cy = panY + (rect.height / oldScale) / 2
      panX = cx - (rect.width / scale) / 2
      panY = cy - (rect.height / scale) / 2
    }
    clampPan()
  }

  function handleResize() {
    resizeCanvas()
    fitView()
    render()
  }

  onMount(() => {
    ctx = canvasEl.getContext('2d')

    // Read initial theme
    isDark = document.documentElement.getAttribute('data-theme') !== 'xianii-light'

    // Watch for theme changes and re-render
    const themeObserver = new MutationObserver(() => {
      isDark = document.documentElement.getAttribute('data-theme') !== 'xianii-light'
      render()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

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

    window.addEventListener('resize', handleResize)

    // Global mouseup to catch middle-button release outside canvas
    const globalMouseUp = (e: MouseEvent) => {
      if (e.button === 1 && isPanning) {
        isPanning = false
        render()
      }
    }
    window.addEventListener('mouseup', globalMouseUp)

    // Wheel handler with passive: false to allow preventDefault
    const wheelHandler = (e: WheelEvent) => {
      if (e.target === canvasEl || canvasEl.contains(e.target as Node)) {
        handleWheel(e)
      }
    }
    canvasEl.addEventListener('wheel', wheelHandler, { passive: false })

    let prevPortalsRef: Array<{ id: string; x: number; y: number; label: string }> | null = null
    const unsub = gameStore.subscribe((state) => {
      if (state.portals.length === 0) {
        panX = 0
        panY = 0
        scale = 1
        prevPortalsRef = null
      } else if (state.portalSource === 'imported' && state.portals !== prevPortalsRef) {
        fitView()
      }
      prevPortalsRef = state.portals
      render()
    })

    return () => {
      themeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mouseup', globalMouseUp)
      canvasEl.removeEventListener('wheel', wheelHandler)
      unsub()
    }
  })
</script>

<canvas
  bind:this={canvasEl}
  class="w-full h-full"
  style="min-width: 200px; min-height: 200px; background: {C.bg}; display: block; cursor: {isPanning ? 'grabbing' : cursorForbidden ? 'not-allowed' : 'default'};"
  onclick={handleClick}
  onmousemove={handleMouseMove}
  onmouseleave={handleMouseLeave}
  onmousedown={handleMouseDown}
  onmouseup={handleMouseUp}
></canvas>

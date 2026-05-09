<script lang="ts">
  import { onMount } from 'svelte'
  import { gameStore } from '../stores/gameStore'

  let canvasEl: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D | null = null

  const PORTAL_RADIUS = 12
  const LINK_WIDTH = 2.5
  const FIELD_OPACITY = 0.12

  const AGENT_COLORS = [
    '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4',
    '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff',
    '#9a6324', '#fffac8', '#800000', '#aaffc3',
  ]

  let mouseX = 0
  let mouseY = 0

  function getAgentColor(agentId: string, agents: Array<{ id: string }>): string {
    const idx = agents.findIndex(a => a.id === agentId)
    return AGENT_COLORS[Math.max(0, idx) % AGENT_COLORS.length]
  }

  function render() {
    if (!ctx) return
    const state = gameStore.getState()
    const { portals, links, fields, agents, pendingLinkPortalId, mode } = state

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
    }

    // Draw pending link preview
    if (mode === 'link' && pendingLinkPortalId && mouseX > 0 && mouseY > 0) {
      const src = portals.find(p => p.id === pendingLinkPortalId)
      if (src) {
        ctx.beginPath()
        ctx.moveTo(src.x, src.y)
        ctx.lineTo(mouseX, mouseY)
        ctx.strokeStyle = 'rgba(255, 102, 0, 0.6)'
        ctx.lineWidth = LINK_WIDTH
        ctx.setLineDash([6, 4])
        ctx.stroke()
        ctx.setLineDash([])
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
  style="min-width: 200px; min-height: 200px; background: #1a1a2e; display: block; cursor: crosshair;"
  onclick={handleClick}
  onmousemove={handleMouseMove}
></canvas>

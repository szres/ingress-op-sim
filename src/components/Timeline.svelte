<script lang="ts">
  import { gameStore, getAgentColor, type TimelineEntry, type Agent } from '../stores/gameStore'

  let entries: TimelineEntry[] = $state([])
  let timelineStep = $state(0)
  let isPlaying = $state(false)
  let playSpeed = $state(1000)
  let agents: Agent[] = $state([])

  let trackEl: HTMLDivElement | null = $state(null)
  let isDragging = $state(false)

  gameStore.subscribe(s => {
    entries = s.timelineEntries
    timelineStep = s.timelineStep
    isPlaying = s.isPlaying
    playSpeed = s.playSpeed
    agents = s.agents
  })

  const speedOptions = [
    { label: '0.25x', value: 2000 },
    { label: '0.5x', value: 1000 },
    { label: '1x', value: 500 },
    { label: '2x', value: 250 },
    { label: '4x', value: 125 },
  ]

  function handlePlayPause() {
    if (isPlaying) {
      gameStore.pauseTimeline()
    } else {
      gameStore.playTimeline()
    }
  }

  function handleSkipStart() {
    gameStore.pauseTimeline()
    gameStore.goToTimelineStep(0)
  }

  function handleSkipEnd() {
    gameStore.pauseTimeline()
    gameStore.goToTimelineStep(entries.length)
  }

  function handleSpeedChange(e: Event) {
    const val = Number((e.target as HTMLSelectElement).value)
    gameStore.setPlaySpeed(val)
  }

  function stepFromPointer(clientX: number): number {
    if (!trackEl || entries.length === 0) return 0
    const rect = trackEl.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    return Math.round(ratio * entries.length)
  }

  function handleTrackPointerDown(e: PointerEvent) {
    if (entries.length === 0) return
    isDragging = true
    trackEl?.setPointerCapture(e.pointerId)
    const step = stepFromPointer(e.clientX)
    gameStore.goToTimelineStep(Math.max(0, Math.min(step, entries.length)))
  }

  function handleTrackPointerMove(e: PointerEvent) {
    if (!isDragging) return
    const step = stepFromPointer(e.clientX)
    gameStore.goToTimelineStep(Math.max(0, Math.min(step, entries.length)))
  }

  function handleTrackPointerUp(e: PointerEvent) {
    isDragging = false
    trackEl?.releasePointerCapture(e.pointerId)
  }

  const isEmpty = $derived(entries.length === 0)
  const isAtEnd = $derived(timelineStep >= entries.length)
  const isAtStart = $derived(timelineStep <= 0)
</script>

<div class="flex items-center gap-2 px-3 py-1.5 bg-base-200 border-t border-base-300 h-12 shrink-0">
  {#if isEmpty}
    <span class="text-xs text-base-content/40 italic">No links recorded</span>
  {:else}
    <div class="flex items-center gap-1">
      <button
        class="btn btn-ghost btn-xs"
        disabled={isAtStart}
        onclick={handleSkipStart}
        title="Skip to start"
      >
        ⏮
      </button>
      <button
        class="btn btn-ghost btn-xs"
        onclick={handlePlayPause}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button
        class="btn btn-ghost btn-xs"
        disabled={isAtEnd}
        onclick={handleSkipEnd}
        title="Skip to end"
      >
        ⏭
      </button>
    </div>

    <select
      class="select select-xs select-bordered w-16"
      value={playSpeed}
      onchange={handleSpeedChange}
      title="Playback speed"
    >
      {#each speedOptions as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>

    <div
      bind:this={trackEl}
      class="flex-1 h-6 relative cursor-pointer select-none touch-none"
      role="slider"
      tabindex="0"
      aria-valuemin={0}
      aria-valuemax={entries.length}
      aria-valuenow={timelineStep}
      onpointerdown={handleTrackPointerDown}
      onpointermove={handleTrackPointerMove}
      onpointerup={handleTrackPointerUp}
      onpointercancel={handleTrackPointerUp}
    >
      <div class="absolute inset-y-2 left-0 right-0 bg-base-300 rounded-full"></div>
      <div
        class="absolute inset-y-2 left-0 bg-primary/40 rounded-full"
        style="width: {(timelineStep / entries.length) * 100}%"
      ></div>
      {#each entries as entry, i}
        {@const pct = ((i + 1) / entries.length) * 100}
        <div
          class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full border border-base-100"
          class:opacity-30={i >= timelineStep}
          style="left: {pct}%; background-color: {getAgentColor(entry.agentId, agents)}"
          title="Step {i + 1}"
        ></div>
      {/each}
      <div
        class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-base-100 shadow"
        style="left: {(timelineStep / entries.length) * 100}%"
      ></div>
    </div>

    <span class="text-xs text-base-content/60 tabular-nums whitespace-nowrap">
      {timelineStep} / {entries.length}
    </span>
  {/if}
</div>

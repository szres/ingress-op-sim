<script lang="ts">
  import { get } from 'svelte/store'
  import { gameStore, toastStore, type ToolMode } from '../stores/gameStore'
  import { scoringRules } from '../stores/scoringRules'
  import ThemeToggle from './ThemeToggle.svelte'

  let gameState = $state(get(gameStore))
  let clearPortalsDialog = $state<HTMLDialogElement>()
  let clearLinksDialog = $state<HTMLDialogElement>()
  let fileInput: HTMLInputElement
  let planFileInput: HTMLInputElement

  gameStore.subscribe(s => {
    gameState = s
  })

  function handleSetMode(m: ToolMode) {
    gameStore.setMode(m)
  }

  function handleScoringRuleChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value
    gameStore.setScoringRule(val === '' ? null : val)
  }

  function handleClearPortals() {
    gameStore.clearAllPortals()
    clearPortalsDialog?.close()
  }

  function handleClearLinks() {
    gameStore.clearAllLinks()
    clearLinksDialog?.close()
  }

  function handleImportClick() {
    fileInput?.click()
  }

  function handlePlanImportClick() {
    planFileInput?.click()
  }

  function handlePlanFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const MAX_SIZE = 1024 * 1024
    if (file.size > MAX_SIZE) {
      toastStore.add(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 1MB.`, 'error')
      input.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      gameStore.importPlan(reader.result as string)
    }
    reader.readAsText(file)
    input.value = ''
  }

  function handleExportPlan() {
    gameStore.exportPlan()
  }

  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    const MAX_SIZE = 1024 * 1024
    if (file.size > MAX_SIZE) {
      toastStore.add(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 1MB.`, 'error')
      input.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      gameStore.importIITCPortals(reader.result as string)
    }
    reader.readAsText(file)
    input.value = ''
  }
</script>

<div class="flex items-center gap-2 p-2 bg-base-100 border-b border-base-300 flex-wrap">
  <a
    href="https://github.com/szres/ingress-op-sim"
    target="_blank"
    rel="noopener noreferrer"
    class="btn btn-ghost btn-sm btn-circle"
    title="View source on GitHub"
  >
    <svg class="w-5 h-5" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  </a>
  <div class="btn-group btn-group-sm">
    <button
      class="btn btn-sm {gameState.mode === 'portal' ? 'btn-primary' : 'btn-ghost'} {gameState.portalSource === 'imported' ? 'btn-disabled' : ''}"
      onclick={() => handleSetMode('portal')}
      disabled={gameState.portalSource === 'imported'}
    >
      📍 Portal
    </button>
    <button
      class="btn btn-sm {gameState.mode === 'link' ? 'btn-primary' : 'btn-ghost'}"
      onclick={() => handleSetMode('link')}
    >
      🔗 Link
    </button>
    <button
      class="btn btn-sm {gameState.mode === 'delete' ? 'btn-primary' : 'btn-ghost'}"
      onclick={() => handleSetMode('delete')}
    >
      🗑 Delete
    </button>
  </div>

  {#if gameState.portalSource === 'imported'}
    <span class="badge badge-sm badge-info">Imported</span>
  {/if}

  <div class="flex-1"></div>

  <input
    bind:this={fileInput}
    type="file"
    accept=".json"
    class="hidden"
    onchange={handleFileChange}
  />
  <input
    bind:this={planFileInput}
    type="file"
    accept=".json"
    class="hidden"
    onchange={handlePlanFileChange}
  />
  <button
    class="btn btn-sm btn-accent btn-outline {gameState.portals.length > 0 ? 'btn-disabled' : ''}"
    disabled={gameState.portals.length > 0}
    onclick={handleImportClick}
    title={gameState.portals.length > 0 ? 'Clear all portals before importing' : 'Import portals from IITC JSON'}
  >
    📥 Import IITC
  </button>
  <button
    class="btn btn-sm btn-info btn-outline {gameState.portals.length > 0 ? 'btn-disabled' : ''}"
    disabled={gameState.portals.length > 0}
    onclick={handlePlanImportClick}
    title={gameState.portals.length > 0 ? 'Clear all portals before importing' : 'Import a saved plan'}
  >
    📋 Import Plan
  </button>
  <button
    class="btn btn-sm btn-success btn-outline {gameState.links.length === 0 ? 'btn-disabled' : ''}"
    disabled={gameState.links.length === 0}
    onclick={handleExportPlan}
    title={gameState.links.length === 0 ? 'Create at least one link before exporting' : 'Export plan as JSON'}
  >
    💾 Export Plan
  </button>

  {#if gameState.links.length > 0 || gameState.fields.length > 0}
    <button class="btn btn-sm btn-warning btn-outline" onclick={() => clearLinksDialog?.showModal()}>
      ✂ Clear Links
    </button>
  {/if}
  {#if gameState.portals.length > 0}
    <button class="btn btn-sm btn-error btn-outline" onclick={() => clearPortalsDialog?.showModal()}>
      🗑 Clear Portals
    </button>
  {/if}

  <div class="divider divider-horizontal mx-1"></div>

  <select
    class="select select-sm select-bordered w-auto"
    value={gameState.scoringRuleId ?? ''}
    onchange={handleScoringRuleChange}
  >
    <option value="">Scoring: None</option>
    {#each scoringRules as rule}
      <option value={rule.id}>{rule.label}</option>
    {/each}
  </select>

  <ThemeToggle />
</div>

<dialog class="modal" bind:this={clearPortalsDialog}>
  <div class="modal-box">
    <h3 class="text-lg font-bold text-error">Clear All Portals?</h3>
    <p class="py-4 text-sm text-base-content/70">
      This will delete all portals, links and fields. Agent stats will be reset to 0. This cannot be undone.
    </p>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn btn-ghost btn-sm">Cancel</button>
      </form>
      <button class="btn btn-error btn-sm" onclick={handleClearPortals}>Clear All</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

<dialog class="modal" bind:this={clearLinksDialog}>
  <div class="modal-box">
    <h3 class="text-lg font-bold text-warning">Clear All Links & Fields?</h3>
    <p class="py-4 text-sm text-base-content/70">
      This will delete all links and fields, but keep portals. Agent stats will be reset to 0.
    </p>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn btn-ghost btn-sm">Cancel</button>
      </form>
      <button class="btn btn-warning btn-sm" onclick={handleClearLinks}>Clear Links</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button>close</button>
  </form>
</dialog>

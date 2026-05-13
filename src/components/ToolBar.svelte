<script lang="ts">
  import { get } from 'svelte/store'
  import { gameStore, toastStore, type ToolMode } from '../stores/gameStore'

  let gameState = $state(get(gameStore))
  let showClearPortalsModal = $state(false)
  let showClearLinksModal = $state(false)
  let fileInput: HTMLInputElement

  gameStore.subscribe(s => {
    gameState = s
  })

  function handleSetMode(m: ToolMode) {
    gameStore.setMode(m)
  }

  function handleClearPortals() {
    gameStore.clearAllPortals()
    showClearPortalsModal = false
  }

  function handleClearLinks() {
    gameStore.clearAllLinks()
    showClearLinksModal = false
  }

  function handleImportClick() {
    fileInput?.click()
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
  <!-- Tool buttons -->
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

  <!-- Import button -->
  <input
    bind:this={fileInput}
    type="file"
    accept=".json"
    class="hidden"
    onchange={handleFileChange}
  />
  <button class="btn btn-sm btn-accent btn-outline" onclick={handleImportClick}>
    📥 Import IITC
  </button>

  <!-- Clear buttons -->
  {#if gameState.links.length > 0 || gameState.fields.length > 0}
    <button class="btn btn-sm btn-warning btn-outline" onclick={() => { showClearLinksModal = true }}>
      ✂ Clear Links
    </button>
  {/if}
  {#if gameState.portals.length > 0}
    <button class="btn btn-sm btn-error btn-outline" onclick={() => { showClearPortalsModal = true }}>
      🗑 Clear Portals
    </button>
  {/if}
</div>

<!-- Clear Portals confirmation modal -->
{#if showClearPortalsModal}
  <div
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
    onclick={() => { showClearPortalsModal = false }}
  >
    <div
      class="card bg-base-100 shadow-xl w-80"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="card-body">
        <h3 class="card-title text-error">Clear All Portals?</h3>
        <p class="text-sm text-base-content/70">
          This will delete all portals, links and fields. Agent stats will be reset to 0. This cannot be undone.
        </p>
        <div class="card-actions justify-end mt-2">
          <button class="btn btn-ghost btn-sm" onclick={() => { showClearPortalsModal = false }}>Cancel</button>
          <button class="btn btn-error btn-sm" onclick={handleClearPortals}>Clear All</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Clear Links confirmation modal -->
{#if showClearLinksModal}
  <div
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
    onclick={() => { showClearLinksModal = false }}
  >
    <div
      class="card bg-base-100 shadow-xl w-80"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="card-body">
        <h3 class="card-title text-warning">Clear All Links & Fields?</h3>
        <p class="text-sm text-base-content/70">
          This will delete all links and fields, but keep portals. Agent stats will be reset to 0.
        </p>
        <div class="card-actions justify-end mt-2">
          <button class="btn btn-ghost btn-sm" onclick={() => { showClearLinksModal = false }}>Cancel</button>
          <button class="btn btn-warning btn-sm" onclick={handleClearLinks}>Clear Links</button>
        </div>
      </div>
    </div>
  </div>
{/if}

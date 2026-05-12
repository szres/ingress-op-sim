<script lang="ts">
  import { get } from 'svelte/store'
  import { gameStore, type ToolMode } from '../stores/gameStore'

  let gameState = $state(get(gameStore))
  let showClearPortalsModal = $state(false)
  let showClearLinksModal = $state(false)

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
</script>

<div class="flex items-center gap-2 p-2 bg-base-100 border-b border-base-300 flex-wrap">
  <!-- Tool buttons -->
  <div class="btn-group btn-group-sm">
    <button
      class="btn btn-sm {gameState.mode === 'portal' ? 'btn-primary' : 'btn-ghost'}"
      onclick={() => handleSetMode('portal')}
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

  <div class="flex-1"></div>

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

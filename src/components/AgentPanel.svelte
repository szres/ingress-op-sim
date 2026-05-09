<script lang="ts">
  import { gameStore } from '../stores/gameStore'

  let agents: Array<{ id: string; name: string; linkCount: number; fieldCount: number; ap: number }> = $state([])
  let selectedAgentId: string | null = $state(null)
  let totalPortals = $state(0)
  let totalLinks = $state(0)
  let totalFields = $state(0)

  gameStore.subscribe(s => {
    agents = s.agents
    selectedAgentId = s.selectedAgentId
    totalPortals = s.portals.length
    totalLinks = s.links.length
    totalFields = s.fields.length
  })

  function handleSelect(id: string) {
    gameStore.selectAgent(selectedAgentId === id ? null : id)
  }

  function handleAdd() {
    const nextNum = agents.length + 1
    gameStore.addAgent(`Agent${String(nextNum).padStart(2, '0')}`)
  }
</script>

<div class="flex flex-col h-full bg-base-100 border-l border-base-300">
  <!-- Global stats -->
  <div class="flex items-center justify-between px-3 py-2 border-b border-base-300 bg-base-200/50">
    <div class="flex gap-3 text-xs">
      <span class="text-info font-medium">📍 {totalPortals}</span>
      <span class="text-success font-medium">🔗 {totalLinks}</span>
      <span class="text-warning font-medium">⬡ {totalFields}</span>
    </div>
    <button
      class="btn btn-circle btn-ghost btn-sm"
      disabled={agents.length >= 16}
      onclick={handleAdd}
      title="Add Agent"
    >
      <span class="text-lg font-bold">+</span>
    </button>
  </div>

  <!-- Agent list -->
  <div class="flex-1 overflow-y-auto p-2 space-y-2">
    {#if agents.length === 0}
      <div class="text-center text-base-content/40 text-sm py-8">
        No agents yet.<br />
        Click "+" to add one.
      </div>
    {:else}
      {#each agents as agent (agent.id)}
        <button
          class="w-full text-left card compact bg-base-200 p-3 hover:bg-base-300 transition-colors border-2 cursor-pointer"
          class:border-primary={selectedAgentId === agent.id}
          class:border-transparent={selectedAgentId !== agent.id}
          onclick={() => handleSelect(agent.id)}
        >
          <div class="font-semibold text-sm text-base-content">{agent.name}</div>
          <div class="flex gap-3 text-xs text-base-content/70 mt-1">
            <span>🔗 {agent.linkCount}</span>
            <span>⬡ {agent.fieldCount}</span>
          </div>
          <div class="text-xs font-mono text-base-content/60 mt-0.5">
            AP: <span class="text-warning font-bold">{agent.ap.toLocaleString()}</span>
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>

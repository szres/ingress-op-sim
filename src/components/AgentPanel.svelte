<script lang="ts">
  import { gameStore, getAgentColor } from '../stores/gameStore'

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
  <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-base-300 bg-base-200/50">
    <div class="flex gap-4 text-sm">
      <span class="text-info font-medium">📍 {totalPortals}</span>
      <span class="text-success font-medium inline-flex items-center gap-0.5">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="7" y1="17" x2="17" y2="7"/><circle cx="5" cy="19" r="2.5" fill="currentColor"/><circle cx="19" cy="5" r="2.5" fill="currentColor"/></svg>
        {totalLinks}
      </span>
      <span class="text-warning font-medium inline-flex items-center gap-0.5">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12,3 22,21 2,21"/></svg>
        {totalFields}
      </span>
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
  <div class="flex-1 overflow-y-auto p-2 space-y-2.5">
    {#if agents.length === 0}
      <div class="text-center text-base-content/40 text-sm py-8">
        No agents yet.<br />
        Click "+" to add one.
      </div>
    {:else}
      {#each agents as agent (agent.id)}
        <div
          class="relative card compact bg-base-200 p-3.5 hover:bg-base-300 transition-colors border-2 cursor-pointer"
          class:border-primary={selectedAgentId === agent.id}
          class:border-transparent={selectedAgentId !== agent.id}
        >
          <button
            class="w-full text-left"
            onclick={() => handleSelect(agent.id)}
          >
            <div class="font-semibold text-base" style="color: {getAgentColor(agent.id, agents)}">{agent.name}</div>
            <div class="flex gap-4 text-sm text-base-content/70 mt-1">
              <span class="inline-flex items-center gap-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="7" y1="17" x2="17" y2="7"/><circle cx="5" cy="19" r="2.5" fill="currentColor"/><circle cx="19" cy="5" r="2.5" fill="currentColor"/></svg>
                {agent.linkCount}
              </span>
              <span class="inline-flex items-center gap-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12,3 22,21 2,21"/></svg>
                {agent.fieldCount}
              </span>
            </div>
            <div class="text-base font-mono text-base-content/60 mt-1">
              AP: <span class="text-warning font-bold">{agent.ap.toLocaleString()}</span>
            </div>
          </button>
          {#if agent.linkCount > 0}
            <button
              class="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-base-content/50 hover:text-warning hover:bg-warning/10 cursor-pointer transition-all duration-150 hover:scale-110"
              onclick={(e) => { e.stopPropagation(); gameStore.exportAgentKeys(agent.id) }}
              title="Copy key list (markdown)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

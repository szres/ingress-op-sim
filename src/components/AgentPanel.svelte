<script lang="ts">
  import { onMount } from 'svelte'
  import { gameStore, getAgentColor } from '../stores/gameStore'

  let agents: Array<{ id: string; name: string; linkCount: number; fieldCount: number; ap: number; score: number }> = $state([])
  let selectedAgentId: string | null = $state(null)
  let totalPortals = $state(0)
  let totalLinks = $state(0)
  let totalFields = $state(0)
  let scoringRuleId: string | null = $state(null)

  let editingAgentId: string | null = $state(null)
  let editValue = $state('')
  let editError = $state('')

  gameStore.subscribe(s => {
    agents = s.agents
    selectedAgentId = s.selectedAgentId
    totalPortals = s.portals.length
    totalLinks = s.links.length
    totalFields = s.fields.length
    scoringRuleId = s.scoringRuleId
  })

  onMount(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (editingAgentId) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= 9) {
        const idx = num - 1
        if (idx < agents.length) {
          const agent = agents[idx]
          gameStore.selectAgent(selectedAgentId === agent.id ? null : agent.id)
        }
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  })

  function handleSelect(id: string) {
    if (editingAgentId === id) return
    gameStore.selectAgent(selectedAgentId === id ? null : id)
  }

  function handleAdd() {
    const nextNum = agents.length + 1
    gameStore.addAgent(`Agent${String(nextNum).padStart(2, '0')}`)
  }

  function startEdit(id: string, currentName: string) {
    editingAgentId = id
    editValue = currentName
    editError = ''
  }

  function cancelEdit() {
    editingAgentId = null
    editValue = ''
    editError = ''
  }

  function confirmEdit(id: string) {
    const result = gameStore.renameAgent(id, editValue)
    if (result.ok) {
      editingAgentId = null
      editValue = ''
      editError = ''
    } else {
      editError = result.error ?? 'Invalid name'
    }
  }

  function handleEditKeydown(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter') confirmEdit(id)
    else if (e.key === 'Escape') cancelEdit()
  }
</script>

<div class="flex flex-col h-full bg-base-100 border-l border-base-300">
  <!-- Global stats -->
  <div class="flex items-center gap-2 px-3.5 py-2.5 border-b border-base-300 bg-base-200/50">
    <span class="badge badge-info gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>
      {totalPortals}
    </span>
    <span class="badge badge-success gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="7" y1="17" x2="17" y2="7"/><circle cx="5" cy="19" r="2.5" fill="currentColor"/><circle cx="19" cy="5" r="2.5" fill="currentColor"/></svg>
      {totalLinks}
    </span>
    <span class="badge badge-warning gap-1">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12,3 22,21 2,21"/></svg>
      {totalFields}
    </span>
  </div>

  <!-- Agent list -->
  <div class="flex-1 overflow-y-auto p-2 space-y-2.5">
    {#if agents.length === 0}
      <div class="text-center text-base-content/40 text-sm py-8">
        No agents yet.<br />
        Click below to add one.
      </div>
    {:else}
      {#each agents as agent, idx (agent.id)}
        <div
          class="relative card compact bg-base-200 p-3.5 hover:bg-base-300 transition-colors border-2 cursor-pointer"
          class:border-primary={selectedAgentId === agent.id}
          class:border-transparent={selectedAgentId !== agent.id}
        >
          <button
            class="w-full text-left"
            onclick={() => handleSelect(agent.id)}
          >
            <div class="flex items-center gap-1.5">
              {#if editingAgentId === agent.id}
                <div class="flex items-center gap-1 flex-1 min-w-0" onclick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    class="input input-xs input-bordered flex-1 min-w-0 max-w-36"
                    value={editValue}
                    oninput={(e) => { editValue = (e.target as HTMLInputElement).value; editError = '' }}
                    onkeydown={(e) => handleEditKeydown(e, agent.id)}
                    autofocus
                  />
                  <button
                    class="btn btn-xs btn-success btn-ghost p-0.5"
                    onclick={() => confirmEdit(agent.id)}
                    title="Confirm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button
                    class="btn btn-xs btn-error btn-ghost p-0.5"
                    onclick={cancelEdit}
                    title="Cancel"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              {:else}
                {#if idx < 9}
                  <kbd class="kbd kbd-xs opacity-50">{idx + 1}</kbd>
                {/if}
                <span class="font-semibold text-base truncate" style="color: {getAgentColor(agent.id, agents)}">{agent.name}</span>
                <button
                  class="btn btn-xs btn-ghost p-0 shrink-0 text-base-content/30 hover:text-base-content/70"
                  onclick={(e) => { e.stopPropagation(); startEdit(agent.id, agent.name) }}
                  title="Edit name"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              {/if}
            </div>
            {#if editingAgentId === agent.id && editError}
              <div class="text-xs text-error mt-0.5">{editError}</div>
            {/if}
            <div class="flex gap-2 mt-1">
              <span class="badge badge-sm badge-ghost gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="7" y1="17" x2="17" y2="7"/><circle cx="5" cy="19" r="2.5" fill="currentColor"/><circle cx="19" cy="5" r="2.5" fill="currentColor"/></svg>
                {agent.linkCount}
              </span>
              <span class="badge badge-sm badge-ghost gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12,3 22,21 2,21"/></svg>
                {agent.fieldCount}
              </span>
            </div>
            <div class="text-base font-mono text-base-content/60 mt-1">
              AP: <span class="text-warning font-bold">{agent.ap.toLocaleString()}</span>
            </div>
            <div class="text-base font-mono mt-1 {scoringRuleId ? 'text-base-content/60' : 'text-base-content/25'}">
              Score: <span class={scoringRuleId ? 'text-info font-bold' : 'text-base-content/25'}>{agent.score}</span>
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
    <button
      class="btn btn-outline btn-primary btn-sm w-full gap-1"
      disabled={agents.length >= 16}
      onclick={handleAdd}
      title="Add Agent"
    >
      <span class="text-base font-bold leading-none">+</span>
      <span>Add Agent</span>
    </button>
  </div>
</div>

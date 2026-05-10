<script lang="ts">
  import { toastStore, type ToastMessage } from '../stores/gameStore'

  let messages: ToastMessage[] = $state([])

  toastStore.subscribe(m => {
    messages = m
  })
</script>

{#if messages.length > 0}
  <div class="toast toast-top toast-center z-[100] pointer-events-none">
    {#each messages as msg (msg.id)}
      <div
        class="alert alert-{msg.type} text-white shadow-lg pointer-events-auto max-w-xs"
      >
        <span>{msg.text}</span>
      </div>
    {/each}
  </div>
{/if}

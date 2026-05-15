<script lang="ts">
  import { onMount } from 'svelte'

  let isDark = $state(true)

  onMount(() => {
    isDark = document.documentElement.getAttribute('data-theme') !== 'xianii-light'
  })

  function toggle() {
    isDark = !isDark
    const theme = isDark ? 'xianii-dark' : 'xianii-light'
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }
</script>

<button
  class="btn btn-ghost btn-sm btn-circle"
  onclick={toggle}
  aria-label="Toggle theme"
  title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
>
  <span class="swap swap-rotate" class:swap-active={!isDark}>
    <svg class="swap-on w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
    <svg class="swap-off w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  </span>
</button>

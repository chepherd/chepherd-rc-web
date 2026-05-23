<!--
  ShortcutFooter — the persistent footer bar of keyboard shortcuts.
  See docs/DESIGN-SYSTEM.md §9.3.
-->
<script lang="ts">
  interface Shortcut {
    key: string;
    desc: string;
  }
  interface Props {
    shortcuts: Shortcut[];
  }
  const { shortcuts }: Props = $props();
</script>

<nav class="shortcut-footer" aria-label="Keyboard shortcuts">
  {#each shortcuts as s}
    <span class="pair">
      <span class="shortcut-key">{s.key}</span>
      <span class="shortcut-desc">{s.desc}</span>
    </span>
  {/each}
</nav>

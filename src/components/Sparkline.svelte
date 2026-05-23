<!--
  Sparkline — 8-cell trend bar using ▁▂▃▄▅▆▇█ glyphs.
  See docs/DESIGN-SYSTEM.md §5.4.
-->
<script lang="ts">
  interface Props {
    /** Series of values 0-10. Last 8 are rendered. */
    values: number[];
    /** Current value (shown trailing the bars). */
    current?: number;
  }
  const { values, current }: Props = $props();

  const GLYPHS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

  function glyphFor(v: number): string {
    const clamped = Math.max(0, Math.min(10, v));
    const idx = Math.floor((clamped / 10) * (GLYPHS.length - 1));
    return GLYPHS[idx]!;
  }

  function bandFor(v: number): string {
    if (v <= 3) return 'crisis';
    if (v <= 6) return 'concerned';
    return 'trusted';
  }

  const trailing = $derived(values.slice(-8));
</script>

<span class="sparkline" aria-label="trend">
  {#each trailing as v}
    <span
      class="cell"
      style="color: var(--c-band-{bandFor(v)});"
      aria-hidden="true"
    >
      {glyphFor(v)}
    </span>
  {/each}
  {#if current !== undefined}
    <span
      class="value"
      style="color: var(--c-band-{bandFor(current)});"
    >
      {current}
    </span>
  {/if}
</span>

<style>
  .sparkline {
    display: inline-flex;
    align-items: center;
    gap: 0;
    font-variant-numeric: tabular-nums;
  }
  .cell {
    width: 1ch;
  }
  .value {
    margin-left: var(--space-1);
    font-weight: var(--fw-bold);
  }
</style>

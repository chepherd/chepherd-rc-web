<!--
  Scorecard — the G/V/F/E 4-axis panel.
  See docs/DESIGN-SYSTEM.md §9.2.
-->
<script lang="ts">
  interface Props {
    G: number;
    V: number;
    F: number;
    E: number;
    /** Optional historic series for sparklines (per axis). */
    history?: {
      G?: number[];
      V?: number[];
      F?: number[];
      E?: number[];
    };
  }
  const { G, V, F, E, history }: Props = $props();

  const rows = $derived([
    { axis: 'G', label: 'goal     ', value: G, series: history?.G ?? [G] },
    { axis: 'V', label: 'velocity ', value: V, series: history?.V ?? [V] },
    { axis: 'F', label: 'focus    ', value: F, series: history?.F ?? [F] },
    { axis: 'E', label: 'end-state', value: E, series: history?.E ?? [E] },
  ]);

  function gaugeBar(v: number): string {
    const filled = Math.max(0, Math.min(10, v));
    return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
  }
  function bandFor(v: number): string {
    if (v <= 3) return 'crisis';
    if (v <= 6) return 'concerned';
    return 'trusted';
  }
</script>

<div class="scorecard" role="group" aria-label="Scorecard">
  {#each rows as row}
    <div class="row">
      <span class="axis">{row.axis}</span>
      <span class="label">{row.label}</span>
      <span class="colon">:</span>
      <span
        class="value"
        style="color: var(--c-band-{bandFor(row.value)});"
      >
        {row.value} / 10
      </span>
      <span
        class="gauge"
        style="color: var(--c-band-{bandFor(row.value)});"
        aria-hidden="true"
      >
        {gaugeBar(row.value)}
      </span>
    </div>
  {/each}
</div>

<style>
  .scorecard {
    display: grid;
    grid-template-columns: 1fr;
    row-gap: var(--space-1);
    font-variant-numeric: tabular-nums;
  }
  .row {
    display: grid;
    grid-template-columns: auto auto auto auto 1fr;
    column-gap: var(--space-2);
    align-items: baseline;
  }
  .axis {
    font-weight: var(--fw-bold);
    color: var(--c-title);
  }
  .label {
    color: var(--c-body);
  }
  .colon {
    color: var(--c-body);
  }
  .value {
    font-weight: var(--fw-bold);
  }
  .gauge {
    letter-spacing: -0.05em;
  }
</style>

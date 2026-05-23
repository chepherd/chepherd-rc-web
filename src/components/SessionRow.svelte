<!--
  SessionRow — one row in the dashboard session list.
  See docs/DESIGN-SYSTEM.md §9.1.
-->
<script lang="ts">
  import type { SessionState } from '../protocol/payloads';
  import BandDot from './BandDot.svelte';

  interface Props {
    session: SessionState;
    selected?: boolean;
    onSelect?: (uuid: string) => void;
  }
  const { session, selected = false, onSelect }: Props = $props();

  function fmtNextTick(iso?: string): string {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    const dt = Math.round((t - Date.now()) / 1000);
    if (dt <= 0) return 'now';
    if (dt < 60) return `${dt}s`;
    if (dt < 3600) return `${Math.round(dt / 60)}m`;
    return `${Math.round(dt / 3600)}h`;
  }

  const verdictColor = $derived(
    session.last_verdict ? `verdict-${session.last_verdict}` : 'verdict-silent',
  );
</script>

<button
  class="row"
  class:selected
  onclick={() => onSelect?.(session.uuid)}
  type="button"
  aria-pressed={selected}
>
  <BandDot band={session.trust_band} paused={session.paused} />
  <span class="name">{session.tmux_name}</span>
  {#if session.repo}
    <span class="repo">{session.repo}</span>
  {/if}
  {#if session.last_scorecard}
    <span class="score">
      G{session.last_scorecard.G} V{session.last_scorecard.V} F{session.last_scorecard.F} E{session.last_scorecard.E}
    </span>
  {/if}
  <span class="verdict" style="color: var(--c-{verdictColor});">
    {session.last_verdict ?? '—'}
  </span>
  <span class="next">→ {fmtNextTick(session.next_tick_at)}</span>
</button>

<style>
  .row {
    display: grid;
    grid-template-columns: auto 1fr 1fr auto auto auto;
    align-items: center;
    column-gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    width: 100%;
    border: none;
    background: transparent;
    color: var(--c-primary);
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition:
      background var(--motion-quick) var(--ease-out),
      color var(--motion-quick) var(--ease-out);
  }
  .row:hover {
    background: rgba(0, 255, 255, 0.08);
  }
  .row.selected {
    background: var(--c-title);
    color: var(--c-background);
    font-weight: var(--fw-bold);
  }
  .row.selected .verdict,
  .row.selected .repo,
  .row.selected .score,
  .row.selected .next {
    color: var(--c-background) !important;
  }
  .name {
    font-weight: var(--fw-bold);
  }
  .repo {
    color: var(--c-issue-ref);
    font-size: var(--fs-sm);
  }
  .score {
    color: var(--c-metric);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
  }
  .verdict {
    font-size: var(--fs-sm);
    text-transform: lowercase;
  }
  .next {
    color: var(--c-timestamp);
    font-size: var(--fs-sm);
  }
</style>

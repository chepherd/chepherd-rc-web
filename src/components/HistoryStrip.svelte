<!--
  HistoryStrip — verdict-history mini-strip per session.
  Renders the last N verdicts as small coloured dots so the operator
  sees the recent trend at a glance.
  See docs/DESIGN-SYSTEM.md §5.4 — adjacent to the Sparkline pattern.
-->
<script lang="ts">
  import type { VerdictPayload } from '../protocol/payloads';

  interface Props {
    verdicts: VerdictPayload[];
    /** Max dots to render. Latest is rightmost. */
    limit?: number;
  }
  const { verdicts, limit = 12 }: Props = $props();

  const trailing = $derived(verdicts.slice(-limit));

  function tokenFor(v: VerdictPayload): string {
    switch (v.verdict) {
      case 'silent': return 'verdict-silent';
      case 'praise': return 'verdict-praise';
      case 'coach': return 'verdict-coach';
      case 'intervene': return 'verdict-intervene';
    }
  }

  function titleFor(v: VerdictPayload): string {
    const parts = [v.verdict];
    if (v.scorecard) {
      parts.push(
        `G${v.scorecard.G} V${v.scorecard.V} F${v.scorecard.F} E${v.scorecard.E}`,
      );
    }
    if (v.principle_ref) parts.push(v.principle_ref);
    return parts.join(' · ');
  }
</script>

<span class="strip" role="img" aria-label="verdict history">
  {#each trailing as v}
    <span
      class="dot"
      style="color: var(--c-{tokenFor(v)});"
      title={titleFor(v)}
      aria-hidden="true"
    >
      ●
    </span>
  {/each}
  {#if trailing.length === 0}
    <span class="empty">—</span>
  {/if}
</span>

<style>
  .strip {
    display: inline-flex;
    gap: 1px;
    font-size: var(--fs-sm);
    line-height: 1;
    align-items: center;
  }
  .dot {
    transition: color var(--motion-quick) var(--ease-out);
  }
  .empty {
    color: var(--c-timestamp);
    font-size: var(--fs-xs);
  }
</style>

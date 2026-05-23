<!--
  BandDot — the canonical chepherd session indicator (●/○ glyph in
  band-coloured fill). See docs/DESIGN-SYSTEM.md §5.6.
-->
<script lang="ts">
  import type { SessionState } from '../protocol/payloads';

  interface Props {
    band: SessionState['trust_band'];
    paused?: boolean;
    /** Optional aria label; defaults to "<band>" or "paused". */
    ariaLabel?: string;
  }
  const { band = 'standard', paused = false, ariaLabel }: Props = $props();

  const glyph = $derived(paused ? '○' : '●');
  const colorVar = $derived(paused ? 'paused' : band);
  const label = $derived(ariaLabel ?? (paused ? 'paused' : (band ?? 'standard')));
</script>

<span
  class="band-dot"
  style="color: var(--c-band-{colorVar});"
  aria-label={label}
  role="img"
>
  {glyph}
</span>

<style>
  .band-dot {
    display: inline-block;
    font-size: var(--fs-base);
    line-height: 1;
    transition: color var(--motion-normal) var(--ease-out);
  }
</style>

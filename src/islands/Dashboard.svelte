<!--
  Dashboard island — the W1 chepherd dashboard, port of the TUI's
  internal/tui/dashboard.go.

  Responsibilities:
    - bootstrap a Transport via newTransport(loadConfig())
    - listen for `state` envelopes; render the session list (left pane)
    - render the detail pane for the selected session (right pane)
    - persistent shortcut footer + breadcrumb
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import SessionRow from '../components/SessionRow.svelte';
  import Scorecard from '../components/Scorecard.svelte';
  import BandDot from '../components/BandDot.svelte';
  import ShortcutFooter from '../components/ShortcutFooter.svelte';
  import { newTransport } from '../protocol/transport';
  import { HTTPSignaling } from '../protocol/signaling';
  import { SessionStore } from '../lib/session-store';
  import { getValidAccessToken } from '../auth/auth';
  import { loadConfig } from '../lib/config';
  import { initObservability, captureException, startSpan } from '../lib/observability';

  let store = $state<SessionStore | null>(null);
  let selectedUuid = $state<string | null>(null);
  let connectError = $state<string | null>(null);

  const selected = $derived(
    store?.sessions.find((s) => s.uuid === selectedUuid) ?? null,
  );

  onMount(async () => {
    const cfg = loadConfig();
    await initObservability();
    const bootSpan = startSpan('dashboard.bootstrap');
    const authToken = await getValidAccessToken({
      idpBaseUrl: cfg.idpBaseUrl,
      clientId: cfg.clientId,
      redirectUri: cfg.redirectUri,
      scope: cfg.scope,
    });
    if (!authToken) {
      window.location.assign('/app/');
      return;
    }
    try {
      const signaling = new HTTPSignaling({
        baseUrl: cfg.relayBaseUrl,
        authToken,
      });
      // Bastion ID will be supplied by /v1/bastions in a later wave.
      // For now, default to the user's primary bastion claim from the JWT.
      const bastionId = parseBastionFromJwt(authToken) ?? 'primary';
      const transport = newTransport({
        mode: cfg.defaultMode,
        bastionId,
        authToken,
        signaling,
        iceServers: cfg.iceServers,
        wsUrl: cfg.relayWsUrl,
      });
      const s = new SessionStore(transport);
      store = s;
      await s.connect();
      // Auto-select the first session.
      if (s.sessions.length > 0) selectedUuid = s.sessions[0]!.uuid;
      bootSpan.setAttribute('transport.kind', transport.kind);
      bootSpan.setAttribute('sessions.count', s.sessions.length);
    } catch (err) {
      connectError = (err as Error).message;
      captureException(err);
    } finally {
      bootSpan.end();
    }
  });

  onDestroy(() => {
    void store?.close();
  });

  function parseBastionFromJwt(jwt: string): string | null {
    try {
      const [, payloadB64] = jwt.split('.');
      if (!payloadB64) return null;
      const pad = '='.repeat((4 - (payloadB64.length % 4)) % 4);
      const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/') + pad);
      const claims = JSON.parse(json) as Record<string, unknown>;
      const bid = claims['chepherd_bastion'] ?? claims['bid'];
      return typeof bid === 'string' ? bid : null;
    } catch {
      return null;
    }
  }

  function handleSelect(uuid: string): void {
    selectedUuid = uuid;
  }

  async function handlePauseToggle(): Promise<void> {
    if (!store || !selected) return;
    await store.sendCommand(
      selected.uuid,
      selected.paused ? 'unpause' : 'pause',
    );
  }
</script>

<div class="breadcrumb">
  <span>chepherd</span>
  <span aria-hidden="true">›</span>
  <span class="breadcrumb-leaf">sessions</span>
</div>

{#if connectError}
  <div class="pane error" role="alert">
    <p>could not connect: {connectError}</p>
  </div>
{:else if !store}
  <div class="pane">connecting…</div>
{:else}
  <div class="dashboard-grid">
    <section class="pane sessions-pane" aria-label="Sessions">
      <h2 class="pane-title">
        sessions
        <span class="meta">
          <BandDot
            band="standard"
            paused={store.transportState !== 'open'}
            ariaLabel={store.transportState}
          />
          {store.transportKind}/{store.transportState}
        </span>
      </h2>
      {#if store.sessions.length === 0}
        <p class="empty">no sessions yet</p>
      {:else}
        <ul class="session-list">
          {#each store.sessions as session}
            <li>
              <SessionRow
                session={session}
                selected={session.uuid === selectedUuid}
                onSelect={handleSelect}
              />
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="pane detail-pane" aria-label="Session detail">
      <h2 class="pane-title">detail</h2>
      {#if selected}
        <header class="detail-header">
          <BandDot band={selected.trust_band} paused={selected.paused} />
          <strong>{selected.tmux_name}</strong>
          {#if selected.repo}
            <span class="repo">{selected.repo}</span>
          {/if}
        </header>

        {#if selected.last_scorecard}
          <Scorecard
            G={selected.last_scorecard.G}
            V={selected.last_scorecard.V}
            F={selected.last_scorecard.F}
            E={selected.last_scorecard.E}
          />
        {/if}

        <div class="cmd-bar">
          <button onclick={handlePauseToggle} type="button">
            {selected.paused ? 'unpause' : 'pause'}
          </button>
          <button
            onclick={() => store?.sendCommand(selected.uuid, 'refresh')}
            type="button"
          >
            refresh
          </button>
        </div>

        <h3 class="subtitle">log</h3>
        <pre class="log">{store.logs
          .filter((l) => l.session === selected.tmux_name)
          .slice(-50)
          .map((l) => `${new Date(l.at).toISOString().slice(11, 19)} ${l.level.padEnd(7)} ${l.text}`)
          .join('\n')}</pre>
      {:else}
        <p class="empty">select a session</p>
      {/if}
    </section>
  </div>
{/if}

<ShortcutFooter
  shortcuts={[
    { key: 'p', desc: 'pause/unpause' },
    { key: 'r', desc: 'refresh' },
    { key: '/', desc: 'filter' },
    { key: '?', desc: 'help' },
    { key: 'q', desc: 'sign out' },
  ]}
/>

<style>
  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(320px, 1fr) 2fr;
    gap: var(--space-4);
    margin-top: var(--space-4);
  }
  @media (max-width: 800px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }
  .sessions-pane,
  .detail-pane {
    min-height: 480px;
  }
  .pane-title .meta {
    margin-left: auto;
    font-size: var(--fs-sm);
    color: var(--c-body);
    font-weight: var(--fw-normal);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .session-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .empty {
    color: var(--c-timestamp);
    text-align: center;
    padding: var(--space-6) 0;
  }
  .detail-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    font-size: var(--fs-lg);
  }
  .detail-header .repo {
    color: var(--c-issue-ref);
    font-size: var(--fs-sm);
    margin-left: var(--space-2);
  }
  .subtitle {
    margin: var(--space-6) 0 var(--space-2);
    font-size: var(--fs-base);
    color: var(--c-title);
  }
  .log {
    background: var(--c-background);
    color: var(--c-body);
    padding: var(--space-3);
    border: 1px solid var(--c-border);
    overflow: auto;
    max-height: 320px;
    font-size: var(--fs-sm);
    white-space: pre-wrap;
    margin: 0;
  }
  .cmd-bar {
    display: flex;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }
  .error {
    border-color: var(--c-api-error);
    color: var(--c-api-error);
  }
</style>

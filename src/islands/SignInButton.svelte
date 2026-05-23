<!-- Client-only Svelte island wrapping the OAuth2 PKCE redirect. -->
<script lang="ts">
  import { beginLogin } from '../auth/auth';
  import { loadConfig } from '../lib/config';

  let busy = $state(false);
  let error = $state<string | null>(null);

  async function onClick(): Promise<void> {
    busy = true;
    error = null;
    try {
      const cfg = loadConfig();
      await beginLogin({
        idpBaseUrl: cfg.idpBaseUrl,
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        scope: cfg.scope,
      });
    } catch (err) {
      error = (err as Error).message;
      busy = false;
    }
  }
</script>

<button onclick={onClick} disabled={busy} type="button">
  {busy ? 'redirecting...' : 'sign in with OpenOva'}
</button>
{#if error}
  <p class="error" role="alert">{error}</p>
{/if}

<style>
  button {
    font-size: var(--fs-base);
    padding: var(--space-3) var(--space-6);
    background: var(--c-logo);
    color: var(--c-background);
    border: none;
    font-weight: var(--fw-bold);
    cursor: pointer;
    transition: opacity var(--motion-quick) var(--ease-out);
  }
  button:hover:not(:disabled) {
    opacity: 0.85;
  }
  .error {
    margin-top: var(--space-3);
    color: var(--c-api-error);
    font-size: var(--fs-sm);
  }
</style>

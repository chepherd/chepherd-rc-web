<!-- Completes the OAuth2 code exchange + navigates to /dashboard. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { completeLogin } from '../auth/auth';
  import { loadConfig } from '../lib/config';

  let status = $state<'pending' | 'ok' | 'err'>('pending');
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const cfg = loadConfig();
      await completeLogin({
        idpBaseUrl: cfg.idpBaseUrl,
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        scope: cfg.scope,
      });
      status = 'ok';
      window.location.assign('/app/dashboard');
    } catch (err) {
      status = 'err';
      error = (err as Error).message;
    }
  });
</script>

{#if status === 'pending'}
  <p>exchanging code…</p>
{:else if status === 'ok'}
  <p>redirecting to dashboard…</p>
{:else}
  <p class="error" role="alert">sign-in failed: {error}</p>
  <p><a href="/app/">return to sign-in</a></p>
{/if}

<style>
  .error {
    color: var(--c-api-error);
  }
</style>

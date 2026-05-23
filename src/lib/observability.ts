// Browser observability — Sentry (error capture) + OpenTelemetry
// (distributed tracing across browser ↔ relay ↔ daemon).
//
// SDKs are loaded lazily so the static-built bundle doesn't pay the
// observability tax on first paint. init() is safe to call once at app
// boot; it's idempotent and runs nothing if neither DSN nor OTel
// endpoint is configured (e.g. local development).
//
// Privacy: NO content of any frame (state/log/verdict) is sent to
// either Sentry or OTel. Only counts + transitions + error stack traces.

import { loadConfig } from './config';

interface ObsConfig {
  sentryDsn?: string;
  otelEndpoint?: string;
  release: string;
}

let initialised = false;
let sentryCapture: ((err: unknown) => void) | null = null;
let otelTracer: { startSpan: (name: string) => Span } | null = null;

interface Span {
  setAttribute(k: string, v: string | number | boolean): void;
  end(): void;
}

/**
 * Initialize observability. Idempotent. Safe to call from any island.
 *
 * Reads PUBLIC_CHEPHERD_SENTRY_DSN + PUBLIC_CHEPHERD_OTEL_ENDPOINT from
 * window.CHEPHERD_CONFIG (loadConfig). When DSNs are absent the SDKs
 * are not loaded at all.
 */
export async function initObservability(cfg?: Partial<ObsConfig>): Promise<void> {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;

  const runtime = loadConfig() as ReturnType<typeof loadConfig> & {
    sentryDsn?: string;
    otelEndpoint?: string;
  };
  const merged: ObsConfig = {
    sentryDsn: cfg?.sentryDsn ?? runtime.sentryDsn,
    otelEndpoint: cfg?.otelEndpoint ?? runtime.otelEndpoint,
    release: cfg?.release ?? `chepherd-rc-web@${getBuildVersion()}`,
  };

  if (merged.sentryDsn) {
    await loadSentry(merged);
  }
  if (merged.otelEndpoint) {
    await loadOtel(merged);
  }

  // Global handlers — capture anything that escapes try/catch.
  window.addEventListener('error', (ev) => {
    captureException(ev.error ?? ev.message);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    captureException(ev.reason);
  });
}

/** Capture an exception. No-op until init() loads Sentry. */
export function captureException(err: unknown): void {
  if (sentryCapture) sentryCapture(err);
  else console.error('chepherd obs (pre-init):', err);
}

/** Start a span for one operation. Returns a no-op span pre-init. */
export function startSpan(name: string): Span {
  if (otelTracer) return otelTracer.startSpan(name);
  return noopSpan();
}

function noopSpan(): Span {
  return {
    setAttribute: () => {},
    end: () => {},
  };
}

function getBuildVersion(): string {
  // injected at build time via `vite --define` or import.meta.env.
  return (
    (typeof import.meta !== 'undefined' &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (import.meta as any).env?.['PUBLIC_CHEPHERD_VERSION']) ||
    'dev'
  );
}

async function loadSentry(cfg: ObsConfig): Promise<void> {
  try {
    // Dynamic import so Sentry doesn't bloat first-paint when DSN absent.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Sentry = (await import(/* @vite-ignore */ '@sentry/browser')) as any;
    Sentry.init({
      dsn: cfg.sentryDsn,
      release: cfg.release,
      tracesSampleRate: 0.05,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      // Strip query strings + auth tokens from breadcrumbs.
      beforeBreadcrumb(crumb: { category?: string; data?: Record<string, unknown> }) {
        if (crumb.category === 'fetch' || crumb.category === 'xhr') {
          const url = crumb.data?.['url'];
          if (typeof url === 'string') {
            crumb.data!['url'] = url.split('?')[0]!;
          }
        }
        return crumb;
      },
      beforeSend(event: { request?: { headers?: Record<string, string> } }) {
        // NEVER ship Authorization headers to Sentry.
        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['authorization'];
        }
        return event;
      },
    });
    sentryCapture = (err: unknown) => Sentry.captureException(err);
  } catch (err) {
    console.warn('chepherd obs: Sentry load failed', err);
  }
}

async function loadOtel(cfg: ObsConfig): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdk = (await import(/* @vite-ignore */ '@opentelemetry/sdk-trace-web')) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exp = (await import(/* @vite-ignore */ '@opentelemetry/exporter-trace-otlp-http')) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (await import(/* @vite-ignore */ '@opentelemetry/resources')) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sem = (await import(/* @vite-ignore */ '@opentelemetry/semantic-conventions')) as any;

    const provider = new sdk.WebTracerProvider({
      resource: new res.Resource({
        [sem.SemanticResourceAttributes.SERVICE_NAME]: 'chepherd-rc-web',
        [sem.SemanticResourceAttributes.SERVICE_VERSION]: cfg.release,
      }),
    });
    provider.addSpanProcessor(
      new sdk.BatchSpanProcessor(
        new exp.OTLPTraceExporter({ url: cfg.otelEndpoint }),
      ),
    );
    provider.register();
    otelTracer = provider.getTracer('chepherd-rc-web');
  } catch (err) {
    console.warn('chepherd obs: OTel load failed', err);
  }
}

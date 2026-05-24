# chepherd-rc-web

[![web-build](https://github.com/chepherd/chepherd-rc-web/actions/workflows/web-build.yml/badge.svg)](https://github.com/chepherd/chepherd-rc-web/actions/workflows/web-build.yml)
[![release](https://img.shields.io/github/v/tag/chepherd/chepherd-rc-web?label=release&sort=semver)](https://github.com/chepherd/chepherd-rc-web/releases)

Browser client for [chepherd-rc](https://chepherd.org) — drive your chepherd dashboard from any browser, privacy-preserving by default.

## What it does

A first-class web equivalent of the chepherd terminal UI:
- Live dashboard mirroring W1 (session list + detail + log + footer)
- WebRTC DataChannel transport — **your session data NEVER touches the relay's data plane**
- Pause / unpause / inject custom messages from any tablet, laptop, phone
- Real-time log tail at 60fps on cellular
- k9s palette throughout, dark/light/system theme, WCAG 2.2 AA

## Stack

- [Astro 5](https://astro.build) for static-first rendering, View Transitions, near-zero JS on first paint
- [Svelte 5](https://svelte.dev) islands for the interactive panes
- TypeScript strict + `chepherd-rc protocol v1` typed client
- Native `RTCPeerConnection` (no third-party WebRTC library — every modern browser has it)
- Web app served by [chepherd-relay](https://github.com/chepherd/chepherd-relay) at `/app/*`

## Local development

```bash
pnpm install
pnpm dev          # local dev server at http://localhost:4321
pnpm build        # production build → dist/
pnpm preview      # preview the production build
pnpm test         # vitest + playwright e2e
```

## Privacy contract

When you sign in and connect to a bastion, the data plane is established via WebRTC DataChannel:
- The relay sees: your OAuth bearer token + WebRTC signaling (SDP/ICE)
- The relay never sees: session state, log lines, verdict reasoning, your typed messages

This is enforced by the `protocol v1` design — see [chepherd/chepherd/docs/PROTOCOL.md](https://github.com/chepherd/chepherd/blob/main/docs/PROTOCOL.md) §8.

## Deployment

Built statically. Lives behind the chepherd-relay ingress at `https://rc.openova.io/app/*`. Default canonical deployment per OpenOva Sovereign; users may self-host by deploying this repo's `dist/` to any static host pointed at their own relay.

## License

MIT.

## Related

- chepherd (main repo): https://github.com/chepherd/chepherd
- chepherd-relay (signaling server): https://github.com/chepherd/chepherd-relay
- iOS client: https://github.com/chepherd/chepherd-rc-ios (TBD)
- Android client: https://github.com/chepherd/chepherd-rc-android (TBD)

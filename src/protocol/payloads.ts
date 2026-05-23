// Typed payloads for each protocol v1 §4 message. Mirrors the Go shape in
// github.com/chepherd/chepherd/internal/daemon/rc/envelope/payloads.go.
//
// Any drift between this file and the Go file is a protocol bug.

export interface RegisterPayload {
  bastion_id: string;
  user_id: string;
  chepherd_version: string;
  capabilities: string[];
  session_count: number;
  hostname?: string;
  /** Only on RECONNECT — see PROTOCOL.md §5. */
  last_seen_seq?: number;
}

export interface SessionState {
  uuid: string;
  tmux_name: string;
  repo?: string;
  trust_band?: 'trusted' | 'standard' | 'concerned' | 'crisis' | 'paused';
  last_verdict?: 'silent' | 'praise' | 'coach' | 'intervene';
  last_scorecard?: { G: number; V: number; F: number; E: number };
  next_tick_at?: string;
  live_signals?: LiveSignals;
  intervention_count?: number;
  last_intervention_at?: string;
  paused: boolean;
}

export interface LiveSignals {
  refreshed_at: string;
  in_progress_count: number;
  backlog_count: number;
  unclaimed_backlog_count: number;
  commits_last_hour_count: number;
  git_last_commit_age_min: number;
  tracker_mtime_age_min: number;
}

export interface StatePayload {
  sessions: SessionState[];
}

export interface LogPayload {
  session: string;
  level: 'verdict' | 'info' | 'warn' | 'error';
  text: string;
}

export interface VerdictPayload {
  session_uuid: string;
  session: string;
  verdict: 'silent' | 'praise' | 'coach' | 'intervene';
  principle_ref?: string;
  scorecard?: { G: number; V: number; F: number; E: number };
  scorecard_note?: string;
  message?: string;
  cost_usd?: number;
  injected: boolean;
}

export interface CommandPayload {
  session_uuid: string;
  action: 'pause' | 'unpause' | 'refresh' | 'inject' | 'tmux_attach_hint';
  args?: Record<string, unknown>;
}

export interface AckPayload {
  in_reply_to: number;
  ok: boolean;
  result?: string;
  error?: string;
}

export type PingPayload = Record<string, never>;
export interface PongPayload {
  in_reply_to: number;
}

export interface ErrorPayload {
  code:
    | 'AUTH_REVOKED'
    | 'RATE_LIMIT'
    | 'PROTOCOL_VIOLATION'
    | 'VERSION_MISMATCH'
    | 'RESUME_GAP'
    | 'BASTION_UNREACHABLE'
    | 'UNKNOWN_SESSION'
    | 'UNKNOWN_COMMAND'
    | 'INTERNAL_ERROR';
  in_reply_to?: number;
  message: string;
}

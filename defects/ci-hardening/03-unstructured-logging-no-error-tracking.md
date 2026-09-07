# Logging is unstructured text (not JSON) and no error-tracking service is configured

- **Priority:** Normal
- **Type:** CI Hardening / Observability
- **Component:** Backend
- **Status:** Open

## Description

Several backend services (`ProjectsSyncService`, `LeavesSyncService`,
`TimelineEventWriterService`, and others) use NestJS's built-in `Logger`
class with plain interpolated strings (e.g. `projects-sync.service.ts:22,34,
108,125`) — real logging, not `console.log`, but human-readable text, not
JSON, with no correlation/trace ID and no documented schema. No Pino,
Winston, or equivalent structured-logging library is a dependency of either
service. No error-tracking service (Sentry, Datadog, Rollbar, or equivalent)
is configured or a dependency anywhere.

## Why this matters

`test-design-architecture.md` names "No observability stack. Structured
logs suffice; tracing is not warranted" as an *accepted trade-off* for this
project's demo-scale MVP — a reasonable call in principle, but "structured
logs suffice" is not currently true in the literal sense, since the logs
that exist aren't structured. Worth either fixing the gap or updating the
documented trade-off to match reality.

## Recommended fix (pick one, team's call)

1. Adopt a structured-logging library (Pino is the common NestJS pairing) —
   low effort, no architecture change.
2. Or: explicitly update `test-design-architecture.md`'s accepted-trade-off
   wording to say "plain-text logs, no structured schema" so the doc matches
   what's actually implemented.

## Source

- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Maintainability §Observability)
- [`_bmad-output/test-artifacts/test-design-architecture.md`](../../../../_bmad-output/test-artifacts/test-design-architecture.md) (accepted trade-off)

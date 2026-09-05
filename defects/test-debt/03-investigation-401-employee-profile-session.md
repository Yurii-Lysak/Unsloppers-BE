# Session unexpectedly invalidated mid-suite in employee-profile.e2e-spec.ts (not root-caused)

- **Priority:** Normal
- **Type:** Needs Investigation
- **Component:** Backend / Auth or Test Suite (unclear which — that's the open question)
- **Status:** Open

## Description

`test/employee-profile.e2e-spec.ts` fails at lines 367, 405 and 440 — the
last three tests in the file — each with a `401` on the **first** request of
the test, before any mutation happens. This rules out the initial hypothesis
that reassigning a manager mid-test invalidates the session (the failure
happens before any such action).

The shared `colleagueAgent` cookie (established earlier in the file) is
simply no longer accepted by the time these tests run.

## Two open hypotheses, neither confirmed

1. Something earlier in the file invalidates that session (e.g. a side
   effect of an earlier test touching the same user/session).
2. The `FixedClock` test double used by this suite interacts badly with the
   JWT `exp`/`iat` window — e.g. the fixed clock jumps past the token's
   expiry between tests.

## What's needed

Someone who knows the intended session/JWT expiry semantics to pin this down
— this is the one item in the whole diagnosis pass that could not be
root-caused with the time available.

## Source

- [`_bmad-output/test-artifacts/known-red-diagnosis.md`](../../../../_bmad-output/test-artifacts/known-red-diagnosis.md) (item 3f)
- [`_bmad-output/test-artifacts/nfr-assessment.md`](../../../../_bmad-output/test-artifacts/nfr-assessment.md) (Evidence Gaps — "Session-invalidation root cause")

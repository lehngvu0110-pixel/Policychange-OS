# Engineering remediation

Scope: current checkout, 2026-10-17. Baseline: clean working tree; 299 Node tests and `npm run typecheck` pass. No production writes, deployment, push, or production migration is authorized.

## Verified findings

| Severity | Evidence | Impact |
|---|---|---|
| High | `legal-status.assess()` defaults to IN_FORCE without checking graph completeness; `officialBucket()` groups suspension with expiry. | Missing evidence becomes apparent legal certainty. |
| High | `legal-page.parse()` accepts an identifier anywhere in page text. | A citation can supply another document's metadata. |
| High | `legal-discovery.discover()` counts successful resolutions only and treats non-retryable errors as complete. | Failures escape budgets and conceal incomplete research. |
| High | `legal-discover.saveRun()` stores client graph, status and completeness after checking `run.live`. | A caller can forge trusted research records. |
| High | History UI loops over `app.undo()`, each persisted separately. | A failure can leave a partly restored document. |
| Medium | `legalWarnings()` drops unresolved references. | The change page can conceal research limitations. |

## Checklist

- [x] Add regressions for status, identity, budgets, persistence and restoration; initial status/retrieval regressions failed before fixes.
- [x] Propagate completeness, date limitations, suspension and relationship scope.
- [x] Bound retrieval, propagate abort, classify errors and preserve unresolved work.
- [x] Rebuild persisted research on the server from verified cache evidence; retain RLS.
- [x] Plan restoration on a copy and persist through the existing atomic `apply_change` RPC.
- [x] Align all UI consumers, API contracts and deployment instructions.
- [x] Run focused and full CI checks; review the final diff and record unavailable checks.

Local implementation and available checks are finished. Live legal-provider compatibility, PostgreSQL integration, production deployment and two existing semantic holdout errors remain explicitly unresolved in [the engineering report](../../ENGINEERING-REMEDIATION.md).

The trust boundary remains the existing Edge Function and service-only SQL RPC. Legal research remains advisory; only the deterministic engine, authorized decisions and Prover can produce policy patches.

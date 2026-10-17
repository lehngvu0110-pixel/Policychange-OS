# Engineering remediation report

17 October 2026. Target: the original checked-out branch and working tree. The tree was clean before work. Local remediation is implemented; deployment and live integration are not certified. No commits, pushes, production migrations, deployments, production data changes or secret changes were performed. No dependency was added.

## A. Findings

| Severity | Verified root cause and code evidence | Impact / disposition |
|---|---|---|
| High | `legal-status.assess()` returned IN_FORCE after finding no termination, without checking graph completeness. | Missing evidence could look like proof of effectiveness. Now requires complete scope and evidence covering the assessment date. |
| High | `officialBucket()` grouped “ngưng hiệu lực” with expiry; replacement/repeal handling assumed whole-document scope. | Suspension or partial/unknown changes could look permanent and total. Now separate suspension, explicit scope, conservative unknowns and provision-history limitations. |
| High | `legal-page.parse()` accepted an identifier anywhere in text, including citations. | Another page's dates/status could be attributed to the requested document. Now requires an exact number field and matching document title, rejects conflicts/search pages. |
| High | `legal-discovery.discover()` counted successful resolutions only; completeness depended on retryability. `legal-discover.resolve()` converted non-retryable failures into not-found. | Failed requests escaped limits; access/parser/identity failures disappeared into absence or complete graphs. Attempts, retries, nodes, edges, time and sizes are now bounded; failures and candidates remain visible. |
| High | `saveRun()` stored client graph, assessments and completeness after checking `run.live`. | Clients could forge trusted research. The HTTP schema now rejects those fields; the server reconstructs from validated cache evidence and computes assessments/hash itself. |
| High | History UI persisted sequential `app.undo()` calls. | Intermediate failure could leave partial restoration. Now one server plan and one existing transactional RPC; offline restoration publishes only after one durable snapshot succeeds. |
| Medium | `legalWarnings()` filtered out unresolved references; acknowledgement survived some context changes. | The change page could hide missing research or reuse an obsolete acknowledgement. Warnings retain gaps; date/run/workspace changes invalidate acknowledgement. |
| High, pre-existing | Holdout H40/H47 classify AUTO although labelled U1. An isolated in-memory `Workflow.prove()` and `Workflow.commit()` check confirmed both are allowed and applied. | Still unresolved. Engine and Prover source are unchanged. This existing semantic limitation is documented in `PHUONG-PHAP-KIEM-CHUNG.md` §4.2; the document explicitly avoids special-casing those frozen examples. |

## B. Changes made

All 42 changed/new files are accounted for here:

| Files | Reason |
|---|---|
| `js/legal-status.js`, `js/legal-discovery.js`, `js/legal-refs.js` | Complete/partial propagation, assessment-date validation, source metadata requirements, suspension, relationship scope/direction/provenance, bounded traversal and retries. |
| `js/legal-page.js`, `js/legal-fetch.js`, `js/legal-remote-adapter.js` | Strong identity, conservative portal extraction, classified failures, bounded streaming, manual allowlisted redirects, cancellation, preserved candidate failures. |
| `js/legal-fixtures.js` | Explicit complete synthetic coverage and replacement scope; synthetic labels remain intact. |
| `js/legal-research.js`, `supabase/functions/legal-discover/index.ts` | Server-only reconstruction from cache identity/version/hash/URL/timestamp evidence; strict intent schema, membership/role checks, canonical evidence hash and bounded provider/source requests. |
| `supabase/migrations/20261017000010_legal_evidence.sql` | Additive evidence fields, legacy trust version 0, server reconstruction version 1, actor UUID and integrity constraints. No client write permissions added. |
| `js/policy-server.js`, `js/doc-history.js`, `js/app-controller.js`, `js/policy-store.js`, `supabase/functions/policy-api/index.ts` | Atomic restoration plan, verified historical target, authorization and revision checks, append-only restoration provenance, one persistence operation, IndexedDB transaction completion. |
| `js/app/ui.js`, `index.html` | Honest status/partial/error messages, candidate detail, acknowledgement reset, attempt-budget label, atomic restore action and dependency loading order. |
| `supabase/functions/_shared/http.ts`, `supabase/functions/_shared/modules.ts`, `scripts/sync-edge-shared.mjs`, `jsconfig.json` | Stream/byte/time limits for JSON requests, shared history import, synchronization of new modules and type-check coverage. |
| `supabase/functions/_shared/{doc-history,legal-discovery,legal-research,legal-status,legal-fetch,legal-page,legal-refs,policy-server}.js` | Eight generated shared copies, checked byte-for-byte against `js/`. |
| `tests/legal-remediation.test.cjs`, `tests/legal-edge.test.cjs`, `tests/restoration.test.cjs`, `tests/legal-intelligence.test.cjs` | 29 new unit/HTTP-handler regression tests; existing assertions updated to reject the original unsafe contracts. Actual TypeScript legal HTTP handler executes with mocked provider/Supabase I/O. |
| `tests/e2e/legal.spec.mjs`, `tests/e2e/fake-backend.mjs`, `tests/fixtures/legal/government-detail.fragment.html` | Warning/acknowledgement/candidate/restoration coverage and remote action support; fixture clearly labels synthetic HTML with inspected metadata provenance. |
| `README.md`, `docs/ARCHITECTURE.md`, `docs/LEGAL-INTELLIGENCE.md`, `docs/SETUP-BACKEND.md`, this report, `docs/plan/done/engineering-remediation.md` | Current contracts, limitations, deployment sequence, verification results and completed local checklist. |

## C. Verification

Commands below actually ran. A successful metrics script is distinguished from perfect classification accuracy.

| Exact command | Result |
|---|---|
| `npm test` | Baseline: 299/299 passed. Final: 328/328 passed, no skipped/cancelled tests. |
| `npm run typecheck` | Passed before changes and after final functional changes. |
| `node --test tests/legal-remediation.test.cjs` | Initial regressions failed before fixes; final expanded file passes. |
| `node --test tests/legal-intelligence.test.cjs tests/legal-remediation.test.cjs tests/doc-history.test.cjs tests/app-controller.test.cjs` | Intermediate failures identified old incomplete/identity/trust expectations; corrected behavior and assertions, then full suite passed. |
| `node --test tests/legal-edge.test.cjs` | Passed: actual legal HTTP handler, mocked provider/DB, adversarial inputs and trust boundary. Included in final full suite. |
| `node --test tests/restoration.test.cjs` | Passed: target reconstruction, authorization, staleness, immutable history, failed offline save, competing writes and one remote restore request. Included in full suite. |
| `node --test tests/legal-edge.test.cjs tests/legal-remediation.test.cjs tests/restoration.test.cjs` | Focused pass before the last two added unit tests; final full suite covers all 29 new cases. |
| `npm run bench` | Exit 0; PolicyChange OS passed the 26 synthetic benchmark cases, zero unsafe fixture mutations. |
| `npm run eval` | Exit 0, metrics report: 42/48 correct; 2/27 missed escalations and 4/21 excess escalations. H40/H47 remain unsafe AUTO outcomes. |
| `npm run verify` | Passed 14/14 checks. |
| `npm run eval:blind` | Exit 0; reports classification metrics including excess escalations/category differences. Not a claim that all labels match. |
| `npm run eval:blind2` | Exit 0; reports classification metrics including excess escalations/category differences. |
| `npm run eval:ai` | Exit 0; replays previously recorded AI results. Recorded evidence holds H40/H47. No live AI provider was tested. |
| `npm run sync:edge` | Passed, synchronized 17 modules. Direct byte comparison of every shared JavaScript file with its source passed. A HEAD-based `git diff --exit-code` would include the intentional uncommitted changes, so parity was checked directly. |
| `deno check --no-lock --node-modules-dir=none policy-api/index.ts ai-extract/index.ts ai-discover/index.ts legal-discover/index.ts` | Passed on synchronized sources from `supabase/functions`. Restricted attempts failed to resolve npm DNS; permitted registry-access retries passed. Existing Supabase dependency only; no manifest/lock changes. |
| `npm run e2e -- tests/e2e/legal.spec.mjs --project=desktop` | Initial startup blocked by sandbox/localhost proxy. Explicit full Chrome override also failed with Windows `spawn UNKNOWN`; the default headless browser works. A later focused run exposed the incomplete-search/source-conflict bug; fixed and covered by final tests. |
| `npm run e2e -- tests/e2e/legal.spec.mjs --project=desktop --workers=1` | Intermediate 4 passed / 1 failed before that status fix. Subsequent full runs passed. |
| `npm run e2e -- --workers=4 --output=test-results/remediation-e2e` | Final: 65 passed, 1 skipped, 0 failed. Run with `$env:NO_PROXY='localhost,127.0.0.1,::1'`, default Playwright browser and repository static server. Skip: desktop-only absence of the narrow-screen menu; the mobile menu test passed. |
| `node scripts/serve.mjs` | Local test server ran with `$env:PORT='4173'`; stopped after verification. |
| `git diff --check` | Passed. Reviewed changes for secrets, unrelated changes, misleading certainty and altered trust boundaries. |
| `git diff --name-only -- package.json package-lock.json deno.lock .github/workflows` | Empty: dependencies, lockfiles and CI configuration unchanged. Engine/Prover source diff also empty. |
| `docker version` | Client installed; daemon unavailable at its configured named pipe. No PostgreSQL CLI found. No database integration run was claimed. |

Other diagnostics: listed Playwright tests; inspected the local server/Node processes and localhost connectivity; checked installed browser executables; attempted a direct Node fetch of the inspected Government page (`fetch failed`). Two overlapping diagnostic browser attempts produced artifact-file errors and were stopped; final suite ran alone with a dedicated output directory. Logs are under ignored `test-results/`; the durable results are recorded here.

No lint or build script exists in `package.json`; these were skipped rather than invented. Dependencies were already installed; no install was necessary. No live legal-provider/AI integration, production security probe, deployment check, PostgreSQL migration execution, live RLS test or actual PostgreSQL rollback test ran.

## D. Security and data integrity

- Legal input remains evidence only. It cannot alter deterministic AUTO/U1/U2/U3 outcomes or authorize a Prover rejection. A regression verifies that forged legal status/acknowledgement/props leave the server commit plan unchanged.
- Live workspace saves require a validated non-anonymous user, exact workspace membership and a supported role. Demo persona access retains the existing explicitly marked demo model. There are no new anon/authenticated write grants or relaxed RLS policies.
- `save_run` cannot accept client attestations. The service reads trusted cache rows, validates source identity/parser version/body hash/allowlist/timestamps, rebuilds assessments and computes a hash stable across JSONB key ordering. Legacy reports have trust version 0 and are not promoted.
- Source URLs remain HTTPS-only, allowlisted and checked on every manual redirect. Provider URLs are fixed, redirects disabled, responses bounded; exceptions never return credentials or stack traces. Candidate 403/429/5xx, parsing and identity failures remain distinct from absence.
- Restore verifies the whole ledger and requested revision, derives content server-side, checks every affected undo permission and generates one `apply_change` request using the existing workspace lock/CAS transaction. Existing records stay unchanged; restoration provenance is in the hashed basis. PostgreSQL atomicity is based on the inspected existing SQL implementation, not a newly claimed live transaction test.
- Offline restore writes one snapshot and waits for IndexedDB transaction completion before swapping visible content/history. Failure and pending-operation tests confirm no partial client state.

## E. Deployment blockers

1. Migration 10 is created locally and unapplied. Earlier documentation says migration 9/legal-discover were not deployed; current production migration history was not inspected. Confirm migration history, test 9 then 10 on local/staging PostgreSQL and verify RLS/rollback before deployment.
2. Deploy updated `legal-discover`, `policy-api` and matching frontend/shared modules together after schema validation. Restore reuses `apply_change`; no new restoration RPC or client write grant is needed.
3. Configure/verify `LEGAL_SEARCH_PROVIDER`, `LEGAL_SEARCH_API_KEY`, and Google-only `LEGAL_SEARCH_CX`; optional limits are `LEGAL_DAILY_LIMIT`/`LEGAL_CLIENT_LIMIT`. No actual secret values were read or recorded. Production provider configuration remains unverified.
4. Exercise actual portal HTML, reverse-relationship structures, provider failure paths and historical evidence in staging. A browser-accessible metadata excerpt is not end-to-end live compatibility. The checked fixture explicitly uses synthetic markup.

Production was not modified.

## F. Remaining risks

| Severity | Substantiated unresolved risk | Next step |
|---|---|---|
| High | Existing semantic holdouts H40/H47 are accepted by the unchanged engine and Prover without AI evidence. | Separately evaluate policy/quantity anchor scope with the policy owner and frozen holdout methodology; retain broad regression coverage rather than special-casing examples. Do not treat successful legal research as fixing this. |
| Medium | Live relationship and historical coverage are unknown; official portal HTML/provider integration is not verified. | Implement/test additional source structures from captured, provenance-known evidence. Until then live graphs remain partial and cannot certify IN_FORCE. |
| Medium | New evidence migration and existing restoration transaction have not been exercised against PostgreSQL here. | Run migrations, adversarial RLS checks, concurrent transactions and injected rollback tests on verified local/staging targets before rollout. |

Legacy reports remain explicitly untrusted until recomputed; new server-reconstructed reports are advisory, never legal certificates. Custom adapters that ignore abort signals cannot be forcibly stopped by the discovery library; the built-in remote/native fetch paths do propagate cancellation.

## G. Final diff

42 files: legal correctness/retrieval/persistence, atomic restoration, related UI, eight generated shared copies, one additive migration, regression fixtures/tests and synchronized documentation. Engine, Prover, workflow decision rules, existing migrations/RPC, dependencies, lockfiles and CI remain untouched. There are no unrelated pre-existing edits to preserve and no staged changes or commits.

Implementation notes and safe deployment details: [LEGAL-INTELLIGENCE.md](LEGAL-INTELLIGENCE.md). Completed local checklist: [engineering-remediation.md](plan/done/engineering-remediation.md).

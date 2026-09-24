# MLAI 3–5 minute demo runbook

## Setup

Open the GitHub Pages app, or run `python3 -m http.server 8080` from the repository root and open `http://localhost:8080`. The live provider is unavailable; extraction status says deterministic fallback, and the ambiguity path identifies its response as a fixture mock.

## Script

### 0:00–0:30 · Problem

Explain that a deadline value may appear in unrelated documents and in dates. Global replacement can silently alter unrelated policy content.

### 0:30–1:15 · Natural-language change

Click **Run safe/date demo**. Point out the request, `R-PK-01`, `7 days → 5 days`, single-policy scope, issuer tier, and raw request basis. State that no live model call occurred: the current provider adapter reports unavailable and deterministic parsing handled the request.

### 1:15–2:00 · Discover and prove

Follow the actual Impact Graph from policy through clause and document to dependency evidence and decision. Open the proposal to show the actual engine result and deterministic proof checks. The graph and proof are generated from the current analysis.

### 2:00–2:45 · Commit and audit

The safe/date control commits through the existing handler. Show the new audit row, exact before/after, proof ID/check summary, and the `DEMO-7D` document. The deadline becomes 5 days; `17/07/2025` stays intact. Use that row's **Hoàn tác** button; verify the source line returns and the ledger gains a reversal event.

### 2:45–3:30 · Refuse broad scope

Click **Try global-scope refusal**. The request to change every 7-day deadline is refused before analysis. Point out that no document or ledger mutation occurred.

### 3:30–4:15 · Human review

Click **Load ambiguity fixture · mock**. Identify the semantic response as a benchmark fixture, not live model output. The semantic validator accepts the exact evidence, marks the deterministic `AUTO_PATCH` proposal with a review hold, and exposes human approval/rejection controls. Choose **Giữ nguyên dòng** to demonstrate a human decision without mutation.

### 4:15–5:00 · Evaluation and takeaway

Point to the 26-fixture benchmark snapshot. It reports 0/13 false auto-patches for PolicyChange-OS on the included synthetic fixture set, compared with 16/25 for naive replacement and 13/18 for the fixture-driven LLM-only mock. Invite judges to reproduce the full output with `node bench/run.cjs`.

## What the demo does not claim

There is no live AI inference or measured provider latency. The ambiguity response is explicitly mocked from an existing fixture. Synthetic benchmark rates are not estimates of real-world performance or a proof of universal safety. Browser Verify should be run separately; Node tests and the benchmark do not count as browser end-to-end verification.

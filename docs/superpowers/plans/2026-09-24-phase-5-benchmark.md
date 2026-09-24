# Phase 5 Benchmark Suite Implementation Plan

> **For agentic workers:** Execute task by task with TDD; keep the three systems isolated and run the regression commands listed in the specification.

**Goal:** Add a reproducible offline benchmark that measures naive replacement, fixture-driven LLM-only behavior, and the actual PolicyChange-OS pipeline against explicit fixture ground truth.

**Architecture:** Store self-contained cases and ground truth in bench/fixtures.json. A small adapter extracts the production registry and deterministic functions from the existing inline script in index.html; the runner uses the real semantic discovery and policy prover modules. Naive replacement and LLM-only consume only fixture values and mock model outputs, never the prover.

**Tech Stack:** Node.js CommonJS, JSON fixtures, node:test, built-in vm, no external dependencies.

**Spec:** C:/Users/nam/.codex/attachments/3ab95066-0ecd-4861-8ecf-81dcff0aac63/Pasted text.txt

## Global Constraints

- Benchmark at least 20 deterministic, synthetic fixtures covering the required false-positive, escalation, failure, and adversarial categories.
- Ground truth is explicit fixture data; never derive expected outcomes from a system result.
- LLM-only follows controlled fixture mock outputs and never calls registry/prover logic.
- PolicyChange-OS uses the production analyze, semantic-discovery, and prover implementations.
- No live API, dependency, backend, architecture rewrite, or Phase 6 work.
- Report every fixture and all measured results without invented or filtered scores.

## Review Focus

- Source extraction breaking after harmless index.html formatting changes — fail clearly if any required production definition is missing.
- Fixture mutation shape not matching actual engine hit and replacement behavior — assert exact document and line mutations.
- Semantic evidence missing Phase 2 validation binding — never let benchmark metadata alone create an automatic patch.
- Mock model predicting unlisted locations or global scope — execute exactly the mock response; do not silently sanitize it with prover logic.
- Missing or duplicate cases disappearing from metrics — validate unique IDs and require each system result count to equal fixture count.

---

### Task 1: Benchmark contract tests

**Files:**
- Create: tests/benchmark.test.cjs
- Test: bench/run.cjs, bench/fixtures.json

**Interfaces:**
- The runner exports loadFixtures, validateFixtures, runBenchmark, and calculateMetrics.
- Normalized results include outcome, category, autoPatched, mutatedDocuments, requiresHuman, refused, and reason.

- [ ] Write tests for fixture schema, unique IDs, ground truth, three systems per case, metrics (including false-auto-patch), malformed fixtures, missing cases, and deterministic reruns.
- [ ] Run node tests/benchmark.test.cjs; expected red because benchmark modules do not exist.

### Task 2: Self-contained fixture data

**Files:**
- Create: bench/fixtures.json
- Test: tests/benchmark.test.cjs

**Interfaces:**
- Each case supplies id, description, riskCategory, change, documents, registry, groundTruth, and llmMock; semanticMock optionally defines the Phase 2 response.
- Ground truth names exact expected engine classification, mutation locations and lines, review/refusal requirements, and whether any automatic mutation is permitted.

- [ ] Add at least 24 compact fixtures covering all required categories and the four explicit adversarial classes.
- [ ] Run fixture validation tests and verify every case has explicit expected mutation data.

### Task 3: Actual production engine adapter

**Files:**
- Create: bench/production-adapter.cjs
- Test: tests/benchmark.test.cjs

**Interfaces:**
- loadProductionEngine(htmlPath) returns the real RULES, parseValue, valueRegex, renderValue, ownersOfLine, and analyze functions from the current inline application script.
- Missing source sections throw an error naming the missing production function; no hand-copied production rules.

- [ ] Add integration tests that execute a safe target and U1/U2/U3 cases through the extracted production functions.
- [ ] Run focused tests; expected red until the adapter exists.
- [ ] Implement the smallest VM extraction adapter; do not edit index.html or change production functions.
- [ ] Rerun focused tests and compare exact classifications and changed lines.

### Task 4: Three benchmark systems and metrics

**Files:**
- Create: bench/run.cjs
- Test: tests/benchmark.test.cjs

**Interfaces:**
- Baseline A clones documents and globally replaces every old-value match.
- Baseline B consumes only llmMock; exact predicted line targets or global scope drive its mutations, and malformed/timeout/failure mock responses produce no guessed patch.
- System C invokes production analyze, actual PolicyChangeSemanticDiscovery.discoverSemantics for configured semantic mock cases, and actual PolicyChangePolicyProver.proveAutomaticPatch; it mutates only after the same guards as the UI.
- runBenchmark accepts fixtures and production dependencies and returns every per-case normalized result and aggregate metrics.

- [ ] Test hand-calculated metric fixtures, denominator edge cases, all-case result counts, actual mock behavior, exact mutation arrays, and stable normalized output.
- [ ] Implement metric definitions before running the whole benchmark.
- [ ] Implement the three runners with fresh cloned documents per system.
- [ ] Run node tests/benchmark.test.cjs, then node bench/run.cjs; compare every PolicyChange-OS result with explicit ground truth.

### Task 5: Benchmark documentation and full verification

**Files:**
- Create: bench/README.md
- Test: all Phase 1–5 test files

- [ ] Document purpose, systems, fixture fields, ground-truth method, exact metric formulas, reproduction command, limitations, and interpretation.
- [ ] Run all Phase 1–5 Node tests individually if node --test cannot spawn workers.
- [ ] Run node bench/run.cjs, JavaScript syntax checks, inline-script syntax check, and git diff --check.
- [ ] Report the complete measured table and all execution limitations; make no universal safety or real-university claims.

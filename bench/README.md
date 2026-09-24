# Phase 5 benchmark

## Purpose

This offline benchmark compares naive global numeric replacement, a fixture-driven LLM-only mock, and the current PolicyChange-OS pipeline on the same 26 synthetic cases. It measures observed behavior against authored ground truth. It is not a sample of real university documents and does not support statistical or real-world performance claims.

## Systems

- **naive** replaces every occurrence of the old numeric token and does not use policy registry, authority, anchors, semantic evidence, or prover logic.
- **llmOnly** follows the response stored in each fixture. It has no registry or PolicyChange-OS prover. The responses are deterministic mocks, not outputs from a live LLM.
- **policyChangeOS** loads the real registry, parser, analyzer, semantic validator, prover, audit functions, and existing commit event handler from the browser app. A small Node VM adapter supplies browser stubs. Policy extraction uses the real deterministic fallback because no provider is connected.

## Fixtures and ground truth

`fixtures.json` is the single source of fixture inputs and expected results. Each case supplies a request, explicit policy change, document lines, mock model response, and manually authored ground truth: expected outcome and category, exact permitted mutation tuples, human-review/refusal flags, and the expected per-line deterministic engine classifications. The production registry is read from `index.html`; narrowly scoped registry overrides model missing-registry and date-format adversarial cases.

Ground truth was authored from the current policy semantics and reviewed independently of runner output. A mutation is an exact tuple of document ID, line index, original line, and replacement line. An automatic mutation is counted as unsafe when its tuple is absent from that fixture's allowed mutation set.

## Metrics

Rates use fixture cases as their unit unless noted.

- **False Auto-Patch Rate** = cases with at least one automatic mutation containing one or more unapproved mutation tuples / all cases with at least one automatic mutation. This is a case-based rate; one or more unsafe mutations in one case count as one false-auto-patch case. `n/a` means the system made no automatic mutations. This definition is fixed before interpreting results.
- **Unsafe Mutation Count** = count of individual automatic mutation tuples not present in that case's expected mutation set.
- **Correct Refusal Rate** = ground-truth refusal cases where the system refuses and performs no automatic mutation / all ground-truth refusal cases.
- **Correct Escalation Rate** = ground-truth human-review cases where the system marks human review required / all such cases.
- **Correct Decision Rate** = cases where outcome, category, human-review flag, and refusal flag all match ground truth / all cases.
- **Correct Mutation Rate** = cases where the full set of actual mutation tuples exactly equals the expected set / all cases.
- **Missed Safe Automation Rate** = cases with one or more expected safe mutations where the system failed to perform at least one expected mutation / all cases with expected safe mutations.
- **PolicyChange-OS engine classification rate** = cases where all actual per-line AUTO_PATCH/ESCALATE classifications and categories exactly match the explicit expected classifications / all cases.

No latency metric is reported: timing in this harness would primarily measure local VM and test-runner overhead, and there is no live provider whose latency could be measured. Undo is not benchmarked.

## Run

From the repository root:

```sh
node bench/run.cjs
node bench/run.cjs --json
node tests/benchmark.test.cjs
```

The human report includes every case. `--json` emits normalized per-system results and computed metrics. No network, API key, or additional package is needed.

## Limitations and interpretation

Cases are small, synthetic, and intentionally include adversarial traps. The LLM-only baseline is mock-driven and must not be interpreted as a measured model's performance. The Node adapter evaluates production source in a VM with minimal DOM stubs; it does not test browser rendering or interactive Verify. It invokes the current commit handler and records its real audit entries, but does not test undo.

The retained date-format fixture is a regression case for numeric tokens embedded in slash-delimited dates. Candidate matching and prover recheck now exclude numeric occurrences adjacent to structural slash, decimal, or grouping delimiters while still allowing ordinary punctuation. This is a narrow deterministic boundary rule, not general date parsing. A benchmark result describes only these checked fixtures and this repository revision.

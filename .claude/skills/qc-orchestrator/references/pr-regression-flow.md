# Flow — QC PR/Commit (native, specialist-routed + regression check)

Entry point for `SKILL.md`'s "QC diff" and "QC a Pull Request" menu options. Same shape as the
old `review-flow.md` top-level flow, plus a regression-gap check the old flow never had — a diff
review that never asks "does anything already test what this touched?" only checks the new code,
not whether the change silently breaks old behavior nothing re-runs.

## Steps 1-3 — reused verbatim from `review-flow.md`

Don't re-derive these — read and follow `references/review-flow.md`'s steps 1-3 exactly as
written:
1. Determine scope (diff mode or PR mode).
2. Baseline checks (lint/typecheck/test/build, run for real).
3. Route via `prompts/impact.md`'s `route_to` heuristic — this also gives you `affected.apis`,
   `affected.ui_routes`, and `affected.existing_tests`, which step 4 below (the new regression
   check) needs. Keep the `impact.json`-equivalent output around, don't discard it after routing.

## Step 4 — review each routed category via the specialist runner

For each category `route_to` named, call `references/specialist-runner.md` (category, scope,
context) exactly as `review-flow.md`'s step 4 now does — never read `prompts/<role>.md` directly.
Collect the normalized candidate findings it returns for every category before moving on.

## Step 5 — regression check (new)

From the routing step's `affected.apis` / `affected.ui_routes` / any changed symbol:

1. For each affected API/route/symbol, search the project's test directories (`grep` by route
   path string or function/symbol name under `test`/`tests`/`__tests__`/`spec` — whatever this
   project actually uses) for a test that already covers it. `affected.existing_tests` from step 3
   is your starting list — verify it's actually current (the file still exists, still references
   the symbol) rather than trusting it blindly.
2. **No covering test found** for an affected API/route/symbol → write a finding:
   - `category: "correctness"` — `findings.schema.json`'s `category` enum has no dedicated
     `regression-gap` value and this schema is not being changed by this overhaul (see
     `registry.json`'s note); `correctness` is the closest honest fit for "a code path this diff
     touches has no regression coverage." Put "regression gap" explicitly in the `title` (e.g.
     "No regression test covers changed `/orders` handler") so it reads distinctly from an
     ordinary logic-bug finding in the report, and group these separately from ordinary findings
     in the report step below rather than letting them blend in.
   - `evidence.kind: "reasoning_only"` — a "no test found" claim is an absence, not a run, cap to
     `info` per the ordinary evidence-and-judge rule. **Exception**: if you go further and
     actually run the test suite (or the narrowest relevant subset) and it genuinely fails because
     of this change, that's real, observed evidence — use `evidence.kind: "failing_test"` instead,
     with the real command and output, per `verification-protocol.md`.
3. **A covering test exists but you have reason to suspect this change breaks it** (the diff
   touches exactly what that test asserts on) — don't just note the test exists, actually run it
   per `verification-protocol.md`. A pass is a good, quiet result — nothing to report. A genuine
   failure is a real finding (`evidence.kind: "failing_test"`), not a regression-gap finding.
4. An affected surface with adequate existing coverage that still passes needs no finding at all —
   this step exists to surface gaps and real breaks, not to enumerate every test that's fine.

## Step 6 — finalize, evidence/scope cap, judge, report

Same as `review-flow.md`'s steps 5-6: assign `id`/`schema_version` to every finding (regression
findings included), run `evidence-and-judge.md` exactly, then publish per `html-report.md` — with
one addition specific to this flow: **a distinct "Regression check" section**, separate from the
ordinary findings-by-severity groups, listing every affected API/route/symbol and its outcome
(covered + passing / covered + failing → finding / no coverage found → finding / not checked +
why). Never let a regression-gap finding get silently absorbed into the general findings list
where a reader can't tell it apart from an ordinary bug. Also include the "Specialist source"
line per category, same as every other flow (see `specialist-runner.md` step 7).

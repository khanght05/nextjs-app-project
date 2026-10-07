# Flow 2 — Generate a test plan (native `qc test plan`)

Same tool mapping as `review-flow.md` (`codesearch_read` → Read, `codesearch_grep` → Grep,
`shell_ro` → Bash restricted to git read commands).

Note: `references/verification-protocol.md`'s "run it, don't just reason about it" mandate
governs the flows that report findings (`review-flow.md`, `audit-flow.md`). This flow does not
execute anything itself — `oracle` and `planner` are deliberately no-execution roles (planner's
own prompt: "you write no test code whatsoever, ever") — and a human approves the plan before
anything generated from it actually runs. If a scenario here concerns the Raw→DB→UI pipeline,
still tag it clearly so that whoever later reviews the generated tests (or QCs the feature with
`review-flow.md`) knows to apply the data-pipeline run-it rules then.

## Steps

1. **Determine the feature/area.** Take it from the user's request as-is — this becomes
   `$feature` in both prompts below. Don't narrow or reinterpret it.
2. **Find requirement docs.** Grep the repo for README files, `docs/`, and filenames/content
   suggesting spec/requirement/user-story/acceptance-criteria/BRD/SRS/ADR. This is a heuristic,
   not exhaustive — the oracle step (next) is expected to keep looking beyond whatever you find
   here.
3. **Play `oracle`.** Read `prompts/oracle.md` in full and follow it exactly — every statement
   needs a real, cited source (`acceptance_criterion`/`spec_clause`/`code_invariant`/
   `observed_behavior`), never an invented one. Produce output shaped like
   `schemas/oracle.schema.json`. An empty `statements` array is a good, honest answer if you
   genuinely found nothing citable — do not pad it.
4. **Play `planner`.** Read `prompts/planner.md` in full. It expects an `impact.json` path — you
   don't have one in this native flow unless you just ran `review-flow.md` for this same area
   and want to reuse its scope; otherwise treat `$impact_path` as empty and derive scope from
   the oracle statements plus your own reading of the feature's code, exactly as the prompt's
   own fallback instructs. Produce output shaped like `schemas/test-plan.schema.json`. Max 25
   scenarios — if the feature genuinely needs more, say so and suggest splitting it rather than
   padding or truncating silently.
5. **Set `approved: false`, always.** This is not the planner's decision or yours — a human
   reviews the plan before anything gets built from it. Say this plainly when you report the
   plan back.
6. **Report.** Publish this as an HTML Artifact automatically — see `references/html-report.md` —
   no need for the user to ask for one. It carries the statements (with sources) and scenarios
   (grouped by `test_type` is usually clearest), and states plainly that `approved: false` until a
   human reviews it. Then a short chat pointer to it (2-3 sentences: scenario count + link) rather
   than pasting the full plan as chat text.
7. **Handoff to Superpowers TDD, only once a scenario is actually approved.** If the user, either
   right in this report or any time after seeing it, confirms `approved: true` for one or more
   scenarios — read `references/adapters/superpowers-tdd.md` and hand those specific approved
   scenarios off to the Superpowers TDD skill to generate real test code and run it
   (red-green-refactor discipline, auto-installing the `superpowers` plugin per
   `references/registry.json` if it isn't active yet, falling back to a clear error in the report
   if it can't be installed — never silently skipping this step or writing the test code by hand
   instead). Record the first run's result (pass/fail per scenario, the generated test file paths)
   as an **update to the same report artifact** — per `html-report.md`'s "Updating vs. publishing
   a new one" — not a new report.

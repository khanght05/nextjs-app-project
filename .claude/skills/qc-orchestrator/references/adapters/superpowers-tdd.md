# Adapter/handoff: Superpowers TDD (`superpowers@superpowers-marketplace`)

This isn't a *finding* adapter — there's nothing here to map into `findings.schema.json`. This is
a **handoff instruction**: once `planner` (Flow 2 — `test-plan-flow.md`) has produced
`test-plan.json` and the user has set `approved: true` on one or more scenarios, use this step to
actually generate test code and run it.

## When to use this
Only after:
1. `oracle` + `planner` have already run (Flow 2, steps 1-5 of `test-plan-flow.md`).
2. The user has seen the report and confirmed `approved: true` for at least one specific
   scenario — never decide `approved: true` on the user's behalf.

## How to call it
Check whether the `superpowers` plugin is already active (`/plugin list`). If not → auto-install
per `registry.json`'s `install["superpowers@superpowers-marketplace"]` (see
`specialist-runner.md`'s "auto-install" step), then re-check. If it still can't be installed →
report the error plainly in the report, **don't pretend TDD ran**.

Once the plugin is ready: call Superpowers' TDD skill (`red-green-refactor`, or the equivalent
slash command — check `/help` for the exact name if unsure) for each `approved: true` scenario,
passing that scenario's actual content (description, input/expected from `test-plan.json`) as
input. This skill writes real test code itself under red-green-refactor discipline and runs it.

## What the raw output looks like
A real test run's result: pass/fail per scenario, the generated test code file(s), and the first
run's output (red before the implementation exists, green after).

## Recording the result
Don't create a new finding from this — update Flow 2's report (the same artifact, don't publish a
new one — see `html-report.md`'s "Updating vs. publishing a new one") with:
- Which scenario(s) actually got real test code generated.
- The first run's result (pass/fail), and the path to the generated test file.
- Any scenario not yet `approved` still shows as "no test generated yet" in the report.

## Special cases
- Superpowers isn't installed and auto-install fails → stop, report the error plainly ("Sinh test
  CI/CD (test generation): handoff to Superpowers failed — `<reason>`, the scenario is still
  `approved` but has no test code yet"), don't hand-write substitute test code unless the user
  explicitly asks for that.

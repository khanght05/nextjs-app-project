# Optional: the real qc-engine backend (exact-parity path)

Everything in `SKILL.md` and the other `references/*-flow.md` docs works with nothing but your
own tools — no install, no LiteLLM proxy, no API key. This document is for the case where the
target project (or its owner) *already has* the real `qc-engine` Python backend installed and
configured, and you'd rather delegate to it for exact parity with its tested pipeline:
concurrent reviewer fan-out, the exact weighted risk formula, budget-checkpointed resumable
audits, mutation-verified test *generation* (not just planning), and cross-run bug-lifecycle
tracking — none of which the native flows in this skill attempt to replicate exactly.

**Prefer the native flows by default.** Only reach for this path if the user tells you the real
engine is already set up, or explicitly asks for something only it can do (mutation-verified
test generation, a large budget-capped repo-wide audit with resume).

## Checking whether it's available

Run `scripts/check_setup.sh <repo> [config]` — it reports PASS/FAIL on: `qc` CLI on PATH, a
`qc.yaml` present, and the target being a git repo. If everything passes, you can shell out to
the real commands below instead of doing the native flows yourself.

## Setting it up (only if the user asks you to)

1. **Install**: `qc-engine` isn't on PyPI — `uv tool install "git+https://github.com/khanght05/QC_Swarm_Agent.git"`
   (or `pip install` the same URL). Confirm with `qc --version`/`qc --help`.
2. **Minimal `qc.yaml`** in the target repo root — the engine refuses to run without a
   `models.default` pointing at a real OpenAI-compatible `/chat/completions` endpoint:
   ```yaml
   models:
     default:
       provider: local
       model: <model-id-your-endpoint-serves>
       base_url: https://your-litellm-proxy/v1
       api_key_env: QC_LLM_API_KEY   # names the env var holding the token, never the token itself
       temperature: 0.0
   ```
   Set the real token in the shell or a `.env` in the repo root: `export QC_LLM_API_KEY=sk-...`.
   **Never write the real key into `qc.yaml`.** If the user hasn't told you the endpoint/model/
   key, ask — don't invent placeholder values and run anything against them.
   - Optional `models.roles.<role>` entries for a mixed cost profile (same shape as `default`).
   - Optional `commands:` block for non-obvious install/build/lint/typecheck/test commands —
     otherwise auto-detected.
3. **Verify**: `qc onboard --repo <target-repo> --config <target-repo>/qc.yaml` should finish
   with `mode: warm` or `cold` and a `business modules found:` count. An error here is almost
   always the endpoint/key from step 2 — read it back to the user, don't retry blind.

## Command reference

All commands take `--repo <path>` (default `.`) and `--config <path>` (default `qc.yaml`,
resolved against `--repo`). `.env` in the repo root loads automatically.

### `qc run` — review a diff (the CI-gate pipeline)
```
qc run --base <ref> [--plan] --repo <path> --config <path>
```
`--plan` also generates a test plan scoped to exactly the diff's files (off by default — adds
one more LLM round-trip; a failure here degrades gracefully, never changes `qc run`'s own exit
code). Exit: 0 pass/advisory, 1 blocking finding (a real result, not an error — report it, don't
retry), 2 engine error. Prints `run_id:`, `verdict:`, `findings:`, `report:`, and (with `--plan`)
`plan_dir:`.

### `qc audit` — whole-repo risk audit + risk-driven test-planning
```
qc audit [--budget N] [--resume RUN_ID] [--require-warm] [--no-readiness-cache]
          [--check-readiness] --repo <path> --config <path>
```
Risk-ranks every file (exact weighted formula, not the approximation in `audit-flow.md`),
reviews the highest-risk ones, plans test cases for the riskiest few. Stops cleanly at
`audit.budget_usd` (default $40). `--resume RUN_ID` continues an interrupted run without
restarting finished work. `--require-warm` refuses (exit 3) on a repo whose build/tests don't
pass. Exit 0 otherwise (audits are observability, not a gate — they never "fail" on findings).

### `qc onboard` — one-time-per-project setup
```
qc onboard --repo <path> --config <path>
```
Env setup, readiness probe, gathers requirement docs, produces a sourced business summary.
Deliberately doesn't rank risk or plan tests (those are recomputed fresh by `qc audit`/
`qc run --plan`). Exit 0, or 2 on engine error.

### `qc dispatch` — free-text router
```
qc dispatch "<verbatim request>" --repo <path> --config <path>
```
Decides `audit`, `test_plan` (focused area), or `unsupported` (names what it can't do); for a
mixed request it does the supported part and names the rest rather than dropping it silently.
Prints `decision:`, `reason:`, `unsupported:` (if any), `run_id:` or `plan_dir:`.

### `qc test plan|generate|verify|execute` — the full test-authoring pipeline
```
qc test plan "<feature>" [--run-id ID] --repo <path> --config <path>
qc test generate [feature] --approved --repo <path> --config <path>
qc test verify [feature] --repo <path> --config <path>
qc test execute [feature] --repo <path> --config <path>
```
`plan` writes `test-plan.yaml` with `approved: false` always — a human decides that. `generate`
refuses (exit 1) unless the plan file itself has `approved: true` *and* `--approved` is passed
— the flag alone can never bypass human review. `verify` mutation-tests every generated file,
deleting any that doesn't kill every mutant tried against it. `execute` runs what `verify` kept,
reporting pass/fail by `test_type`.

### `qc bugs list|show` — read-only bug lifecycle
```
qc bugs list [--status open|fixed|retested|closed] --repo <path>
qc bugs show <finding-id> --repo <path>
```
Reads `.qc/bug-status.json`, the cross-run store `qc run`/`qc audit` update automatically.

### `qc api` — the web UI/API server
```
qc api [--host] [--port] [--data-dir]
```
A separate multi-project web app with its own chat UI — not something to launch as a side
effect of one QC ask. Mention only if the user is asking how to run the full app.

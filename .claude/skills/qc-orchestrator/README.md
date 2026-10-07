# qc-orchestrator — Claude Skill package for QC Engine (specialist-routed mode)

A [Claude Skill](https://docs.claude.com/en/docs/claude-code/skills), v2.0 of the `qc-agent`
package: rebuilt from a skill that **self-wrote every review role** (backend/frontend/security
were all prompts the host AI played itself) into an **orchestrator** that routes each review
category to the best available specialist — an installed plugin (`agent-skills`'s
`code-review-and-quality` skill, `security-guidance`), an MCP tool (Semgrep, Playwright) — and
falls back to the original self-authored prompts only when nothing else is available for that
category. Two categories keep their original self-written logic on purpose, because no outside
tool replaces them: the Data-pipeline QC role (`prompts/data.md`) and the Oracle/Planner test-plan
generation role.

**A real, hard-won lesson baked into this package**: not every plugin that looks callable
actually is. The original `backend`/`frontend_static` specialist,
`code-review@claude-plugins-official`, turned out to be commands-only (no `skills/`, no MCP
tool) — Claude Code itself draws a hard line here: "command files cannot be invoked by agents,
while skills can be." It was replaced with `agent-skills@addy-agent-skills`'s
`code-review-and-quality` skill after running the full vetting process in
`references/candidate-vetting.md` (install → presence → invokability → masking-check → a real
smoke test with observed output) — see `references/specialist-runner.md`'s A.1/A.2 split and
`references/adapters/code-review-plugin.md` (kept as a historical record, not deleted) for the
full story. Run `candidate-vetting.md`'s process before adding any new plugin to this registry —
a README claiming support is not verification.

Nothing changed about the trust model: every finding, regardless of which specialist produced
it, still goes through the same normalize → evidence-cap → scope-cap → judge pipeline
(`references/evidence-and-judge.md`, unchanged) before it reaches a report, and
`references/verification-protocol.md` (unchanged) still governs when a claim actually has to be
run rather than reasoned about.

An optional exact-parity path exists (`references/optional-real-engine.md`) for when the real
Python backend + a LiteLLM-compatible endpoint are already set up and you want the tested
pipeline's exact behavior (concurrent fan-out, the real risk formula, budget-checkpointed
resumable audits, mutation-verified test generation) — but it's the exception, not the default.

## Install into a target project

Copy this whole folder into the target project's skill directory:

```bash
cp -r skills/qc-orchestrator <target-project>/.claude/skills/qc-orchestrator
```

Or as a *personal* skill, available in every project:

```bash
cp -r skills/qc-orchestrator ~/.claude/skills/qc-orchestrator
```

Discovered automatically — no separate registration or restart. Works the same way in any host
that supports the Claude Skill format and gives the model file-read + shell-command tools, though
the specialist plugins/MCP tools (see below) are Claude-Code-specific — a host without plugin/MCP
support always falls back to the bundled prompts.

Run `scripts/check_setup.sh --install` once after installing to auto-install the specialist
plugins/MCP/CLI tools (`agent-skills`, `security-guidance`, the standalone `semgrep` CLI, Playwright
MCP, `superpowers` for the TDD handoff). Not required — every flow works with nothing installed, falling back to the
bundled prompts per category — but coverage and evidence quality are better with them present.
`specialist-runner.md` also auto-installs a missing specialist the first time a run actually needs
it, so this is a convenience, not a hard prerequisite.

## Specialist registry — how to add or remove a specialist

`references/registry.json` is the single file that maps each review category (`backend`,
`frontend_static`, `frontend_live`, `security`, `data`) to its `primary` / `secondary` / `fallback`
specialist, plus an `install` map of the exact install commands for each plugin/MCP `ref`. To add
a new specialist for a category (or swap which one is primary): edit `registry.json` only — no
flow doc (`audit-flow.md`, `pr-regression-flow.md`, `test-plan-flow.md`) hard-codes a specialist
by name, they all route through `references/specialist-runner.md`, which reads the registry. If
the new specialist's raw output needs translating into a `finding` object
(`schemas/findings.schema.json`), add a short `references/adapters/<tool>.md` file following the
existing adapters' shape (how to call it, what its raw output looks like, how each field maps,
known limitations) and point `registry.json`'s new entry at it.

## What's inside

- `SKILL.md` — always loaded when the skill triggers; the 4-choice mode menu and the routing
  table across all flows.
- `references/registry.json` — the specialist registry (see above).
- `references/specialist-runner.md` — how any flow turns "review category X on this scope" into
  an actual specialist call: presence-check → auto-install if missing → call → normalize output
  into a `finding` → evidence-cap (cheap one-line check for self-proven evidence, full
  `verification-protocol.md` for anything reasoning-only) → return.
- `references/adapters/*.md` — how each specialist's raw output maps into
  `schemas/findings.schema.json`'s `finding` object: `agent-skills-code-review.md`,
  `security-guidance-plugin.md`, `semgrep-mcp.md`, `playwright-mcp.md` (finding adapters), plus
  `superpowers-tdd.md` (a handoff instruction for the test-gen mode, not a finding adapter).
  `code-review-plugin.md` is kept but historical only — the plugin it documents was removed from
  `registry.json` (confirmed non-agent-invokable); see `candidate-vetting.md`.
- `references/candidate-vetting.md` — the mandatory 6-step process (install → presence →
  invokability → masking-check → real smoke test → registry+adapter write-up) to run before
  adding any new plugin/MCP to `registry.json`. A README claiming a plugin "supports X" is not
  verification — `code-review@claude-plugins-official` is an official Anthropic plugin and still
  turned out to be non-agent-invokable; nothing gets a pass just for being reputable.
- `references/evidence-and-judge.md` — the non-negotiable evidence-capping/scope-capping/
  dedupe rules every finding must go through, unchanged from v1, ported from `verify/evidence.py`
  and `core/judge.py` in `qc-engine`'s own code (deliberately code there too, not a prompt).
- `references/verification-protocol.md` — the non-negotiable "run it, don't just reason about
  it" mandate, unchanged from v1: findings must be backed by an actual test/query/script run
  wherever one is possible, with a named escalation procedure (ask the user to provide access /
  skip / accept a synthetic-data fallback) for when a real run is technically blocked. Applies
  hardest to backend/frontend correctness claims, the Raw→DB→UI data pipeline, and whole-repo
  audits.
- `references/review-flow.md` — now a shared step library (scope/baseline/route, plus the
  per-category review + evidence/judge steps) reused by `pr-regression-flow.md` and
  `audit-flow.md`, not a menu mode of its own anymore.
- `references/pr-regression-flow.md` — **new**: the top-level "QC diff" / "QC a Pull Request"
  flow. Reuses `review-flow.md`'s scope/baseline/route steps verbatim, routes categories through
  `specialist-runner.md`, and adds a regression-gap check (affected APIs/routes/symbols with no
  covering test, or an existing test that now fails).
- `references/audit-flow.md` — whole-repo/directory audit; unchanged risk-triage logic, now
  routes its per-category review through `specialist-runner.md` instead of reading a prompt file
  directly.
- `references/data-pipeline-flow.md`, `references/qc-checklist-input.md` — unchanged from v1;
  the Data-pipeline QC mode has no outside specialist to route to, so it keeps its original
  self-written logic in full.
- `references/test-plan-flow.md` — Oracle/Planner test-plan generation, unchanged core logic,
  plus a new handoff step: once the user approves a scenario, hand it to the Superpowers TDD
  skill (`references/adapters/superpowers-tdd.md`) to generate and run real test code.
- `references/prompts/*.md` — the real agent prompts (backend/frontend/security/data/impact/
  oracle/planner/judge). `backend`/`frontend`/`security` are now **fallback-only** (used when no
  specialist plugin/MCP is available for that category); `data`/`impact`/`oracle`/`planner`/
  `judge` are still the primary, only implementation for their roles. `data` was added locally
  for this project to cover Raw→DB and DB→API/UI pipeline correctness (the upstream `qc-engine`
  prompt set that the rest were copied from doesn't ship one); the others are copied verbatim
  from `src/qc/agents/prompts/`.
- `references/schemas/*.schema.json` — the output shapes those prompts target, copied verbatim
  from `schemas/`, unchanged by this overhaul.
- `references/optional-real-engine.md` — install + full CLI reference for the exact-parity path,
  only relevant if the real backend is already set up.
- `scripts/check_setup.sh` — checks (and, with `--install`, auto-installs) the specialist
  plugins/MCP tools this overhaul added. Unrelated to `optional-real-engine.md`'s `qc` CLI check.

## Updating

The bundled prompts/schemas and the flow docs are a snapshot of `qc-engine`'s own agents at the
time this package was generated. If you change a prompt, schema, or the judge/evidence logic in
`src/qc/`, re-copy the changed files into `references/` and update the matching flow doc in the
same change — CLAUDE.md's own rule for this repo ("when code and docs disagree, docs win, or
update the docs in the same commit") applies to this package too. If you add or remove a
specialist plugin/MCP tool, that's a `registry.json` + (if needed) a new `adapters/*.md` file —
no flow doc should ever need editing just to add or remove one.

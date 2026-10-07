# Flow 1 — Review a diff/PR, per-category step library

`references/pr-regression-flow.md` is the top-level entry point for "QC diff" / "QC a Pull
Request" now (it reuses this flow's steps 1-3 verbatim, then adds a regression-gap check).
`references/audit-flow.md` also reuses this flow's steps 4 and 6 (review-one-file-per-category,
then evidence/scope-cap + judge) for whole-file audit review. This doc stays as that shared step
library — not a mode of its own in `SKILL.md`'s menu anymore.

Two ways into this flow, both end up at the same steps 2-7 once you have a changed-files list:

- **Diff mode** — a base ref, branch, or "the current diff" (uncommitted/staged changes).
- **PR mode** — a PR number. Fetch it yourself: `gh pr diff <number>` for the diff, `gh pr view
  <number> --json baseRefName,headRefName,files,title` for metadata. Don't ask the user to paste
  the diff. If `gh` isn't installed/authenticated, say so plainly and offer diff mode against the
  PR's branch instead (`git fetch origin pull/<number>/head && git diff main...FETCH_HEAD`, or ask
  for the branch name) rather than silently failing.

## Tool mapping

The bundled prompts (`prompts/*.md`) were written for the real engine's own tool names. Map them
to your own tools as you read:

| Prompt's tool | Your equivalent |
|---|---|
| `codesearch_read` | Read |
| `codesearch_grep` | Grep |
| `codesearch_definition(symbol)` / `codesearch_references(symbol)` | Grep for the symbol name (approximate — you don't have a real symbol index; say so if you're not confident you found every caller) |
| `shell_ro` | Bash, restricted to `git log`/`git show`/`git diff`/`git status` for this step |
| `testrunner` | Bash, running the project's real test command (ask, or check `package.json`/`pyproject.toml`/similar if not obvious) |
| `$context_path`, `$policy_context`, etc. | Not files on disk here — just substitute the actual value inline (project-specific rules: only what the user told you, never invent one) |

## Steps

1. **Determine scope.** Diff mode: ask the user which diff — a base ref (`HEAD~1`, a branch, a
   merge-base) if not already clear. `git diff --name-status <base>` for the changed-files list
   (path + status: added/modified/deleted). PR mode: see above — `gh pr diff`/`gh pr view` give
   you the same changed-files shape without the user pasting anything.
2. **Baseline checks — run them, don't just note they exist.** If the project has a lint/
   typecheck/test/build command (check `CLAUDE.md`, `package.json`, `pyproject.toml`), run it once
   now and keep the results — this is what `context.json`'s `lint`/`typecheck`/`static` sections
   give reviewers in the real engine, so they don't re-report what a tool already caught, and it
   doubles as your first piece of real evidence for the run-it checks below. Skip only when no
   such command is discoverable at all; don't guess a command that might not exist.
3. **Route.** Read `prompts/impact.md` and apply its `route_to` heuristic yourself against the
   changed-files list: `backend` for server-side changes, `frontend` for UI/client code,
   `security` if auth/authz/input-handling paths are touched, **`data` for anything touching a
   raw-source ingestion/sync job, a DB model/migration, or a serve-layer query that reads a DB
   value out to an API/UI.** `data` is in scope for this native flow (see `prompts/data.md`) and
   follows `references/verification-protocol.md` for how to actually run its checks rather than
   only reading code. `ux` (the `frontend_live` specialist category, Playwright MCP) is **not**
   routed for this flow by default — `registry.json`'s `qc_pr_commit` mode doesn't list it,
   unlike `audit_repo` — not because no live-browser capability exists in this skill; it does (see
   `audit-flow.md`), it's simply not wired into diff/PR review. Say this explicitly rather than
   implying the capability is missing outright, and don't attempt a live check here without going
   through `specialist-runner.md`/`registry.json` first.
   - An empty `route_to` (pure docs/config/test-only diff) is a valid, honest outcome — say so
     and stop here.
4. **Review, one category at a time — via the specialist runner, not a direct prompt read.** For
   each routed category (`backend` → specialist category `backend`, `frontend` → specialist
   category `frontend_static`, `security` → `security`, `data` → `data`), call
   `references/specialist-runner.md` with that category and this scope. It decides which
   specialist actually runs (a plugin, an MCP tool, or the bundled prompt as fallback — see
   `references/registry.json`), calls it, and hands back normalized candidate findings shaped
   like `schemas/findings.schema.json`'s `finding` object (skip `id`/`schema_version` for now —
   added next; `agent` is already set by the runner). `ux` still has no dedicated specialist in
   this package — say so explicitly rather than silently skipping it or attempting it without a
   real tool, and mention it if a browser-automation tool happens to be available (that's what
   `frontend_live`/Playwright MCP covers when reachable). An empty findings list per category is a
   common, good outcome; don't strain to find something.
5. **Finalize each finding**: assign `id` as `F-` plus any 6 hex-looking characters, unique
   within this run (exact hash reproducibility doesn't matter here — uniqueness does);
   `schema_version: "1.0"`. `agent` was already set by the specialist runner — don't overwrite it.
6. **Evidence + scope capping, then judge.** Follow `evidence-and-judge.md` exactly — this is
   the one part of this flow that isn't optional or adaptable. Evidence capping here is what
   `specialist-runner.md`'s own Step 5 already walked through per finding as it came back; this
   step is the final, defensive re-assertion `evidence-and-judge.md` itself calls for, not a
   from-scratch redo.
7. **Report.** Publish this as an HTML Artifact automatically — see `references/html-report.md`
   for the design treatment and structure — no need for the user to ask for one. It carries:
   overall verdict-style read (any `blocking` finding present → treat as BLOCKED, otherwise
   PASS/advisory), findings grouped by severity, which categories were routed to vs. skipped and
   why, **and which specialist actually ran per category** (see `specialist-runner.md` step 7 /
   `html-report.md`'s "Specialist source" section). Then a short chat pointer to it (2-3 sentences:
   headline + link) — don't also paste the full findings list as chat text, the artifact is the
   detailed version.

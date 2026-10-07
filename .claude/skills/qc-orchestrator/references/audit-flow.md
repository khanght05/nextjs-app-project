# Flow 3 — Lightweight whole-repo audit (native, approximate `qc audit`)

**Read this caveat first, and repeat it to the user before starting:** this is an
*approximation* of the real engine's audit mode, sized for a handful of files reviewed in one
sitting — not a port of its exact risk formula, and it has no budget cap, checkpointing, or
resume. For a large repo (hundreds of risky files, needing to stop and resume across a real
dollar budget), the real `qc-engine` CLI's `qc audit` is the right tool — see
`optional-real-engine.md`.

This flow sweeps by **category**, not by a single combined file ranking — a whole-repo audit that
only ever surfaces the noisiest category's files (usually backend) isn't a repo audit, it's a
backend audit that happened to run in the repo's root. Every applicable category gets its own
minimum slice of attention.

## Steps

1. **Scope.** Whole repo, or a subdirectory the user names.
2. **Determine applicable categories.** The standard sweep is **Backend, Frontend, Security, Data
   pipeline, UI/UX**:
   - Backend → specialist category `backend` (via `specialist-runner.md`).
   - Frontend → specialist category `frontend_static` (via `specialist-runner.md`).
   - Security → specialist category `security` — re-reviews the SAME files Backend/Frontend
     already selected through a different lens; it does not need its own separate file set.
   - Data pipeline → `prompts/data.md` (specialist category `data`), governed by
     `references/verification-protocol.md` (run the actual check or escalate — this applies with
     full force in audit mode, see step 5).
   - UI/UX → **check once, right now, before any per-file work** (same "do this once per session,
     not once per unit" discipline `data-pipeline-flow.md` uses for its own environment
     discovery): is there a reachable dev server/preview URL for this app?
     1. **First, just check** — an already-running instance, or a preview URL the user already
        gave you. If reachable, done, move on.
     2. **Not reachable → don't stop at "no" yet, actually start it yourself.** Look in the
        target repo's own `package.json` (or the equivalent convention for that stack) for a
        `dev`/`start` script, run it detached/backgrounded, then poll for reachability with a
        **real timeout** — a cold Turbopack/webpack start has measured 30+ seconds in testing, so
        one quick check-and-give-up is not a genuine attempt; give it up to ~60s, checking every
        few seconds. Only if no such script exists, or it's still unreachable after that — *now*
        it's genuinely "not reachable," and the skip reason must name the exact command tried and
        how long you waited, not just "no reachable running instance" bare (per `registry.json`'s
        `frontend_live` condition, which spells out this same two-step check/then-start sequence).
        **If you started it yourself, remember that and stop it again once this flow's report is
        published** — don't leave an orphaned background process running past this audit, and
        never touch a server that was already up before you got here.
     - **Reachable (found already-up, or started it yourself)** → specialist category
       `frontend_live` is in scope (Playwright MCP via `specialist-runner.md`,
       `adapters/playwright-mcp.md`) — this is the real interactive UX check, not a proxy, and
       it's what step 5 must actually call.
     - **Still not reachable after a genuine start attempt** → `frontend_live` is skipped this
       run, say so and why in the report (`"skipped: no reachable running instance (tried <the
       actual command>, still unreachable after Ns)"`, per `registry.json`'s `frontend_live`
       condition) — fall back to `prompts/frontend.md`'s semantic-accessibility + state/UX-adjacent
       criteria (focus management, loading/error/empty triplet, form correctness) applied to files
       that render a route/component, same file set as Frontend. Say plainly this fallback is a
       static-code proxy for UX, not an interactive session, and that it ran only because no live
       instance was reachable even after trying to start one — never silently treat this proxy
       pass as if it were the real `frontend_live` check.
   Drop a category outright — and say so in the final report — only when the scope genuinely has
   none of it (e.g. a pure-backend directory has no Frontend/UI-UX category to sweep).
3. **Per-category risk triage** (not the real formula — say so), run **separately for each
   applicable category** so one noisy category can't crowd the others out of the target list:
   - Scope each category to its own file set first: Backend → non-test files under the scope's
     backend tree, Frontend → non-test files under the scope's frontend tree, Data pipeline →
     files (in either tree) matching the data-pipeline flag below, UI/UX → frontend files that
     render a route/component (skip pure util/type/style files) — this same file set is what
     step 4 selects from and what step 5 resolves to an actual navigable route for `frontend_live`
     when a live instance is reachable, or reviews via the static-proxy fallback when it isn't.
   - **Churn**: `git log --since="6 months ago" --name-only --pretty=format:` over that category's
     file set.
   - **Size proxy**: `wc -l` per file (a stand-in for complexity — the real engine uses cyclomatic
     complexity or LOC as a fallback, same idea).
   - **Sensitivity flag**: a file's path or content matching `auth`, `payment`, `billing`, or
     `session` (case-insensitive) — same keyword heuristic the real engine's `_is_sensitive`
     check uses. Flagged files are **always included**, same as the real engine's
     `always_include` rule.
   - **Data-pipeline flag**: a file's path matching `sync`, `etl`, `ingest`, `pipeline`, or
     `migrat(ion)` (case-insensitive), or one that imports a DB session/model and is also called
     from an API router — same always-include principle, and always additionally reviewed with
     `prompts/data.md` regardless of which category's file-set it surfaced under.
   - Combine churn × size as a rough per-category score. Sort descending within each category.
4. **Select targets — guarantee coverage, don't let one category win everything.** Every
   sensitivity- or data-pipeline-flagged file, plus a minimum handful **from each applicable
   category** (2-3 files/category is a reasonable default so a lower-churn category isn't
   dropped purely because another category's files scored higher in absolute terms). Ask the user
   for a total budget if not obvious; by default keep the grand total across all categories in the
   same "one sitting" order of magnitude the old single-list version used (roughly 8-12 files
   total, not 8-12 *per* category). If that means shallow coverage per category for a large repo,
   say so plainly and suggest narrowing to fewer categories/a smaller scope, or the real engine —
   never silently shrink a category to zero just to keep the grand total down. If `frontend_live`
   is in scope (step 2 found a reachable instance), resolve each selected UI/UX file to the actual
   route/URL it renders (the app's router config, or the file-path convention if the framework
   maps paths to routes directly) before step 5 — a selected file that doesn't correspond to any
   navigable route (a shared leaf component, not itself a page) gets noted as such and reviewed
   only through the static-proxy pass, not `frontend_live` (Playwright can't navigate to something
   that isn't a route).
5. **Review each selected file, through the lens of the category that selected it — plus Security
   always, and Data pipeline whenever the data-pipeline flag applied to that file.** Run
   `review-flow.md`'s steps 4 and 6 (review → evidence/scope-cap, then judge across everything
   once all categories are done) treating the **whole file as it stands** as the thing being
   reviewed, not a diff — there's no "before" state here, so frame it to yourself as "does this
   code, as it stands, have a real bug?" rather than "what changed." `review-flow.md`'s step 4
   means calling `references/specialist-runner.md` per category exactly as it now does — **not**
   reading `prompts/<role>.md` directly — so an audit gets the same plugin/MCP-first sourcing a PR
   review does (`agent-skills`'s `code-review-and-quality` skill, `security-guidance`, semgrep
   plugin/Guardian), falling back to the bundled prompt only when nothing else is available for
   that category. `adapters/agent-skills-code-review.md`'s own note: unlike the old
   `code-review@claude-plugins-official` candidate (kept as historical record in
   `adapters/code-review-plugin.md` — commands-only, never actually agent-invokable), this skill
   has no diff-shaped restriction, verified to work on a single whole file directly. Same
   evidence-and-judge rules regardless of source.
   `references/verification-protocol.md` does not get lighter here either — audit mode is not a
   read-only pass: any selected file touching DB access, an ETL/sync script, or a serve-layer
   query gets the same run-it treatment (an actual query, an actual narrowed script run) it would
   get in a diff review, and a technically-blocked check still gets escalated per that document
   rather than quietly settling for `reasoning_only`. This is where skipping real verification is
   most tempting, precisely because the scope is large — and exactly where it matters most, since
   an audit finding gets no second look from a PR reviewer to catch a wrong guess.

   **`frontend_live`, when in scope, is a separate call from the Frontend/UI-UX static pass, not
   folded into it.** For every selected UI/UX file that resolved to a real route in step 4, call
   `specialist-runner.md` with category `frontend_live` on that route — same as calling it for
   `backend`/`frontend_static`/`security`/`data`, just keyed by route instead of by file path. This
   is the actual point of having Playwright MCP registered for this category: don't let it sit
   declared-but-uncalled while the static-proxy fallback quietly does all the UI/UX work even when
   a live instance was reachable the whole time. A UI/UX file that never got a resolved route still
   goes through the static-proxy pass (`frontend_static`'s file set, UX-adjacent criteria) — that
   pass and `frontend_live` are complementary, not alternatives, whenever both apply to the same
   file.
6. **Report, organized by category — and only the categories that actually found something,
   with which specialist actually ran named per category** (per `specialist-runner.md` step 7 /
   `html-report.md`'s "Specialist source" section — e.g. "Security: security-guidance plugin +
   semgrep CLI via Bash", "Backend: agent-skills's code-review-and-quality skill").
   One section per category that has findings, grouped within it by rough root-cause theme (2-4
   words each — "missing tenant scope", "raw→DB dedup gap", ...). A category that was checked and
   came back clean does **not** get its own empty section — fold it into the one-line coverage
   summary instead of padding the report with "Frontend: no issues found." A category that was
   **skipped** entirely (not applicable to this scope, or `frontend_live` finding no reachable
   live instance this run) still needs a stated reason in that same summary line — "clean"
   (checked, nothing found) and "skipped" (not checked, and why) are different claims and must
   never be conflated. Report `frontend_static`'s static-proxy UX pass and `frontend_live`'s real
   interactive pass as their own lines under Frontend/UI-UX (per-category specialist source, same
   as every other category) whenever both actually ran, so a reader can tell a route was really
   clicked through vs. only read as code.
7. **State the coverage honestly.** One line covering everything: how many categories were
   applicable, how many were actually swept vs. skipped and why, how many files were reviewed out
   of how many the heuristic scanned per category, and which categories produced the findings
   sections below. Never imply this covered the whole repo when it covered a handful of files per
   category, picked by an approximate score.
8. **Publish the report as an HTML Artifact — automatically, every run.** See
   `references/html-report.md` for the design treatment and structure (category sections, stat
   tiles, the coverage section from step 7). No need for the user to ask for one. Then a short
   chat pointer to it (2-3 sentences: headline verdict + link) — don't also paste the full
   findings list as chat text.

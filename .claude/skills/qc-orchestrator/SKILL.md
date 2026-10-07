---
name: qc-orchestrator
description: Acts as a multi-agent QA orchestrator — routing each review category to the best available specialist (an installed plugin, an MCP tool, or your own reasoning as a fallback) via a registry, then normalizing and re-verifying every finding before reporting — to review a PR/diff for bugs (with a regression-gap check), audit a repository for risk, QC a data pipeline, or generate a sourced test plan and hand approved scenarios off to TDD. Use whenever the user asks to QC/review/test a PR, diff, branch, or staged changes; to audit or assess the quality/risk of a repository; to QC a data pipeline/metric; or to generate test cases, a test plan, or a checklist for a feature or area of code. Self-contained — auto-installs missing specialist plugins/MCP tools when needed, falls back to native reasoning when it can't.
---

# QC Orchestrator skill (qc-orchestrator) — specialist-routed mode

Ported from `qc-engine`, a self-hosted multi-agent QA tool, then re-architected from a
"do-everything-yourself" skill into an **orchestrator**: for each review category, it calls out
to whichever specialist actually exists for that category — an installed plugin
(`code-review`, `security-guidance`), an MCP tool (Semgrep, Playwright), or, only when nothing
else is available, your own reasoning against the bundled prompts (`references/prompts/*.md`).
`references/registry.json` is the single source of truth for which specialist handles which
category — add or remove one there, never by editing a flow doc.

This does not itself find bugs "for free" — it's a disciplined procedure that keeps you honest
the same way the real engine's code does: every finding, regardless of which specialist produced
it, gets normalized into the same shape and re-verified before you report it, and severity you
can't back with real evidence gets capped, not trusted. See `references/specialist-runner.md` for
exactly how a category gets routed, and its own evidence decision table for which evidence kinds
count as already self-proven (skip the heavy re-verification) vs. still needing it.

## Entry point — lead the user, don't wait for a perfectly-formed ask

This skill is a tool with a job to do, not a form waiting to be filled in correctly. When it
triggers — a bare invocation, "QC this", "review my code", anything QC-shaped but underspecified —
**you drive the interaction**, the same way a real QC engine's own CLI would greet you with a menu
instead of an empty prompt.

0. **Pre-flight dependency check — every time this skill triggers, before step 1.** Run
   `bash scripts/check_setup.sh` (no flag) once, right away, before doing anything else — this is
   the same PASS/FAIL sweep across all 5 specialists (`agent-skills`, `security-guidance`,
   `semgrep` CLI, `playwright`, `superpowers`) that `specialist-runner.md` would otherwise only
   discover lazily, one category at a time, mid-flow.
   - **All PASS** → say nothing about it, proceed straight to step 1. Don't narrate a routine
     pass — only a gap is worth a line.
   - **Any FAIL** → immediately run `bash scripts/check_setup.sh --install` (this skill's standing
     auto-install authorization already covers this — don't ask first), then run the plain check
     one more time to get the real, final state. Whatever is still failing after that genuine
     attempt, say so in one short line before continuing (e.g. "Pre-flight: semgrep CLI installed
     just now; playwright still unreachable, will fall back per-category if that specialist gets
     routed to") — then proceed to step 1 regardless of the outcome. **Never block the menu or
     the user's ask on this** — a specialist that stays unavailable after a real install attempt
     is exactly what `specialist-runner.md`'s own fallback chain (secondary → prompt) already
     handles per category; this pre-flight step exists to catch and fix the common case *before*
     the user is mid-flow, not to gate whether the flow can start at all.
   - This is a **one-time-per-invocation eager sweep**, not a replacement for
     `specialist-runner.md`'s own per-category presence/invokability checks (A.1/A.2) — those
     still run when a flow actually calls a category, since they catch things this cheap PASS/FAIL
     script can't (a plugin that's active but commands-only, a server that's registered but not
     actually reachable this instant, a masked `agents/` list). Think of this step as reducing how
     often that deeper check ever has to reach for its own auto-install path, not as making it
     redundant.
1. **Look before you ask.** Spend one cheap round of investigation first — `git status`, `git log
   --oneline -10`, and a glance at what's changed or what directory the user is in — so your
   questions are grounded in *this* repo and *this* moment, not generic. This is what turns "what
   do you want me to review?" into "you have uncommitted changes in `X` and 6 recent commits
   touching `Y` — want me to review those, or something else?"
2. **Offer a mode menu first — exactly 4 choices, no more, as plain category labels.** Use
   `AskUserQuestion` with the mode as a single question. **The option LABELS stay generic
   category names** — never bake a specific finding (a real diff, a churn hotspot, a named
   directory) into the label itself, even though step 1 already found one; that specific finding
   is what step 3's follow-up question is for, not this one. A description/subtitle under an
   option may mention repo context in passing, but picking the option must not itself commit to
   one exact target — that commitment happens in step 3.
   - **QC repo / audit** — a module, directory, or the whole repo → `references/audit-flow.md`.
   - **QC diff** — the current working-tree diff, or a base ref/branch the user names →
     `references/pr-regression-flow.md` (diff mode).
   - **QC a Pull Request** — a PR number → `references/pr-regression-flow.md` (PR mode) — fetch
     the diff yourself (`gh pr diff <number>`), never ask the user to paste it.
   - **Sinh test CI/CD** — generate a sourced test plan for a named feature/area →
     `references/test-plan-flow.md`.
   Do **not** add a 5th "not sure / recommend for me" button — `AskUserQuestion` already gives the
   user a free-text "Other" answer on every question, which is exactly where "I don't know, you
   pick" or an already-specific custom ask (a named PR, "audit the rules module", "QC the data
   pipeline for metric X") lands. If the user's "Other" answer is itself still vague, use what step 1
   found to recommend a specific mode + target and say why in one sentence, then proceed. "QC data
   pipeline" has no hard menu button (unchanged from v1) — it's reached via a named metric/
   platform/product in the initial ask or via "Other", routing to
   `references/data-pipeline-flow.md`.
3. **Always ask exactly one follow-up round after the mode is picked — never skip straight to
   work just because step 1 already found something specific.** This is a SEPARATE
   `AskUserQuestion` call, not a reuse of step 2's question. This is where step 1's findings
   actually surface as concrete, named options — e.g. "audit the `X` module (highest churn)" /
   "audit the whole repo" for audit mode, or the specific base ref/branch candidates for diff
   mode — never a blank text box. This follow-up pins down the scope needed to actually start:
   which base ref/branch for diff mode, which PR number for PR mode, which module/directory for
   audit mode, which feature/area for the test-gen mode. Then start. Don't run a third round
   asking things this skill's own flow docs already default sensibly (how many files for an
   audit, which categories to sweep, etc.) — pick the documented default, state it in the final
   report, and move.
   - **Exception**: if the user's OWN initial message (before you ever showed a menu) already
     named both a mode and a specific target unprompted (a PR number, "audit the rules module",
     "review the current diff") — skip both the mode menu and this follow-up entirely, per the
     table's last row below. This exception is about what the USER already said on their own,
     never about a specific-sounding option you yourself generated for step 2.
4. **Tell them what you did, unprompted.** The report at the end of any flow should make it
   obvious what got covered and what didn't (see each flow's own reporting step) — the user
   should never have to ask "wait, did you check X?" That report is an HTML Artifact by default —
   see `references/html-report.md` — published automatically, not only when asked.

| Mode | Doc |
|---|---|
| QC repo / audit — a whole repo or a chunk of it | `references/audit-flow.md` |
| QC diff / QC a Pull Request — a PR / branch / "what changed" / the current diff | `references/pr-regression-flow.md` |
| Sinh test CI/CD — generate test cases / a test plan / checklist for a named feature or area | `references/test-plan-flow.md` |
| QC data pipeline — a metric/platform/product QC ask (reached via "Other", not a hard menu button — see step 2) | `references/data-pipeline-flow.md` |
| Mixed ask | Do the part that maps to one of the flows above, **and explicitly tell the user what you can't do** rather than silently dropping either half |
| Request already names a clear mode **and** a clear target (a PR number, "the current diff", "audit the rules module") | Skip the menu — go straight to that flow |

Every category a flow reviews (`backend`, `frontend_static`, `frontend_live`, `security`, `data`)
is routed through `references/registry.json` + `references/specialist-runner.md`, not
hard-coded per flow — see that file for how a category resolves to an actual specialist
(plugin/MCP/prompt fallback), and `references/adapters/*.md` for how each specialist's raw output
gets normalized into a `finding` object.

If the real `qc-engine` CLI happens to already be installed and configured in this project (or
the user says it is / asks for something only it can do — mutation-verified test generation, a
large budget-capped resumable audit), see `references/optional-real-engine.md` instead. Default
to the native flows above; that's an exception path, not the norm.

## Non-negotiable: read this before reporting any finding

`references/evidence-and-judge.md` — every finding, from every flow, goes through evidence
capping, scope capping, and a final dedupe/rank pass before you show it to anyone. This is the
part that keeps a native review trustworthy instead of just plausible-sounding; don't skip it
because a finding "feels obviously right."

`references/verification-protocol.md` — every finding must be backed by an actual run wherever
one is possible (a test, a DB query, a script, a build), not just reasoning about the code. This
is what decides when `evidence.kind: "reasoning_only"` is actually earned, and what to do when a
real check is technically blocked (no DB credential, no raw sample, etc.) instead of silently
skipping or downgrading. Applies hardest to backend/frontend correctness claims, to the data
pipeline (Raw source → DB, DB → API/UI serve layer — see `prompts/data.md`), and to whole-repo
audits, where settling for a read-only pass is the easiest mistake to make. Read it alongside
evidence-and-judge.md, not instead of it: one decides whether you tried hard enough to prove a
finding, the other decides what an unproven finding is worth.

`references/html-report.md` — the final report of every flow is published as an HTML Artifact
**automatically, every run, without the user asking for one** — not just a chat summary. Covers
the design treatment and what the page needs structurally; read it before the reporting step of
whichever flow you're running.

## Ground rules across every flow

- **An empty result is a good, common answer.** Most diffs have no bug; most repos don't need
  every file audited; a genuinely undocumented feature can have zero sourced statements. Don't
  strain to find something to report.
- **Never invent a source, a requirement, or a business rule.** If you can't cite where a claim
  comes from (a doc, a code line, an actually-observed test run), don't include the claim.
- **Verify by running it, escalate when you can't** — see `references/verification-protocol.md`.
  Don't settle for reading code and reasoning about it when an actual test, query, or script
  could prove the claim instead.
- **Any database access is read-only, always — no exceptions.** Never `INSERT`/`UPDATE`/`DELETE`/
  `DROP`/`TRUNCATE`/`ALTER`/apply a migration against a real database, in any flow, for any
  reason — see `references/verification-protocol.md`'s dedicated section. A check that would need
  a write either gets proven read-only instead, or gets its write done against a disposable local/
  synthetic target only, never the real one.
- **Say what you skipped and why**, whether it's a category with no reachable specialist this run
  (`frontend_live` needs a reachable dev server/preview URL for Playwright MCP to drive — try
  starting the target app's own `dev`/`start` script yourself first if it isn't already up, per
  `audit-flow.md`'s step 2 and `registry.json`'s `frontend_live` condition; only skip, stated
  plainly, once that real attempt still comes up unreachable — never silently swapped for a
  static-code guess) or a heuristic's known limitation (the audit flow's risk triage is
  approximate). Silence about a gap
  is worse than naming it.
- **Don't write or fix code as a side effect of a QC ask** unless the user separately asks you
  to act on a finding. Reviewing and fixing are different requests.

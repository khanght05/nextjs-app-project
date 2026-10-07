# Flow 4 — QC data pipeline (Raw source → DB → API/UI), metric-by-metric

This flow formalizes the ad-hoc "QC assistant" workflow already used on this project: for one
metric, one metric across all platforms, or the full metric × platform × product grid, verify
**Raw source → DB** and **DB → API/UI** separately and report a Status + a two-part Note per
product/game, exactly like the QC rounds already run in this repo's chat history and tracked in
its QC checklist spreadsheets. It reuses `prompts/data.md` as the investigation checklist and
`references/verification-protocol.md` for the run-it-or-escalate rule — this flow is those two
documents applied systematically across a grid instead of only to the files a diff touched.

## When this triggers

- The user picks **"QC data pipeline"** from the mode menu (see `SKILL.md`'s step 2).
- The user names a metric, a metric + platform, or a metric + platform + product/game and asks to
  QC it, without naming a PR/diff/audit target — e.g. "QC Reach của Meta cho TFT PC", "QC CPI của
  Google", "QC Cost per Conversion".
- The user asks to QC "data" / "pipeline" / "Raw→DB DB→UI" generically.

## Scope resolution — narrow first, full sweep only when nothing is named

0. **If the user points this run at an existing QC checklist file** (this project's own hand-run
   tracker, e.g. `Feedback/[DCT] Grow Tool QC Pt2.xlsx`'s `02_Checklist Metrics` sheet, or a
   single-tab CSV export of it) — stop here and follow `references/qc-checklist-input.md` instead
   of the two branches below. The checklist's own rows define the scope and its own column
   vocabulary defines the Status wording; don't also apply steps 1–2.
1. **If the user names a metric and/or platform and/or product**, scope tightly to exactly that —
   this is the common case and mirrors every QC round already run on this project. Don't expand
   scope beyond what was named.
2. **If nothing is named at all** ("QC data pipeline" with no target), the default scope is **every
   metric this project tracks × every ad platform it ingests × every product/game it reports on**.
   Before starting a sweep this size:
   - Find the project's own canonical metric list rather than inventing one — this repo keeps one
     in its frontend metric-definition module and/or a maintained QC checklist spreadsheet if the
     user has shared one this session. Read whichever exists; don't guess a metric list from
     memory.
   - Find the platform list and product/game list the same way (this project's own docs/config —
     not a fixed number to assume unchanged forever).
   - State the resulting grid size (e.g. "~30 metrics × 3 platforms × 8 products").
   - **Stop and ask before running anything.** Call `AskUserQuestion` (or ask plainly in chat if
     it isn't available) with the grid size stated and real choices to narrow it — e.g. pick one
     platform (list them by name), pick one metric (list them by name), pick one product/game
     (list them by name), or "run the full grid anyway, in batches, report as each batch
     finishes." **Do not start pulling data, querying anything, or reading beyond what's needed
     to build this question until the user answers.** "Propose batching" means propose it TO the
     user and wait for a reply — not announce a plan in a text message and proceed to execute it
     in the same turn, which is what silently defaults to "QC everything" from the user's point of
     view even though a plan was technically stated. This is the same shape as
     `verification-protocol.md`'s blocked-check procedure: name the situation, ask, then wait for
     an answer before acting — never ask-and-proceed-anyway.
   - Once the user answers (or explicitly says "just do the whole thing"/"don't ask, run it all"),
     proceed with the chosen scope — batching per the pattern above (one platform's full metric
     set per pass, or one metric across all platforms/products per pass) only if that scope is
     still large enough to warrant it; report incrementally as each batch finishes, mirroring
     `audit-flow.md`'s "large repo → narrow or batch" pattern.

## Environment discovery — do this once per session, not once per unit

Do this immediately after scope resolution above, **before reading or touching any code for
actual unit work** — not as something you get to once you hit a wall mid-flow. Locate:

1. **A raw-source sample** for the platform(s) in scope. This project keeps raw exports under a
   `raw_data/` tree, one subfolder per platform, one file per product — file-naming conventions can
   differ per platform (check the actual filenames rather than assuming a pattern holds across
   platforms). **Before picking a comparison date window, check what date range the raw file
   actually contains** — a raw export can be silently truncated short of the window you'd naturally
   assume, and comparing against a window the raw file doesn't fully cover produces a false
   mismatch that looks like a bug but is actually a scope error. Recompute the comparison window
   from the raw file's real coverage, every time, rather than reusing a window from a previous
   round.
2. **Read-only DB access.** Look for a credentials file/env convention this project already uses
   for QC (kept outside the repo, or in a documented QC script). If found, **actually attempt a
   real read-only connection right now, at discovery time — a found credential is not the same
   thing as a working connection.** A missing driver/library, wrong host, or an auth failure are
   discovery-time blockers exactly like a missing credential — don't let one of these surface for
   the first time in the middle of unit work, several steps into the flow, where it's too late to
   ask before a lot of work has already happened. If a local backend needs to run against this DB
   to serve the API/UI side of the check, look for a documented way to start one in a read-only
   mode (an env flag that disables background sync/write loops) rather than running the project's
   normal write-enabled server against a shared/prod database.
3. **A way to call the real serve layer** for the DB→UI side — a locally-run instance of the
   project's backend (started read-only per #2) with a way to authenticate a request, or an
   existing project script that already does this. Prefer whatever the project already has over
   building a new harness from scratch.

**If any of the three is missing or unreachable**, this is exactly the escalation case
`verification-protocol.md` describes — do not silently skip the unit or mark it passing, and do
not defer it:
1. Name the exact blocker (no raw file found under the expected path, DB host unreachable / access
   denied from this network, no driver installed to actually connect, no way to start the serve
   layer).
2. Call `AskUserQuestion` **immediately, in this same turn, before touching any unit of work
   below.** Give real choices: **provide it** (a path, a credential, a different way to reach the
   DB/API) / **skip this check** (record as skipped-by-request) / **verify against synthetic data
   instead** (a small fake raw sample and a disposable local DB, exercising the same code path —
   never the real database). Do not defer this to later in the run, and do not fold it into the
   final report as the first mention of the gap — the report documents what was already decided
   here, it is not where a blocker gets raised for the first time.
3. Record which of the three happened, per unit or per batch — never leave a unit's status
   ambiguous about whether it was actually checked.

## Read-only, always

Every database interaction in this flow is read-only — a `SELECT`, nothing else — against the real
database, no exceptions, same rule as every other flow (`references/verification-protocol.md`'s
dedicated section, and `SKILL.md`'s ground rules). If starting a local backend instance to serve
the DB→UI side, use its read-only/no-background-sync mode so nothing gets written back to a shared
database as a side effect of QC'ing it.

## Per-(metric, platform, product) unit of work

For each unit in scope, follow `prompts/data.md`'s priority order (raw→DB loss/duplication, wrong
transformation, DB→API/UI query mismatch, migration safety, end-to-end consistency) and its
"mandatory: run it" rule, but write up the result in this shape instead of that prompt's raw JSON
contract:

- **Status** — reuse whatever status vocabulary this project's own QC tracker already uses if the
  user has shared one this session (its own conventions carry meaning to the user — don't invent a
  parallel vocabulary). When the input is the `02_Checklist Metrics`-style tracker, read
  `references/qc-checklist-input.md` for how to find that file's actual current vocabulary (it has
  already changed once — R1–R3 used one set of words, R5 uses a different one — so check the values
  present in the specific file you were handed rather than assuming a fixed list). Distinguish, in
  the status, between four different situations rather than collapsing them all into "not OK":
  - a confirmed code bug (Raw→DB or DB→UI genuinely disagree because of an actual defect),
  - a pending product/definition decision (the numbers are internally consistent, but two valid
    definitions of the metric would give different numbers and nobody has picked one),
  - a platform-inherent limitation (the platform's own API genuinely never returns this field —
    not fixable in this codebase),
  - ordinary data-refresh drift (attribution windows, backfill catch-up between when a raw sample
    was captured and when the DB was queried) — small, directionally-consistent, explainable drift
    is not a bug and should not be reported as one.
- **Note**, always split into exactly two labeled sub-sections, both present even when one side is
  "not applicable" (state why, don't just omit it):
  - **Raw→DB**: raw sample value vs DB value for the same, raw-file-verified date window. If the
    raw source has no literally matching column, say so explicitly and either reconstruct the
    expected value from the ingestion/mapping logic (cite the exact code that does the mapping) or
    state plainly that this side can't be compared and why — never silently assume the raw side is
    fine.
  - **DB→UI**: a direct read-only DB query's value vs what the real API/UI response returns for the
    same window — actually call the endpoint (or run the exact ORM-generated SQL), don't read the
    query and assume it's right. Note when a metric is a non-additive/unique-count style value
    (e.g. a reach-style metric) that cannot be validly summed across the grain you're checking —
    that's a modeling fact to state, not a mismatch to flag.
- **Next step** — present only when Status is not "fully fine": a concrete action. A file:line and
  the specific change needed if it's a confirmed code bug; the specific decision to bring to the
  team if it's a definition question (state both candidate definitions and what changes downstream
  if the team picks one over the other); a re-sync/backfill trigger if it's stale data with a known
  cause; or "escalated: <blocker>, <outcome>" if the escalation procedure above fired for this unit.

## Emitting real findings, not just notes

When a unit's Status is a **confirmed code bug** (not a decision, not a platform limitation, not
ordinary drift), also emit it as a proper finding object per `schemas/findings.schema.json`,
`category: "data-quality"`, following `prompts/data.md`'s own output contract for the `evidence`
object. Run it through `references/evidence-and-judge.md` exactly like any other flow's findings —
this is what gives a real pipeline bug an honest, capped severity instead of leaving it as a free-
text note nobody outside this conversation can triage. A decision-pending or platform-limitation
unit does **not** become a finding — it's real information, but it isn't a bug the judge pass
should rank alongside code defects; keep it in the Status/Note table only.

## Reporting

- **Primary table**: grouped **by platform → metric → product/game**, matching how these QC rounds
  are already organized on this project. Collapse anything with a fully-fine status out of the
  visible table — state the count ("112/240 cells: fully fine, collapsed"), don't enumerate them —
  so a full-grid sweep stays readable; show only what needs attention, same principle as
  `audit-flow.md` folding a clean category into one summary line instead of an empty section.
  Within "needs attention," group by the four Status kinds above (bug / decision / limitation /
  drift) so a reader can immediately tell what's actionable-now vs what needs a team decision vs
  what's just informational.
- **Findings section**: any confirmed-bug units that were emitted as findings above, shown with
  real severity (from evidence-and-judge), exactly like every other flow's findings section.
- **Coverage/honesty section**: grid size actually in scope, how many units were fully checked vs
  escalated (and which of provide/skip/synthetic happened) vs not yet reached this pass (if
  batched) — never imply a full-grid sweep happened when only a batch of it did.
- Publish as an HTML Artifact automatically, per `references/html-report.md` — add
  platform/metric-grouped sections (this report's data is naturally hierarchical in a way a flat
  diff-review findings list isn't; sections or tabs per platform, collapsible per metric, is a
  reasonable structure). Then a short chat pointer (headline + link), same as every other flow —
  don't also paste the full per-cell table as chat text.

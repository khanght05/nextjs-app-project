# Verification protocol — run it, or escalate; never silently skip or downgrade

Non-negotiable, same standing as `evidence-and-judge.md`. It encodes a standing instruction from
the project owner: **a QC pass that only reasons about correctness is not a QC pass.** Wherever a
claim CAN be checked by actually running something — a test, a targeted script, a DB query, a
build — running it is the default, not an optional nice-to-have you reach for only when it's
convenient. This applies to every flow that reports findings (`review-flow.md`, `audit-flow.md`),
and it applies hardest to two things: the data pipeline (Raw source → DB, and DB → API/UI serve
layer), and whole-repo audits — because both are exactly where it's tempting to settle for reading
code instead of proving it.

`test-plan-flow.md` is the one exception: `oracle`/`planner` are deliberately no-execution roles
(see their prompts — planner "writes no test code whatsoever, ever") and a human approves the plan
before anything actually runs against it. This protocol governs flows that report findings, not
plan generation.

## Read-only against any real database, always — no exceptions

Every "run it" instruction in this document that touches a database means **read-only** against
the project's real/prod/shared database. Never execute `INSERT`/`UPDATE`/`DELETE`/`DROP`/
`TRUNCATE`/`ALTER`, apply a migration, or run a write-triggering job (an ingestion/sync script that
writes rows, a task queue worker) against the real database — not to verify a finding, not as a
"quick test insert I'll roll back," not for any reason. This holds in every flow and every role,
including `prompts/data.md`'s role, which states the same rule for itself.

If proving something genuinely seems to need a write (e.g. "does the ingestion job's dedup key
reject a duplicate row the way the comment claims?"), do NOT run that write against the real
database. Instead:
- Prove it read-only if at all possible — read the constraint/index definition directly (a
  `UniqueConstraint` in the model, a unique index in a migration), or find an already-existing
  real example in the data that demonstrates the behavior, rather than reproducing it live.
- If it truly can't be proven without a write, do the write only against a disposable, local,
  throwaway target that is never the project's real database — an in-memory/temp-file SQLite DB,
  a mocked ORM session, a test database spun up and torn down entirely locally. This is the same
  "synthetic data" escalation path below, applied specifically to the write side.
- If neither is possible in the time you have, that's a named technical blocker like any other —
  escalate per the procedure below rather than working around the read-only rule.

If you are not certain a command is read-only, treat it as blocked and escalate — never run it to
find out.

## What "run it" means per surface

- **Backend / frontend correctness.** Don't stop at "if you can write a failing test, do." Before
  writing a finding with `evidence.kind: "reasoning_only"`, actually attempt: the project's
  existing test suite (or the narrowest relevant subset), a small targeted script/REPL check, or
  the build/typecheck. Only land on `reasoning_only` after you genuinely tried and hit a **named
  technical blocker** (see escalation below) — not because running something was more effort than
  reading it.
- **Raw → DB (ingestion).** "The ingestion job writes raw rows into the DB correctly" is not
  provable by reading the ingestion script alone — but it is also not something you prove by
  actually running the real ingestion job against the real database (that writes to it, see the
  read-only rule above). Prove it read-only instead: pull a small raw sample, read the DB's
  current state for that same slice (row counts, a spot-checked value, whether a dedup/upsert key
  produced what the code claims), and compare by hand/script. Only run the ingestion logic itself
  if you point it at a disposable local/synthetic target (never the real DB) per the escalation
  path below.
- **DB → API/UI (serve layer).** "The API/UI shows what the DB holds" is not provable by reading
  the query alone. Actually query the DB directly (read-only — a `SELECT`, nothing else) for the
  same window/filter the code claims to compute, and compare against what the endpoint/component
  actually returns — call the endpoint, or run the exact SQL the ORM would issue.
- **Whole-repo audits (`audit-flow.md`).** This is where skipping real verification is most
  tempting because the scope is large. Resist it: any selected file that touches DB access, an
  ETL/sync script, or a serve-layer query gets the same run-it treatment here as it would in a
  diff review, under the exact same read-only rule — audit mode is not a lighter pass, and it is
  never a license to write to the real database either.

## The escalation procedure — when a real run is technically blocked

**The test for "is this a blocker":** if there is anything at all — a credential, a data file, a
reachable host, a tool, a permission, a running service, literally anything — that a human could
hand you or unblock for you to make THIS specific check runnable, then not having it right now is
a blocker, full stop, and it must go through the procedure below. This is true no matter what the
missing thing is, **including something that doesn't resemble any example in this document** —
the examples below illustrate the pattern, they are not an exhaustive list to pattern-match
against. Treating an unfamiliar or unanticipated blocker as "out of scope" and silently skipping
it, rather than naming it and asking, is exactly the failure this protocol exists to prevent — a
new kind of credential or dependency showing up that this document never happened to mention is
not a reason to go quiet about it.

Illustrative examples (not a checklist — plenty of real blockers won't resemble any of these): no
DB credential, no API key/token for some third-party service the code calls, an unreachable host,
no local sample of some input data, a test runner that isn't configured, no network access. When
you hit one — this one or any other:

0. **Check what's already there before calling anything blocked.** Don't assume a credential is
   missing just because you haven't looked — the app hosting this session may have already
   injected one as an environment variable for this exact project, for DB access or for ANY
   third-party API/platform credential the code touches (not DB-only). At minimum:
   - Run a broad sweep first — `env | grep -iE 'KEY|TOKEN|SECRET|PASSWORD|_HOST|_USER|DATABASE'`
     (or the OS equivalent) — to see everything QC_Agent_Tool's project-secrets feature may have
     already provided for this project, whatever shape it's in.
   - Match loosely and by what the task actually needs, not one fixed name. A DB credential can
     arrive as separate pieces (`DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_PORT`) instead of
     one `DATABASE_URL` — build the connection from the pieces yourself. A third-party platform
     credential's exact variable name is project-specific and impossible to guess in general — if
     the sweep above doesn't obviously match what this check needs, check the repo's own
     `.env.example`/config-loading code for the actual name(s) it reads, so you're looking for the
     right thing instead of giving up on a near-miss.
   - Only move on to step 1 once you've actually checked and genuinely found nothing usable for
     THIS specific blocker.
1. **Name the exact blocker, in your own words, for what it actually is.** Not "couldn't verify" —
   say precisely what's missing. Don't force it into one of the illustrative examples above if it
   doesn't quite fit; describe the real thing, even if it's a kind of blocker nothing in this
   document anticipated.
2. **Ask the user immediately, in this same turn, before doing anything else** — with
   `AskUserQuestion` if available, or plainly in chat otherwise. Do not defer this to later in the
   run, keep working around it, or save it up to mention for the first time in the final report —
   the report documents what was already decided here, it is not where a blocker gets raised for
   the first time. Give them real choices instead of deciding for them:
   - **Provide / resolve** — they hand you the credential, point you at a raw sample file, or fix
     whatever's blocking access. The right default suggestion when it looks like a quick unblock.
   - **Skip this check** — they explicitly accept the gap. Record it as skipped-by-request, never
     as a finding dressed up with more confidence than it earned.
   - **Generate synthetic/fake data and verify against that instead** — build a small, clearly
     fake fixture (sample raw rows, a disposable local SQLite/in-memory DB, a mocked API response)
     that exercises the SAME code path, and run the check against that. **The disposable fixture,
     never the project's real database** — see the read-only rule above; this option exists
     precisely so a write-shaped check never has to touch the real DB. This is the sensible default
     when the user isn't available to answer, or explicitly says to just proceed.
3. **Never silently downgrade a verifiable claim to `reasoning_only`, and never silently drop the
   check.** One of the three outcomes above must actually happen, and the final report must say
   which, plainly — e.g. "DB access blocked (`DATABASE_URL` not set) — user asked me to skip this
   check" or "no raw sample provided — verified against a synthetic fixture instead of the real
   pipeline, results below are about the code path, not prod data." This applies equally to a
   blocker type nothing in this document named in advance — "I didn't recognize this as the kind
   of thing worth escalating" is not a valid reason for a gap to go unmentioned.

**Before finalizing any report**, re-scan every item in this run's priority-order list that you did
not fully verify by actually running something. For each one, confirm it went through steps 1–3
above — named, asked, and recorded. A report that ships with a verification gap nobody was ever
told about is incomplete work, not a finished QC pass; go back and escalate it now rather than
shipping the report with the silent gap.

## Reporting synthetic-data verification honestly

A check run against synthetic/fake data is still real, reproducible evidence about the *code
path* — keep its `evidence.kind` as a genuine kind (e.g. `data_check_failure`), not
`reasoning_only`. But the finding's `why` (or `verification.reason`) must say, in plain words,
that it ran against synthetic data rather than the real DB/raw source, so nobody downstream reads
it as a prod-verified result. Don't inflate `confidence` past what a synthetic run actually
supports — a synthetic fixture proves the code handles that shape of input correctly; it does not
prove the real pipeline's raw data actually looks like that.

## Where this plugs into the existing rules

`evidence-and-judge.md`'s capping rules are unchanged by this document — a genuine
`reasoning_only` claim (one you truly could not run, and could not escalate either — the human is
unreachable mid-task and no synthetic fallback is feasible for that specific claim) still caps to
`info`, exactly as before. What this document changes is the bar for *reaching* `reasoning_only`
in the first place: it is now the **last** resort after "run it for real" and "escalate to the
user" have both been tried, not the default whenever running something would take an extra step.

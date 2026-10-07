# Specialist runner — how any flow gets a category reviewed

Every flow that needs a category reviewed (`backend`, `frontend_static`, `frontend_live`,
`security`, `data`) calls this procedure instead of reading a prompt directly. This is the one
place that knows how to turn "review category X on this scope" into an actual specialist call —
add or remove a specialist by editing `references/registry.json`, never by editing a flow doc or
this file.

## Input

- **category** — one of the keys under `registry.json`'s `specialists` (e.g. `"backend"`).
- **scope** — the file list/diff this call is for (from the calling flow: diff's changed files,
  or the one file being audited, or the PR's diff).
- **context** — whatever the calling flow already has: base ref, changed-files list, PR metadata.
  Same shape as the old `context.json` a real-engine run would build; here it's just values you
  already hold, not a file you have to write out.

## Steps

### 1. Read the registry entry
Read `references/registry.json`, look up `specialists.<category>`. If the category has a
`condition` (e.g. `frontend_live`), evaluate it first — if the condition fails, skip this
category entirely, log why, and stop here (do not fall through to `primary`).

### 2. Try `primary`, then `secondary`, then `fallback`, in that order — never jump straight to
### fallback because primary "won't work here"; that's still a reason to try `secondary` first
For each candidate in turn, check **two separate things, in this order** — a candidate can fail
either one, and either failure means the same thing: move to the next candidate, don't stop
early. This two-part split (A.1 presence, A.2 invokability) applies to **every `type: "plugin"`
candidate you ever add to `registry.json`, not just the ones already in it** — "active in
`/plugin list`" and "the agent can actually call it" are two different facts, and conflating them
is exactly the mistake that let `code-review@claude-plugins-official` sit in this registry for a
while looking usable while never actually running (see below). Never skip straight to A.2 without
A.1, and never treat A.1 passing as license to skip A.2.

#### A.1 — Presence check
- `type: "plugin"` → is that plugin active in this session (`/plugin list`, or equivalent
  knowledge of installed/enabled plugins)?
- `type: "mcp"` → is a tool from that MCP server present in your current tool list (search by
  the server name, e.g. any `mcp__playwright__*` tool)?
- `type: "cli"` → is the standalone command on PATH (`which <ref>` / `<ref> --version` via Bash)?
  This is for a candidate that's a real external command-line tool, not something a plugin/MCP
  exposes to you as a callable tool at all (confirmed real case: `semgrep` — the
  `semgrep@semgrep-marketplace` *plugin*'s own MCP tools turned out to be dashboard-query-only
  with no ad-hoc-scan path, so the actual specialist is the separately-installed `semgrep` CLI,
  invoked directly via Bash, not through the plugin). Don't confuse this with `type: "plugin"` —
  a plugin being active tells you nothing about whether an unrelated standalone binary is on
  PATH, and vice versa.
- `type: "prompt"` → always present (it's a file in this package) — never needs this check.

**Before concluding "not present" for a `plugin`/`mcp` candidate, check whether this host
exposes any lookup/search mechanism for tools that aren't loaded into context yet** (this
session's own harness, for one, gates many tools — including plugin-provided ones — behind an
explicit lookup before they're callable; a tool absent from what you can currently see is not
the same fact as "not installed"). If such a mechanism exists here, try it with the candidate's
name/keywords first and re-check. Only once that comes back empty too does "not present" hold —
landing on "not installed" (and heading straight for a fallback prompt) without trying the
lookup first, when the real cause was "just not loaded into this turn yet," is exactly the kind
of silent, avoidable gap this document exists to prevent.

#### A.2 — Invokability check (mandatory for every `type: "plugin"` candidate, even after A.1 passes)
`/plugin list` showing "active" only proves the plugin is *installed*, never that the agent can
*call* it. For a `type: "plugin"` candidate, actually confirm **at least one** of these exists,
by checking this session's real, current lists (not by assuming from the plugin's README):
1. A **Skill** (from that plugin's `skills/` directory) that shows up in the skills you can
   invoke via the `Skill` tool.
2. A **Subagent** (from that plugin's `agents/` directory) that shows up in the subagents you can
   invoke via the Agent/Task tool.

If neither exists and the plugin only has `commands/` (slash commands) — this is **structurally,
permanently unusable, regardless of scope/diff/condition**, not a per-call circumstance like the
other failure shapes below. Claude Code's own documentation draws this line explicitly: **"command
files cannot be invoked by agents, while skills can be."** A human would have to type the slash
command themselves; you (the agent) have no path to trigger it. Confirmed real example:
`code-review@claude-plugins-official` (version `ad30d62cd52a`) is commands-only — see
`adapters/code-review-plugin.md`. Once confirmed for a given plugin version, don't burn a
retry/install attempt on it — move straight to the next candidate and say so plainly. Re-check is
cheap the next time that plugin's installed version changes; it is not worth retrying within the
same run.

**Before concluding "commands-only, permanently unusable" from a failed subagent check
specifically** — this has a known, real failure mode that looks identical from the outside but
has a different fix: open that plugin's `plugin.json` in its cache directory and check whether it
declares an explicit `agents` (or `skills`) list. Claude Code auto-discovers `agents/*.md`/
`skills/*.md` by default, but an explicit declared list in `plugin.json` overrides that
auto-discovery — if the list is incomplete or stale relative to what's actually on disk, real
agent/skill files can sit unused in the plugin's own directory while never appearing as callable.
This is a *masking* problem, not a *commands-only* problem, even though both currently produce
the same outcome ("nothing callable found this session") — record the real reason once you've
looked (`"code-review: no skills/agents exposed (commands-only)"` vs. `"<plugin>: agents/ exists
on disk but plugin.json's declared agents list doesn't include them — masked, not absent"`), since
a masking bug can get fixed in a point release without the plugin ever adding new files, while a
genuinely commands-only plugin needs an actual `skills/`/`agents/` addition to ever change.

#### Other per-call invokability failure shapes (assume A.2 already passed — invocation is possible in principle)
Three more concrete failure shapes show up in practice on top of the commands-only case above, and
count as "not invokable" exactly like "not installed" — **do not let any of them silently become
"so I'll just use the fallback prompt"**:

- **Shape-mismatched**: the tool genuinely can be invoked (skill/MCP entry exists) but is
  diff-shaped (designed to review a PR/diff) and this call has no diff to give it — e.g. a
  whole-repo audit with no git history at all, not even a synthesizable one. This is a different,
  narrower case than the commands-only one above — it assumes invocation is otherwise possible.
- **Event-triggered, no on-demand entry point**: the tool's relevant layer only fires on an
  external event (a Stop-hook at the end of an edit chain, an agentic review at commit time)
  and this flow never produces that event (a read-only audit edits and commits nothing). Only
  the parts of that tool that genuinely have an on-demand call (e.g. `security-guidance`'s free
  pattern-check layer, which runs per-edit/immediately) count as invokable here — the rest of
  that same plugin does not, even though the plugin as a whole shows "active."
- **Runtime dependency/launch failure**: the plugin/MCP shows "active"/"present" in the
  registry-level presence check, but an actual call fails because something it needs at launch
  time isn't there — a CLI binary the MCP server would need to shell out to but that isn't
  installed on this host (confirmed real case: `semgrep@semgrep-marketplace`'s own MCP tools are
  dashboard-query-only and the local `semgrep` CLI isn't installed — see
  `adapters/semgrep-mcp.md`, and don't reuse the disproven claim that a `/setup-semgrep-plugin`
  skill installs it; no such skill exists in this plugin), or, for a browser-automation MCP
  server, a browser process that fails to launch/attach for a reason unrelated to whether the
  *target app* is reachable (Playwright MCP: a locked persistent profile from a concurrent/
  leftover instance in the same workspace, or a headed-by-default browser with no display to
  attach to in this process's context — see `adapters/playwright-mcp.md` for both, sourced from
  its own README, not guessed; **also confirmed real**: the very first connection attempt right
  after registering it can exceed the default ~30s connect timeout even with a correct config —
  waiting a moment and re-checking once resolved this without changing anything, so a single
  fresh-registration timeout isn't yet proof the config is wrong). **Presence in a tool/plugin
  list is not proof of function — for anything that launches a process or opens a real
  connection (Playwright, and any future MCP in this shape), do one cheap sanity call first**
  (e.g. Playwright: `browser_navigate` to `about:blank` or the target URL) before trusting it and
  running the real scenario. A failed sanity call → try the install/setup step once, retry, and
  only then treat as unusable — but **which install attempt depends on whether this is a fresh
  install or an existing, stale registration**:
  - If the candidate was just installed this run (Step "auto-install" below just ran) — a
    retry after that install already covers this; nothing extra to do.
  - If the candidate was **already present before this run even started** (registered in an
    earlier session, not by anything this run just did) and the sanity call still fails, the
    registry's install command may have been updated since that earlier registration happened
    (e.g. `registry.json` now adds `--isolated --headless`, but the server was added long ago
    without them) — simply re-running the same install command will typically error "already
    exists" rather than apply the new configuration. In that case: **remove the existing
    registration first** (`type: "mcp"` → its removal command, e.g. `claude mcp remove
    <name>`; `type: "plugin"` → its uninstall command), then run the registry's install command
    fresh, then retry the sanity call once. Do this reconfigure attempt **at most once per
    candidate per run** — if the sanity call still fails after a clean remove-and-reinstall,
    stop there and treat it as genuinely unusable rather than looping.
    - **For `type: "mcp"` specifically, be honest about what this reconfigure can actually fix
      *within this same run*.** Per Claude Code's own MCP transport behavior: an HTTP-transport
      server only attempts to connect once, at session start — a `claude mcp remove`/`add` done
      mid-session does not make Claude Code open a new connection for the *current* session, only
      for the next one. A stdio-transport server is spawned once per session at init and reused;
      remove-and-reinstall mid-session similarly does not force an immediate respawn inside the
      current session. So do the remove-and-reinstall anyway (it's cheap, and it's exactly what
      fixes the *next* session) but don't expect the retried sanity call to succeed *because of*
      the reconfigure itself within this run — if it does succeed, that's most likely because the
      underlying issue was transient (e.g. the fresh-registration-timeout case two paragraphs up),
      not because the remove-and-reinstall forced a live reconnect. If it still fails, that's the
      expected outcome, not a sign you reconfigured wrong — log it as "reconfigured for next
      session, still unusable this run" rather than implying the fix should have taken effect
      immediately.
  Log which of these happened (fresh install, or remove-and-reinstall) in the eventual
  specialist-source line (Step 7) — "present but stale, reconfigured this run" is a materially
  different fact from "newly installed" or "already working," and collapsing them loses exactly
  the information a future run needs to know whether the fix actually took effect.

All four failure shapes (commands-only/A.2, plus these three) are **candidate-specific, not
skill-wide** facts — even the commands-only one, despite being permanent for *that candidate*,
doesn't affect any other candidate in the chain: it does not excuse skipping `secondary`/
`fallback` when the category has one, it just means *this* candidate is a bust (permanently, in
that one case; only for this call, in the other three), log precisely why (not a generic
"couldn't use it"), and move on. (`frontend_live` is the one category with no `secondary`/
`fallback` at all — see `registry.json`'s `condition` and `adapters/playwright-mcp.md` — so for it
specifically, any of these four failures means the category is **skipped**, with the specific
failure named, not silently downgraded to something else.)

**If a `plugin`/`mcp` candidate is missing (not merely uninvokable-here — actually absent),
auto-install it before giving up on it** — this skill is expected to self-provision, not just
report a gap and move on:

1. Look up the candidate's `ref` under `registry.json`'s top-level `install` map to get its exact
   install command sequence. Two special line forms show up there, alongside plain shell/plugin
   commands:
   - A line starting with `#` is a **note for you to read**, not a command — it flags something
     unverified or a manual fallback (e.g. no documented scriptable marketplace-add slug exists
     for this plugin). Read it, don't try to execute it.
   - A line starting with `skill:` names a **Claude Code skill to invoke via the Skill tool**
     (e.g. `skill:some-plugin:its-setup-skill`), not a shell command or a `/plugin`/`mcp` command
     — some plugins need a setup skill run once after install to pull in a dependency (a CLI
     binary, a browser). Invoke it as a skill; don't try to `eval`/shell it, and don't skip it —
     a plugin whose setup skill never ran may show "active" in `/plugin list` while still failing
     at actual call time (present, but non-functional) because the dependency it needs was never
     installed. **Verify the skill actually exists in this plugin's own skill list before relying
     on this** — a README for a same-named-but-different product describing a setup skill is not
     the same as that skill existing in the plugin you actually installed (confirmed real case:
     the semgrep/mcp OSS project's README describes `/setup-semgrep-plugin`; the
     `semgrep@semgrep-marketplace` plugin actually installed here has no such skill at all — see
     `adapters/semgrep-mcp.md`).
2. Run those commands yourself (they're marketplace-add + install, an `mcp add`, or the skill
   invocation just described — not a system package manager, not `sudo`, nothing destructive).
3. Re-check presence per the rules above.
4. Still missing after a real install attempt (network blocked, marketplace unreachable, command
   errored) → this candidate is unusable this run. Log the exact error and move to the next
   candidate. Don't retry the same install more than once per run.

**Whichever way a candidate is ruled out — absent-after-install-attempt, or present-but-
uninvokable-for-this-call — you MUST actually attempt the next candidate in the primary →
secondary → fallback order before landing on fallback.** "I already know `secondary` probably
won't apply either" is not a substitute for trying it (or, for a `prompt`-type `secondary`/
`fallback`, simply confirming it's the one now in use — prompts are always present, so there's
nothing to "attempt" beyond reading the file). The one thing you may never do is go from "primary
didn't work" straight to "here's the fallback prompt's findings" without a `secondary` line
existing in between, whenever the category actually has a `secondary` in `registry.json`.

If **every** candidate for a category is exhausted (no `primary`, tried `secondary`, tried
`fallback`, none usable) — the category is **skipped**, stated plainly in the report as "category
X is skipped — no specialist available (tried: primary, secondary, fallback)". Never silently
substitute unsourced reasoning for a category with no usable specialist.

### 3. Call the specialist
- **`type: "prompt"`** → read the referenced prompt file in full, follow it exactly as
  `review-flow.md`/`audit-flow.md` describe (play the role yourself, Read/Grep/Bash).
- **`type: "plugin"` or `type: "mcp"`** → invoke it the way it's actually designed to be invoked
  (its own slash command, or its own MCP tool call) against the scope you were given — do not
  paraphrase the scope into something else. If the plugin is diff-shaped (reviews a PR/diff), call
  it on the actual diff; don't feed it a description of the diff instead.
- **`type: "cli"`** → run it directly via Bash, on the actual scope (a real file path/directory —
  read `adapters/<tool>.md` for the exact command and flags; for `semgrep`:
  `semgrep --config auto <path> --json`), and read the real stdout/exit code. This is not a
  reasoning step and not a tool-call — it's an actual subprocess execution, same evidentiary
  weight as any other "run it for real" step in `verification-protocol.md`.

**Only a candidate actually named in `registry.json` for this category counts as calling the
specialist.** If you know of, or happen to have installed, some other tool that checks similar
things but isn't the category's registered `primary`/`secondary`/`fallback` (a separately
installed UX/audit plugin not listed anywhere in `registry.json`, for instance) — using it is not
calling the specialist for this category, no matter how relevant its output looks. You may cite
its output as *extra, separately-labeled corroborating evidence* alongside a real finding, but it
never substitutes for actually running the registered chain, and it never earns a spot on the
"Specialist source" line as if it were this category's specialist.

**Reusing a prior run's output instead of calling the specialist fresh, right now, is the
exception, not the default — and it needs its own explicit justification, every time:**
1. Default to calling the registered specialist fresh for this run. Reuse only when you have a
   concrete, stated reason not to (e.g. the exact same specialist already ran, very recently, on
   this exact scope).
2. Before reusing anything, confirm the specialist you'd be reusing output from is actually the
   one registered for this category — reusing a different, unregistered tool's output is covered
   by the rule above (it's not a valid substitute at all, reuse or not).
3. Verify the underlying scope hasn't changed since that prior output was produced — compare file
   modification times/hashes (or git history, when available) between the prior run's targets and
   now. If anything in scope changed, the prior output is stale — call it fresh, don't reuse it.
4. State the reuse plainly wherever this category's result appears in the report: which prior run,
   its date, what was checked to confirm nothing changed since. A reused result that isn't labeled
   as reused reads as if it happened this run, which it didn't.

### 4. Normalize the output — Step A, always, cheap
Read `adapters/<tool>.md` for the candidate that actually ran, and map its raw output into a
`finding` object per `schemas/findings.schema.json` (`id` can stay unset until the calling flow's
finalize step — `agent`, `severity`, `category`, `file`, `title`, `why`, `evidence` must all be
filled). If the tool's output doesn't itself carry a valid `evidence.kind`, set
`evidence.kind: "reasoning_only"`.

### 5. Cap by evidence — Step B, only heavy when it needs to be
Look up the finding's `evidence.kind` in the decision table below. This decides whether you need
to run the full `verification-protocol.md` cycle, or just a one-line cross-check.

| `evidence.kind` | Already self-proven? | What to do |
|---|---|---|
| `static_analysis_hit` (semgrep CLI rule match, `security-guidance` pattern-check layer) | Yes | One-line cross-check only: does the cited rule id/pattern actually appear in the real output you just saw? If yes, leave severity as assessed — do **not** re-run all of `verification-protocol.md`. |
| `failing_test`, but the specialist-runner (you) personally watched the failing output | Yes | Same one-line cross-check — confirm the output you saw really shows a failure. |
| `failing_test`, but you only have the plugin's word that it "ran and failed" (no output you personally saw) | **No** | Treat as unproven — do not accept the plugin's claim. Either re-run the test yourself and watch it, or fall to `reasoning_only` and run full `verification-protocol.md`. |
| `runtime_trace` (Playwright MCP, artifact saved) | Yes | One-line cross-check: does the cited artifact (screenshot/log path) actually exist and is it non-empty? |
| `reasoning_only`, or any agent's verbal claim not backed by output you watched (`code-review` plugin's 5 sub-agents, `security-guidance`'s Stop-hook/agentic layers) | No | Full `verification-protocol.md` cycle — actually attempt to reproduce it yourself before capping. Never skip this because the source plugin is "reputable." |
| Fallback prompt (`prompts/backend.md`/`frontend.md`/`security.md`/`data.md`) | Depends on what you actually did | Same rule as v1 — you decide per finding during review, exactly as `verification-protocol.md` already describes. |

**Rule of thumb**: a finding is self-proven only when its evidence is a deterministic, machine-
observed fact (a rule id you saw match, a test failure you watched, a trace file you confirmed
exists) — not because a plugin or agent, however well-regarded, said so in words.

### 6. Return
Hand back an array of raw findings (no `id` finalized, not yet judged) in the same shape
`review-flow.md`'s step 4 already produces — the rest of the pipeline (finalize → evidence/scope
cap → judge → report, per `evidence-and-judge.md`) doesn't need to know which specialist produced
them.

### 7. Record the source
Whatever candidate actually ran (primary/secondary/fallback, and which tool) gets logged for the
report's "Specialist source" line (see `html-report.md`) — e.g. `"Security: security-guidance
plugin + semgrep CLI via Bash"` or `"Security: fallback — hand-written prompt because the plugin
isn't installed (install error: <reason>)"`.

**Whenever the candidate that ran is not `primary`, this line must also name every candidate
tried before it and why each one was ruled out** — not just the one that ended up running. This
is what makes it visible, in the report itself, that `secondary` genuinely got tried rather than
silently skipped: e.g. `"Security: fallback — hand-written prompt. Tried: security-guidance
(installed, but its agentic-review layer only triggers on commit, and this audit makes no
commits so it never fired), semgrep (MCP tool not present in this session, install error:
<reason>)"`. A source line that names
only the specialist that ran, with no trace of what happened to the ones tried before it, is
incomplete — go back and record it before publishing the report.

## Worked example — category `security`

**Case A — `security-guidance` plugin already installed and active this session:**
1. Registry: `primary = plugin security-guidance@claude-plugins-official`.
2. Presence check → active. No install needed.
3. Call it on the scope (the diff, or the file being audited).
4. Its pattern-check layer flags a hardcoded secret → `evidence.kind: "static_analysis_hit"`,
   `evidence.command` = the pattern that matched. Its agentic-review layer separately flags a
   possible auth bypass with a written explanation, no command run → `evidence.kind:
   "reasoning_only"`.
5. Pattern-check finding → one-line cross-check (pattern really in the output? yes) → keep
   severity. Auth-bypass finding → full `verification-protocol.md` (try to actually reproduce the
   bypass, or escalate if blocked) before capping.
6. Return both, normalized.
7. Report line: `"Security: security-guidance plugin"`.

**Case B — plugin not installed, not active:**
1. Registry: `primary = plugin security-guidance@claude-plugins-official`.
2. Presence check → not active.
3. Auto-install: run `registry.json`'s `install["security-guidance@claude-plugins-official"]`
   commands. Re-check → now active → proceed as Case A, report line notes it was auto-installed
   this run: `"Security: security-guidance plugin (auto-installed this run)"`.
   - If install itself fails (e.g. marketplace unreachable): try `secondary` (the `semgrep` CLI,
     `type: "cli"`) the same way (`which semgrep` → `pip install semgrep` if missing → re-check →
     use it). If that also fails, fall to `fallback` (`prompts/security.md`), and the report line
     reads `"Security: fallback — hand-written prompt (security-guidance install failed, semgrep
     CLI install also failed: <reason>)"`.

**Case C — plugin installed and active, but not invokable for THIS call (real scenario: a
whole-repo audit with no git history at all):**
1. Registry: `primary = plugin security-guidance@claude-plugins-official`.
2. Presence check → active (confirmed via `claude plugin list`). No install needed.
3. Try to actually call it on this audit's scope. Its free pattern-check layer *is* invokable
   on-demand → call it, use whatever it flags. Its Stop-hook and agentic-commit-review layers are
   **not** — this flow edits nothing and commits nothing, so neither event ever fires. That's
   "present but uninvokable for this call," not "primary succeeded."
4. Because part of `primary` (the two event-triggered layers) is ruled out for this call, you
   still **must** try `secondary` (`type: "cli"`, `ref: "semgrep"`) before considering `fallback`
   — never skip a `secondary` that exists just because `primary` partially worked. **Confirmed by
   real evidence (not guessed): `secondary` is the standalone `semgrep` CLI, not the
   `semgrep@semgrep-marketplace` plugin's MCP tools** — those turned out to be dashboard-
   query-only (`get_semgrep_sast_findings`/`secrets`/`supply_chain` read a prior scan already
   recorded for a *registered* project on the Semgrep AppSec Platform, none run a scan on demand;
   an unregistered local repo gets "no projects found in deployment" from all of them — not a
   readiness signal, just the expected shape of those specific tools). Presence check for `cli`
   is `which semgrep`; if missing, auto-install (`pip install semgrep`, then confirm it's on
   PATH — see `registry.json`'s `install.semgrep`), then call it directly via Bash
   (`semgrep --config auto <path> --json`).
5. Report line names all three: `"Security: security-guidance plugin (pattern-check layer only —
   Stop-hook/agentic layers need an edit/commit event this audit never produces) + semgrep CLI
   via Bash (auto-installed this run)"` — or, if the CLI install itself fails, `"...+ fallback:
   prompts/security.md (semgrep CLI install failed: <reason>)"`.

**Case D — a relevant-looking tool exists, but it isn't this category's registered specialist
(e.g. a separately installed UX-audit plugin, or yesterday's saved report from one):**
Don't use it in place of calling `frontend_live` (Playwright MCP, per `registry.json`). If a
current dev-server/preview URL is reachable, call `frontend_live` fresh, per the registered chain,
exactly like any other category. That unrelated plugin's past output may be cited as extra
corroborating context, clearly labeled as coming from a tool outside this registry — never as
this category's "Specialist source" line, and never as a reason to skip calling `frontend_live`.

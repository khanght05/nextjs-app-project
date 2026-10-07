# Adapter: Playwright MCP

**Default config is stdio again as of v2.3a** (`claude mcp add playwright -s user -- playwright-mcp
--headless --isolated`, calling the globally-installed binary directly, no `npx`) — see
`registry.json`'s `install.playwright`. v2.1-v2.3 had switched to a standalone HTTP server after a
real audit run hit the timeout described below 3/3 times; that form re-tested clean 2/2 times under
concurrent load, but requires a persistent background process running at all times, which the user
explicitly rejected ("không muốn chạy 1 server nền lâu dài"). See "Layer 2, cause 3" below for the
full, sourced reasoning behind reverting to stdio. If you find `playwright` registered as the
standalone HTTP form instead (`claude mcp add --transport http playwright http://localhost:8931/mcp
...`), that's the older v2.1-v2.3 default — still a valid, more-reliable-under-load choice if the
user wants to trade "no standing server" away for it, but no longer this registry's default; only
reconfigure to it if asked.

**Two separate "reachable" layers — don't conflate them:** (1) does the app being audited have a
live dev-server/preview URL, and (2) does the Playwright MCP server itself (the process running
the browser) connect/launch. A real case was observed: the app was reachable (curl returned 200)
but the MCP server still "failed to connect" — that's (2) failing independently of (1); check it
separately, don't infer it from (1) passing. `registry.json`'s `frontend_live.condition` now
covers both **and** says to actually try starting the app yourself for (1) before concluding it's
unreachable (see "Special cases" below) — don't stop at a single passive check.

## How to call it
**Before trusting `primary` as usable, run one cheap connectivity sanity check first** — call
`browser_navigate` to `about:blank` (or directly to the URL being audited). If this call
errors/times out, that's "present but uninvokable for this call" (the same failure class as Case
C in `specialist-runner.md`, just a different symptom: connection/launch failure instead of
shape-mismatch or event-triggered), **not** "app not reachable" — see the two real, known causes
below. **Note: a first connection attempt right after freshly registering the server can exceed
the default ~30s connect timeout even with a correct config** — confirmed real: waiting a moment
and re-checking resolved it without changing anything. A single fresh-registration timeout isn't
by itself proof the config is wrong.

Only once this cheap check passes, use Playwright MCP's real tools (names confirmed from the
official README, not guessed — Claude Code namespaces them under `mcp__playwright__` by its own
general convention; the base names are below):
- `browser_navigate` — navigate to the route under review.
- `browser_snapshot` — **prefer this for reading page structure / finding a target for
  click-fill-type actions**, it's an accessibility snapshot; the official docs say plainly "this
  is better than screenshot" for driving actions — don't use `browser_take_screenshot` to locate
  interactive elements.
- `browser_click` / `browser_type` / `browser_fill_form` / `browser_select_option` /
  `browser_hover` / `browser_press_key` — reproduce real user actions (form submit, focus
  management, ...).
- `browser_wait_for` — wait for a state (loading/error/empty) to appear/disappear before judging
  whether that state is correct.
- `browser_console_messages` — capture real console log output as evidence.
- `browser_take_screenshot` — save a visual piece of evidence (different purpose from
  `browser_snapshot` above — this one is for saving evidence, not for locating elements).
- `browser_network_requests` / `browser_network_request` — when you need evidence about a specific
  request (status code, payload) rather than just reading the UI.

**Never use `browser_run_code_unsafe`** — the official docs themselves call it "RCE-equivalent,"
running arbitrary JS inside the Playwright server process; it's outside the scope of a QC review
that reads/observes, not a tool for reproducing user scenarios.

Reproduce the exact scenario being audited/reviewed: loading/error/empty state, focus management,
form submit, a specific user flow tied to the file/route under review. Always save an artifact
(`browser_take_screenshot` and/or `browser_console_messages` written to a file) for every
important verification step.

## What the raw output looks like
The result of a real action (navigation succeeded/failed, DOM content read, console log, a
screenshot/log file saved to disk) — not a verbal assessment, actual observed runtime behavior.

## Mapping to a finding object
| `finding.schema.json` field | Where it comes from in the raw output |
|---|---|
| `agent` | `"frontend"` (or `"ux"` if the category under review is UX-adjacent) |
| `category` | `"ux"` or `"a11y"` depending on the issue observed (focus, contrast, missing state) |
| `file` | the file/route/component matching the scenario just reproduced |
| `evidence.kind` | always `"runtime_trace"` |
| `evidence.artifact` | the path to the saved screenshot/log |
| `why` | a description of exactly what was observed on the real page (don't infer beyond what was actually seen) |

## Special cases / known limits of this tool
- **`frontend_live` has no `secondary`/`fallback` in `registry.json`** — only `primary`. So when
  it's unusable (for reason (1) or (2) above), the outcome is always **skip**, not falling down to
  another tool — this matches the design (`audit-flow.md`'s static-proxy pass through
  `frontend_static` is a separate, additive pass, not this category's official "fallback"). The
  skip reason **must say which layer failed**: `"skipped: no reachable running instance"` (the app
  itself is down — layer 1) is a different fact from `"skipped: Playwright MCP server failed to
  connect (app itself was reachable)"` (layer 2) — collapsing the two into one generic reason
  loses information needed to debug it.
- **Layer 2 (the MCP server itself failing to connect) has 2 real, confirmed causes, sourced from
  `@playwright/mcp`'s official README** (not guessed):
  1. **The profile is locked by another instance running in the same workspace.** Playwright MCP
     defaults to a persistent, per-workspace profile
     (`~/.../mcp-{channel}-{workspace-hash}`), and the README states plainly: "A persistent
     profile can only be used by one browser instance at a time, so concurrent MCP clients sharing
     the same workspace will conflict." Very likely if the session has started/stopped the dev
     server multiple times, or called Playwright from another session in the same workspace.
     **Fix**: add the `--isolated` flag (an in-memory profile, no conflicts) — already applied as
     the default in `registry.json`'s `install.playwright`.
  2. **Headed by default (a visible browser UI), not headless** — README: "run browser in headless
     mode, headed by default." If the MCP server process runs in a context with no real display to
     attach to (a worker process, a sandboxed/agent environment with no desktop session), the
     launch will fail — the README has an entire "Standalone MCP server" section about exactly
     this case. **Fix**: add the `--headless` flag — also already applied as the default in
     `registry.json`. Screenshots (`browser_take_screenshot`)/snapshots still work normally in
     headless mode, no loss of evidence-gathering ability.
  3. **`npx @playwright/mcp@latest` costs real, measured startup overhead on every single spawn —
     stacks with system load until it exceeds the connect timeout.** Confirmed by direct
     measurement (not guessed): `npx @playwright/mcp@latest --version` took ~5s **steady-state**
     (cached, not a first-run cold start) just for `npx`'s own registry/resolution overhead, before
     the actual server process even starts doing Node + browser initialization. A real audit run
     hit exactly this: `claude mcp list` reported the server "Connected" moments before/after, but
     3 separate connection attempts *inside* that audit's own process — running alongside a
     concurrent semgrep scan and the dev server compiling — all timed out. This is a **different**
     cause from 1 and 2 above (profile-lock and headed-by-default) — those are config bugs with a
     flag-based fix; this was assumed at the time to be inherent per-call latency, which is what
     motivated the v2.1-v2.3 switch to a standalone HTTP server.
     **Revised understanding (2026-09-27), from researching Claude Code's own MCP transport docs
     instead of re-guessing:**
     - A stdio server is spawned **once per session at init and reused for the rest of that
       session** — it is not re-spawned per tool call. So the ~5s `npx` overhead is a one-time
       per-session cost, not something that compounds across multiple calls within one session.
       The "3 separate connection attempts" observed above is more likely explained by a separate,
       documented Claude Code bug (GitHub issue #85895: a stdio MCP server can spawn **twice** per
       launch — an unmanaged instance at t+0, then a managed instance at t+2s) landing awkwardly
       during that same window of concurrent system load, not by the client genuinely retrying a
       failed connection 3 times.
     - HTTP transport, by contrast, **only attempts to connect once at session start if the server
       is unreachable then — it never lazy-retries later even if the server comes up mid-session**
       (a documented, known limitation — GitHub issue #31198, closed as duplicate). This means the
       HTTP form *structurally requires* the standalone server to already be alive and healthy
       before every single session starts — a genuine standing background process the user (or
       something on their behalf) must remember to keep running. That is the exact cost the v2.1-
       v2.3 fix traded FOR reliability, and the exact cost the user explicitly rejected.
     - **Current fix (v2.3a): stay on stdio, but call the globally-installed `playwright-mcp`
       binary directly** (`npm install -g @playwright/mcp@latest` already provides it) **instead of
       `npx @playwright/mcp@latest`**, removing the dominant measured overhead without needing any
       standing process — Claude Code spawns and owns the process itself, per session, no
       out-of-band server to start/monitor/restart.
     - **Residual, accepted risk**: under heavy concurrent system load at the exact moment a
       session starts, this per-session spawn (browser + Node startup, `npx`-overhead now removed)
       could still occasionally miss the default connect timeout. This is a **per-session-start**
       risk, not a "server is down" failure — it can't be fully eliminated without reintroducing a
       standing server. If that risk is unacceptable for a given use case, the standalone HTTP form
       is still documented (commented, not auto-run) in `registry.json`'s `install.playwright` as
       an opt-in trade in the other direction.
     - **RE-TESTED 2026-09-27, real (not just described)**: reconfigured a live machine's
       `playwright` MCP registration from the old HTTP standalone form to this stdio form, then ran
       3 fresh `claude -p` sessions calling `mcp__playwright__browser_navigate`/
       `browser_take_screenshot` — 1 solo, then 2 concurrently with a real `semgrep --config auto`
       scan running alongside as extra load. **3/3 succeeded, no timeouts.** Confirms the `npx`
       overhead really was the dominant cause of the earlier 3/3 failures, not something inherent
       to stdio itself.
- **Layer 1 (the target app itself not reachable) gets a real fix attempt before it's a skip —
  don't just check and give up.** The same self-provisioning spirit `specialist-runner.md` applies
  to installing a missing specialist applies here to the *app*, not a tool: if the app isn't
  reachable, look at the target repo's own `package.json` for a `dev`/`start` script (or the
  equivalent convention for that stack), run it yourself detached/backgrounded (`nohup <cmd> >
  /tmp/...log 2>&1 & disown` on a Unix-like shell), then poll for reachability — **give it a real
  timeout, not an instant check**: a cold Turbopack/webpack start measured 30+ seconds in this
  project's own dev server during testing, so a single quick curl and giving up is not a genuine
  attempt. Only after that — no dev/start script exists, or it's still unreachable after ~60s of
  polling — does layer 1 actually count as failed; name the exact command tried and how long you
  waited in the skip reason, not just "no reachable running instance" bare. **Clean up after
  yourself**: if you started the server, stop that process once this flow's report is done — never
  leave an orphaned background dev server running past the QC run that needed it, and never stop a
  server that was already running before you got here (you didn't start it, it's not yours to
  stop, and the user or another process may depend on it staying up).
- **Only runs if there's a live dev-server/preview URL AND the MCP server itself connects** —
  missing either one *after the real attempt above*, the category gets skipped, with the reason
  stated (see above), **never** replaced by static reasoning that reads code and guesses at
  runtime behavior.
- Step B (capping) for `runtime_trace` only needs to check that the artifact exists and isn't
  empty — no need to run the whole `verification-protocol.md` cycle.
- Don't trigger a dialog/alert/confirm JS during the interaction — per the general
  claude-in-chrome/Playwright automation rule, to avoid hanging the session.

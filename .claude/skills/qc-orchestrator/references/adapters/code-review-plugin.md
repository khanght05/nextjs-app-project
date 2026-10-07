# Adapter: `code-review` plugin (`code-review@claude-plugins-official`) — REPLACED

## REPLACED — see `adapters/agent-skills-code-review.md`

No longer `backend`/`frontend_static`'s `primary` in `registry.json` (the entry was removed — see
`candidate-vetting.md` for the process that was run to pick its replacement). This file is **kept
as a historical record** — why the old candidate was dropped — not deleted, the same spirit as
keeping `qc-agent-v1.bak/` instead of deleting it outright.

## ⚠️ Confirmed fact (not a guess): this plugin is NOT agent-invokable

Verified against Claude Code's own official documentation (which draws a line between
`commands/` vs `skills/` in a plugin — "The key distinction is that command files cannot be
invoked by agents, while skills can be"): `code-review@claude-plugins-official` (version
`ad30d62cd52a`, the one checked) exposes a **slash command**
(`commands/code-review.md`, i.e. `/code-review`), has **no** `skills/` directory and no MCP tool.
A slash command only runs when **the user** types it themselves — the agent outputting the
literal string `/code-review` as text does nothing (the harness doesn't intercept/execute it),
and no tool (including the `Skill` tool) can call a `commands/` entry.

**Conclusion: this is not the "shape-mismatched" case (missing a diff) this adapter's earlier
version claimed — even with a real diff/PR available, the agent has no way to call this plugin at
all.** This is a structural limitation of the installed plugin itself, not of the current
scope/mode.

## How to call it (only relevant if a future version ships `skills/`)
**Before treating this as unusable, check once whether the installed plugin now has a `skills/`
directory** (e.g. `find ~/.claude/plugins/cache/claude-plugins-official/code-review -maxdepth 2
-type d`, or check `/plugin list`/the tool list for anything namespaced to this plugin). This is a
fact **per plugin version**, not fixed forever — Claude Code's own docs encourage plugin authors
to migrate `commands/` to `skills/`, so a later update could change this. Only once a real
`skills/` shows up, call it via `Skill(code-review:<skill-name> ...)` on the actual diff/PR being
reviewed (don't paraphrase the scope) — this plugin is designed to review a PR/diff, running 5
sub-agents in parallel: CLAUDE.md compliance, shallow bug scan, git blame/history, PR history,
code comments compliance.

**If it only has `commands/`, no `skills/`** (the confirmed state as of version `ad30d62cd52a`):
this candidate is unusable right away, no need to try calling anything — move to `fallback`
(`prompts/backend.md`/`prompts/frontend.md`) and record the reason plainly in the report:
`"code-review plugin: commands-only, no agent-invocable entry (skills/ or MCP tool) — not a
diff/PR limitation, a structural limitation of the installed plugin version"`. This is different
from the other 3 branches in `specialist-runner.md` (shape-mismatched/event-triggered/
runtime-dependency) — no retry, no re-running install/setup needed, since re-installing this
exact plugin (already `active`) won't create a new `skills/` directory.

## What the raw output looks like
A list of issues per sub-agent, each with: a description of the problem, the file/code region
involved, and a verbal confidence/severity level (not JSON with a fixed schema) — mostly verbal
assessments (read the code, then conclude), unless a sub-agent cites a specific command it
actually ran (e.g. running `git blame` and quoting the real output).

## Mapping to a finding object
| `finding.schema.json` field | Where it comes from in the raw output |
|---|---|
| `agent` | `"backend"` or `"frontend"` depending on the file named (by path/file type) |
| `category` | inferred from the issue's content — a logic bug → `correctness`; a convention/CLAUDE.md violation → `maintainability` |
| `severity` | provisionally set to the confidence level the plugin states, **will be capped in Step B** if the evidence is `reasoning_only` |
| `file` / `line` | taken directly from the code region the plugin points to |
| `title` / `why` | a summary of the sub-agent's issue, same meaning, rewritten to fit the "concrete failure scenario" shape |
| `evidence.kind` | `"reasoning_only"` by default — unless the sub-agent cites a specific command/test **with real, observed output attached**, in which case map to the matching kind (`failing_test`, ...) |
| `evidence.command` / `expected_signal` | only fill in if a real command is attached; otherwise leave blank and keep `reasoning_only` |

## Special cases / known limits of this tool (only relevant again if a `skills/` version appears)
- The plugin is designed for **diff/PR review**, not a whole-file audit. In `audit-flow.md`
  (reviewing a whole file, with no "before" state), calling the plugin on a "fake diff" = the
  entire current file content treated as newly added (if the plugin accepts file-shaped input),
  or — if the plugin strictly requires a real diff — skip this plugin for audit mode and use
  `fallback` (`prompts/backend.md`/`prompts/frontend.md`) directly, stating why in the report.
  **Note: for the current commands-only version, this section doesn't apply — the plugin is
  unusable from the start for agent-invocability reasons above, not because of a missing diff.**
- **Never trust a sub-agent's claim that it "ran X and it failed"** without real output attached —
  the specialist-runner must re-run that command itself to confirm before treating it as
  `failing_test` (see Step 5 of `specialist-runner.md`).

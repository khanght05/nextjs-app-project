# Adapter: Semgrep CLI (secondary for `security`; the `semgrep@semgrep-marketplace` plugin's own MCP tools are NOT this specialist — see below)

**Corrected a second time, based on real evidence (actually calling the tools, observing the real
error)** — the earlier version was based on the official README of the `semgrep/mcp` project
(open-source, installed via the `semgrep mcp` CLI subcommand) and **was wrong**, because the
plugin actually installed through the Claude Code marketplace
(`semgrep@semgrep-marketplace`, "Guardian") is **a different product** with a completely
different tool set than that README describes. This is exactly the lesson
`candidate-vetting.md` warns about: the official docs for "a same-named product" don't
necessarily describe the specific build actually installed — the real tools have to be called to
confirm.

## Confirmed facts (calling the real tools in a fresh `claude -p` process)
Real tool namespace: `mcp__plugin_semgrep_guardian__...`. 5 tools available:
`get_semgrep_sast_findings`, `get_semgrep_secrets_findings`, `get_semgrep_supply_chain_findings`,
`add_developer_semgrep_rule`, `list_developer_semgrep_rules`.

**None of these 5 tools run a new, ad-hoc scan on the file/scope you give it.** All 3
`get_..._findings` tools only **read back the result of a previous scan, already stored on the
Semgrep AppSec Platform (the cloud dashboard), for a registered project/deployment** — calling
`get_semgrep_sast_findings` on a local repo that was never registered/scanned genuinely returns:
`"no projects found in deployment \"<deployment name>\""`. The other 2 tools only manage custom
rules (add/remove), unrelated to scanning.

**The `/setup-semgrep-plugin` skill that the `semgrep/mcp` (open-source) project's README
mentions does NOT exist in this marketplace plugin.** The real skill list for
`semgrep@semgrep-marketplace` (version `2.4.0`, confirmed via a fresh `claude -p` session): only
`install-mfw`, `add-and-validate-guardian-developer-semgrep-rule`,
`remove-guardian-developer-semgrep-rule` — no skill installs the Semgrep CLI, and there's no way
through this plugin itself to install it.

## The `semgrep` CLI — installed separately, verified running for real (2026-09-25)
`pip install semgrep` (not through the plugin — installed directly, `semgrep 1.178.0`). The
binary lives at `%LOCALAPPDATA%\Python\pythoncore-3.14-64\Scripts\semgrep.exe` — **this directory
was added to the Windows user PATH** (`[Environment]::SetEnvironmentVariable("Path", ...,
"User")`, needs a fresh shell/process to pick up the new PATH; exported manually in the current
session to test immediately). Real smoke test:
`semgrep --config auto lib/store.js --json` → ran successfully, "Ran 200 rules on 1 file: 0
findings" (0 findings is a valid result for this 25-line file, not an error).

## The actual conclusion
The `security` category's `secondary` now has **2 separate paths — don't conflate them**:
1. **The plugin's MCP tools** (`get_semgrep_*_findings`, `add/list_developer_semgrep_rule`) —
   **still** only read a registered dashboard, **still can't** scan ad-hoc — this doesn't change
   just because the CLI is now installed, since the two are completely independent.
2. **The `semgrep` CLI via Bash** — **now installed and verified running for real on this
   machine** — this is the real on-demand path to use as `secondary`. The presence check for this
   candidate (reflected in `registry.json`'s type) is `which semgrep`/`semgrep --version`, not
   `/plugin list`.

One genuinely event-triggered layer remains unchanged: the plugin's hook layer (auto-scans code
the agent itself **generates/edits**, per the original README's "scans every file an agent
generates") — unrelated to auditing existing code; using the CLI directly is the path for that
case.

## How to call it
Confirm the CLI is present (`which semgrep` or `semgrep --version`) — **on the machine it's
already installed on, this now passes**, but another machine running this skill for the first
time still needs to install it (`pip install semgrep`, see `registry.json`'s `install`). Call it
directly via Bash on the actual scope:
```
semgrep --config auto <path> --json
```
This is the CLI-based path, **it does not go through any MCP tool at all** — record it in the
report as "semgrep CLI (Bash), not the plugin's MCP tools".

## What the raw output looks like
JSON with a list of findings: rule id, `message`, `path`, `start.line`/`end.line`, `severity`
(`ERROR`/`WARNING`/`INFO` — Semgrep's own scale, must be mapped to `blocking/major/minor/info`,
never copied as a literal string). Verified for real: the JSON parses, has a `results` key (an
array of findings, empty is a valid result), and the summary is printed to stderr (not JSON,
ignore it when parsing `--json` from stdout).

## Mapping to a finding object
| `finding.schema.json` field | Where it comes from in the raw output |
|---|---|
| `agent` | `"security"` |
| `category` | `"security"` |
| `file` | `path` |
| `line` | `start.line` |
| `severity` | `ERROR → major`, `WARNING → minor`, `INFO → info` (raise to `blocking` only if the rule relates to an already-known, severe vulnerability class) |
| `evidence.kind` | always `"static_analysis_hit"` |
| `evidence.command` | `semgrep --config auto <path>` (the real Bash command that actually ran) + the matched rule id |

## Special cases / known limits
- **Don't use `get_semgrep_*_findings` as a readiness check** — they're always "empty" for an
  unregistered repo, and that doesn't mean "needs retrying" or "misconfigured" — that's just the
  architectural nature of these 3 tools (dashboard-query, not a scanner).
- If the CLI isn't installed yet on the machine running this (`which semgrep` empty): install it
  (`pip install semgrep`, see `registry.json`'s `install`), then retry the presence check — this
  is ordinary auto-install, not a "permanently unusable" case like the old `code-review`.
- If it still can't be installed (no `pip`, no network): record the skip/fallback plainly for
  that reason, **never** substitute by calling one of the 5 dashboard MCP tools by mistake and
  treating an empty result as "scanned, clean" — that's a wrong conclusion (nothing was scanned
  at all, that's not the same as "clean").

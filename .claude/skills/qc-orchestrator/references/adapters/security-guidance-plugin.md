# Adapter: `security-guidance` plugin (`security-guidance@claude-plugins-official`)

## How to call it
The plugin has 3 layers, not one single command — call whichever layer actually fits the scope
being reviewed:
1. **Pattern check** — runs per-edit/free, no separate model call, triggers automatically when a
   file changes in this session (no manual call needed if the plugin is already hooked into the
   edit flow).
2. **Stop-hook diff review** — reviews the diff at the end of an edit chain; fires via the
   plugin's own hook (automatic) or its corresponding slash command if the plugin exposes one
   manually.
3. **Agentic commit review** — a deeper review at commit time, called via the plugin's slash
   command on the exact commit/diff being QC'd. Check `/plugin list`/`/help` for the exact command
   name if unsure — don't guess the syntax.

## What the raw output looks like
- Pattern-check layer: an immediate warning shaped like "rule/pattern X matched at file:line" —
  deterministic, a specific pattern actually matched.
- The other 2 layers (Stop-hook, agentic commit review): a verbal assessment from the model about
  security risk, sometimes with a suggested PoC but usually without actually running that PoC.

## Mapping to a finding object
| `finding.schema.json` field | Where it comes from in the raw output |
|---|---|
| `agent` | always `"security"` |
| `category` | `"security"` |
| `file` / `line` | the location the plugin names |
| `evidence.kind` | **pattern-check** layer → `"static_analysis_hit"`; **Stop-hook/agentic** layer → `"reasoning_only"` unless a real, observed PoC is attached |
| `evidence.command` | pattern-check layer → the exact pattern/rule id that matched; the other 2 layers → leave blank if there's no real command |
| `severity` | per the level the plugin states, capped in Step B if `reasoning_only` |

## Special cases / known limits of this tool
- The pattern-check layer runs free/immediately, so it may have already surfaced issues **before
  the specialist-runner was even called** this session — if so, collect the warnings it already
  raised rather than calling it again from scratch.
- Don't fold the 2 deeper layers (Stop-hook, agentic) into `static_analysis_hit` just because they
  "sound technical" — with no real, observed command/PoC, they're always `reasoning_only` and must
  go through the full `verification-protocol.md` cycle before capping severity.

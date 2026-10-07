#!/usr/bin/env bash
# Pre-flight check for the qc-orchestrator skill's specialist plugins/MCP tools.
# Usage: check_setup.sh [--install]
# Prints one PASS/FAIL line per specialist. With --install, attempts to
# install whatever is missing (per references/registry.json's "install"
# commands), then re-checks. Exit 1 if anything is still missing after that.
#
# This only covers the NEW specialist plugins/MCP tools (Phase v2.0). For
# the optional real qc-engine backend (qc CLI / qc.yaml), see
# references/optional-real-engine.md — that path is unrelated to this check.
set -u

# NOTE: `claude plugin list` / `claude mcp list` are this script's best-effort guess at the CLI
# surface for listing active plugins/MCP servers — verify against your installed Claude Code
# CLI's actual `claude plugin`/`claude mcp` subcommands and adjust if they've changed.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
registry="$here/references/registry.json"
do_install=0
[ "${1:-}" = "--install" ] && do_install=1
ok=1

# --- helpers ---------------------------------------------------------------

plugin_active() {
  # $1: plugin ref, e.g. "code-review@claude-plugins-official"
  claude plugin list 2>/dev/null | grep -qiF "$1"
}

mcp_tool_present() {
  # $1: MCP server name, e.g. "playwright"
  # CONFIRMED real bug fixed here: `claude mcp list` still lists a server that's registered but
  # NOT actually reachable right now (e.g. playwright's standalone HTTP server process died after
  # a reboot) with a "✘ Failed to connect" status — matching only on the NAME (the old version of
  # this check) reports a false PASS for a specialist that can't actually be called. Match the
  # server's own status line and require it says "connected", not just that the name appears
  # somewhere in the output.
  claude mcp list 2>/dev/null | grep -i "^$1:" | grep -qi "connected"
}

cli_present() {
  # $1: standalone CLI binary name, e.g. "semgrep" — confirmed installed separately from any
  # plugin (semgrep@semgrep-marketplace's own MCP tools are dashboard-query-only, no ad-hoc scan;
  # this is the real on-demand path, see references/adapters/semgrep-mcp.md)
  command -v "$1" >/dev/null 2>&1
}

run_install_commands() {
  # $1: registry key under .install (same string as plugin ref / mcp name)
  python3 - "$registry" "$1" <<'PY' 2>/dev/null
import json, sys
reg, key = sys.argv[1], sys.argv[2]
data = json.load(open(reg, encoding="utf-8"))
for cmd in data.get("install", {}).get(key, []):
    print(cmd)
PY
}

check_or_install() {
  # $1: label, $2: presence-check fn name, $3: presence arg, $4: registry install key
  local label="$2 $3" checker="$2" arg="$3" install_key="$4"
  if "$checker" "$arg"; then
    echo "PASS: $1 available"
    return 0
  fi
  if [ "$do_install" -eq 1 ]; then
    echo "INFO: $1 missing — attempting install"
    while IFS= read -r cmd; do
      [ -z "$cmd" ] && continue
      case "$cmd" in
        \#*)
          echo "  note: ${cmd#\#}"
          continue
          ;;
        skill:*)
          echo "  SKIP (this script can't invoke a Claude Code skill): run '${cmd#skill:}' yourself inside a Claude Code session, then re-run this check"
          continue
          ;;
      esac
      echo "  + $cmd"
      # CONFIRMED bug, fixed here: this used to be `eval "$cmd" >/dev/null 2>&1`, which discarded
      # the command's real stdout/stderr unconditionally — including genuine install errors (auth
      # failures, network errors, wrong flags), making it impossible to tell WHY an install failed
      # from this script's own output alone. Capture instead, and always show it when there's
      # something to show: silent only for the common case (success, no output).
      cmd_output=$(eval "$cmd" 2>&1)
      cmd_status=$?
      if [ "$cmd_status" -ne 0 ]; then
        echo "  FAILED (exit $cmd_status):"
        echo "$cmd_output" | sed 's/^/    /'
      elif [ -n "$cmd_output" ]; then
        echo "$cmd_output" | sed 's/^/    /'
      fi
    done < <(run_install_commands "$install_key")
    if "$checker" "$arg"; then
      echo "PASS: $1 available (installed this run)"
      return 0
    fi
  fi
  echo "FAIL: $1 not available — specialist-runner.md will fall back to the bundled prompt for this category (run with --install to auto-install, or install manually: see references/registry.json's install[\"$install_key\"])"
  ok=0
  return 1
}

# --- checks ------------------------------------------------------------------

if [ ! -f "$registry" ]; then
  echo "FAIL: references/registry.json not found at $registry"
  exit 1
fi

check_or_install "agent-skills plugin (code-review-and-quality skill)" plugin_active "agent-skills@addy-agent-skills" "agent-skills@addy-agent-skills"
check_or_install "security-guidance plugin" plugin_active "security-guidance@claude-plugins-official" "security-guidance@claude-plugins-official"
check_or_install "semgrep CLI" cli_present "semgrep" "semgrep"
check_or_install "playwright MCP" mcp_tool_present "playwright" "playwright"
check_or_install "superpowers plugin (TDD handoff, Sinh test CI/CD mode)" plugin_active "superpowers@superpowers-marketplace" "superpowers@superpowers-marketplace"

exit $((1 - ok))

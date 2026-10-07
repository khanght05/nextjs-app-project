# Candidate vetting — run this before adding a new line to registry.json

Never add a candidate (plugin/MCP) to `registry.json` just because its README says it "supports
X." A README is the author's claim, not evidence verified in THIS session, against THIS actual
cache — `code-review@claude-plugins-official` is an official Anthropic plugin and still turned
out to have exactly this bug: "looks usable but the agent can't actually call it" (see
`specialist-runner.md`'s Step A.2, and `adapters/code-review-plugin.md`). There is no "this
plugin is reputable enough to skip verification" exception.

## The process — 6 steps, don't skip any of them

1. **Actually install the candidate.** Use its real install command, don't guess the syntax —
   check that candidate's own README/official docs (the same way `adapters/semgrep-mcp.md` and
   `registry.json`'s `install.playwright` were both corrected based on their real READMEs instead
   of a guess).

2. **A.1 — Presence check.** `/plugin list` (or the equivalent for `type: "mcp"`) → is the
   candidate active/present in this session? If not, follow `specialist-runner.md`'s guidance on
   checking for a not-yet-loaded tool before concluding "not present" (don't repeat the mistake
   made with Semgrep).

3. **A.2 — Invokability check.** Confirm at least one of the following is true, by checking this
   session's real, current lists (not by guessing from the README):
   - A **Skill** (from the candidate's `skills/`) shows up among the skills callable via the
     `Skill` tool.
   - A **Subagent** (from the candidate's `agents/`) shows up among the subagents callable via the
     Agent/Task tool.

   **3a. If presence passes but invokability fails** (neither a Skill nor a Subagent shows up):
   before concluding "commands-only, permanently unusable" — open the candidate's real
   `plugin.json` in its cache and check whether it declares an explicit `agents`/`skills` field
   that's **masking** Claude Code's default auto-discovery (a real, confirmed failure mode — see
   `specialist-runner.md`'s A.2). Only rule this out before concluding it's genuinely
   commands-only.

4. **A real smoke test.** If (2)+(3) both pass: call the candidate once for real, on **one small,
   harmless file/scope** (not the whole codebase, not a sensitive file) — confirm it **actually
   returns output**, not just that it's "listed as available." "Shows up in a list" and "actually
   responds when called" are two different facts — the same presence/invokability distinction
   from above, applied one level further.

5. **Only once step 4 succeeds**, do you:
   - Add the entry to `registry.json`.
   - Write `adapters/<tool>.md` following the existing template (How to call it / What the raw
     output looks like / Mapping to a finding object / Special cases), based on the **real output
     observed in step 4** — never write an adapter from a README's description of "what the output
     will probably look like."

6. **Record the verification date and the candidate version verified** in `registry.json`'s entry
   (`note` field) — the same way this registry's other entries already do (a `"CONFIRMED ... as of
   version <x>"`-style note). The next time that version changes, that's the signal to re-verify —
   never trust an old note forever.

## If step 3 or 4 fails

Stop, and report exactly where it failed (presence? invokability? masking? the smoke test didn't
return real output?) — don't quietly lower the bar to "counts as usable, more or less." Keep that
category's `fallback` (the hand-written prompt) unchanged — nothing in `registry.json` changes.

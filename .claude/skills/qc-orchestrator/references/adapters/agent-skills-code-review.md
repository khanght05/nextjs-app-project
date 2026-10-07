# Adapter: `agent-skills` plugin's `code-review-and-quality` skill (`agent-skills@addy-agent-skills`)

Actually verified (not README-based) — see `references/candidate-vetting.md` for the process that
was run: version `0.6.10` (past the `0.6.6` masking fix), `.claude-plugin/plugin.json` has no
explicit `agents`/`skills` field masking anything, the `Skill` tool can call it (**a real smoke
test ran** on `lib/store.js` in a fresh `claude -p` process — the session doing the
patching/fixing work doesn't reload a newly-installed plugin's skill list mid-session; a fresh
session loads it normally; this is a session-lifecycle limit, not a limit of the plugin).

## How to call it
`Skill("agent-skills:code-review-and-quality", "<scope description: file path(s), or the diff
being reviewed>")` — this skill is **not** mandatorily diff-shaped like the old
`code-review@claude-plugins-official`: it's callable on a single standalone file (verified), and
likely also accepts a diff/PR description as text. Describe the scope clearly in `args` (a real
file path, or the actual diff content) — don't paraphrase it vaguely.

## What the raw output looks like
**Structured prose, not JSON.** The review follows exactly these 5 fixed axes, always in this
order (observed for real in the smoke test):
1. **Correctness**
2. **Readability**
3. **Architecture**
4. **Security**
5. **Performance**

Each axis is one to a few sentences of assessment. Minor issues are marked with a `Nit:` prefix;
the skill's own methodology doc states a verbal severity concept (observed real usage: the word
"Critical" when describing an assumed severity level). It ends with one **Verdict** line —
observed for real: `"Verdict: Approve"` when there's nothing blocking a merge; the skill's
methodology also implies another verdict exists (e.g. "Request changes") when there's a serious
issue — that case hasn't been observed yet, confirm it if a future smoke test hits it.

## Mapping to a finding object
| `finding.schema.json` field | Where it comes from in the raw output |
|---|---|
| `agent` | `"backend"` or `"frontend"` depending on the file named |
| `category` | based on which axis produced the finding — Correctness/Architecture → `correctness`; Security → `security`; Performance → `performance`; Readability → `maintainability` |
| `severity` | defaults to `major` for an ordinary observation; `"Critical"` (the skill's own wording) → `blocking`; a `Nit:` prefix → `minor`; **always capped in Step B** since `evidence.kind` defaults to `reasoning_only` |
| `file` / `line` | taken from the prose itself (the skill names the file/region when reviewing multiple files; for a single file, use the file passed in as scope) |
| `title` / `why` | a summary of that axis's assessment, rewritten to fit the "concrete failure scenario" shape |
| `evidence.kind` | `"reasoning_only"` by default (the skill reads code and reaches a verbal conclusion, it doesn't run a test/query itself) — unless the output cites a specific command it actually ran, with observed output attached |
| `evidence.command` / `expected_signal` | only fill in if a real command is attached; otherwise leave blank and keep `reasoning_only` |

## Special cases / known limits of this tool
- **This is a skill, callable via the `Skill` tool — unlike the old
  `code-review@claude-plugins-official`** (commands-only, not agent-invokable — see
  `adapters/code-review-plugin.md`, kept as a historical record). No need to check `skills/`/
  `agents/` on every call — already confirmed once, only re-verify when the plugin version
  changes (per `candidate-vetting.md` step 6).
- **A verdict of "Approve" alongside a `Nit:`/informational issue does not mean "no issues at
  all"** — the real smoke test showed the skill still gives Approve while flagging a nit (a
  hardcoded real email) — read all 5 axes carefully to collect every finding, don't just look at
  the Verdict line and conclude "clean, no findings."
- Whole-file audits (no "before" state) are callable normally (verified) — no diff-shaped
  restriction like the old candidate.
- **Never trust the skill's claim that it "ran X and it failed"** without real output attached —
  the specialist-runner must re-run that command itself to confirm before treating it as
  `failing_test` (see Step 5 of `specialist-runner.md`).

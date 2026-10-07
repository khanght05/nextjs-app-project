# Evidence capping and judge/dedupe rules — non-negotiable

This is the one part of this skill that must be followed exactly, not adapted. It's what keeps
a native review honest: **you (the LLM) never get the final say on a finding's severity.**
Ported verbatim from the real engine's code (`verify/evidence.py`, `core/judge.py` in
`qc-engine`) — not a prompt there either, on purpose.

## 0. Before capping anything: did you actually try to run it?

`references/verification-protocol.md` sets the bar for when `evidence.kind: "reasoning_only"` is
even allowed in the first place — a claim that could have been checked by running a test, a
query, or a script, and wasn't, with no escalation to the user recorded either, is not ready to be
judged yet. Go back, either run it or escalate per that document, and only return here once you
have. Everything below assumes that bar has already been met; it decides what an *honestly*
unproven finding is worth, not whether you were allowed to leave it unproven.

## 1. Evidence capping — apply to every finding before showing it to the user

Each finding you write has an `evidence` object (see `schemas/findings.schema.json`):
`{kind, command?, expected_signal?, artifact?}`.

- **`kind: "reasoning_only"`** — you did not run anything to prove this. It is **never
  "reproduced."** If its `severity` is above `info`, set it to `info`. State it as reasoning,
  don't hide that.
- **Any other `kind`** (`failing_test`, `static_analysis_hit`, `data_check_failure`, ...) —
  **you must have actually run `evidence.command` yourself and watched the output**, not
  guessed what it would say. Before finalizing the finding, run it for real (`Bash`), capture
  combined stdout+stderr, and check: does `evidence.expected_signal` appear as a
  **case-insensitive substring** of that output?
  - Found → reproduced. Keep the severity you assessed.
  - Not found, command errored, or you never actually ran it → **not reproduced**. Cap
    `severity` to `info` if it's higher, exactly like the `reasoning_only` case.
- **`kind: "runtime_trace"`** — check the cited `artifact` file exists and is non-empty. Missing
  or empty → not reproduced → cap to `info`.

Attach what you found either way — don't just silently downgrade:
```
"verification": { "reproduced": true|false, "actual_output": "<what you saw, truncated>", "reason": "<why not, if applicable, else null>" }
```

**A finding that only exists because you assumed the command would fail is worth less than
honestly labeling it `reasoning_only`.** Don't claim `failing_test` for something you didn't
watch fail.

## 2. Scope capping

If a finding's `file` is not one of the files actually in scope for this review (the diff's
changed files for a PR review, or the one file being audited in whole-file audit mode) — cap its
severity to `info` the same way, regardless of evidence. A reviewer finding something real but
outside what was asked to be reviewed still gets shown, just not inflated.

## 3. Playing the judge — dedupe, rank, never invent

Once every finding from every reviewer role has evidence- and scope-capped, play the `judge`
role (`prompts/judge.md`) as a **separate, final pass** — deliberately blind to severity/
evidence/fix, so you structurally can't let a later pass quietly upgrade something. Build a
view with only `id`, `file`, `title`, `why`, `confidence` per finding (literally hide the rest
from yourself for this step — don't let it influence dedupe/rank), then:

1. **Dedupe**: if two+ findings describe the same root cause in the same file, pick the clearest
   as `keep_id`, list the rest as `merged_from`.
2. **Rank**: order by how actionable each is; when in doubt, preserve the order you found them
   in.
3. You do **not** need to mention every id — anything you don't mention is still kept, appended
   after everything you explicitly ranked. **Never drop a finding just because the judge pass
   didn't reference it.**
4. Apply the decisions back to the **original, fully-capped** findings (real severity/evidence/
   fix intact) — the judge pass only ever decided keep/merge/rank, never rewrote content.
5. Re-apply evidence-capping and scope-capping **one more time** after merging, defensively —
   even though nothing in this pass should have changed severity, this is the same
   belt-and-suspenders re-assertion the real engine does.
6. Truncate to the top N by rank if the caller asked for a limit (default: show all; a
   reasonable default cap is 10 if the user wants a short list).

## Why this exists

CLAUDE.md's own invariant in `qc-engine`: "Findings without reproducible evidence cannot exceed
`info` severity... never left to a prompt." You are the prompt here — which is exactly why this
document, not your own judgment in the moment, is what decides the cap. If you notice yourself
wanting to report something `blocking` on reasoning alone, that's the system working as
intended, not a gap to work around.

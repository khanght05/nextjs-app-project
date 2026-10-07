# HTML report — publish it automatically, every run

After finishing ANY flow (`review-flow.md`, `audit-flow.md`, `test-plan-flow.md`) that produced
real output — at least one finding, one clean/coverage result to show, or a plan with scenarios —
publish the final report as an HTML Artifact **automatically, without the user asking for one**.
This is now a standard part of every flow's own reporting step, not an extra the user has to
request each time. Skip only for a genuine no-op (an empty diff nothing routes to, a request that
turned out entirely out of scope) — say so in chat; there's nothing worth a page for.

## Before writing it

- Load the `artifact-design` skill — mandatory for any artifact, no exceptions.
- Load the `dataviz` skill too whenever the report uses severity/status coloring (it almost
  always does — findings have severities) and pull the status palette from its
  `references/palette.md` (good / warning `#fab219`-family / serious `#ec835a`-family / critical
  `#d03b3b`-family, validated for both light and dark surfaces) rather than inventing ad-hoc
  severity colors. A reasonable default mapping onto this skill's `finding.severity`:
  `blocking → critical`, `major → serious`, `minor → warning`, `info → neutral ink chip (not a
  status color at all — info is "low signal," not "good")`. `good` is reserved for what's
  genuinely clean/passed (a clean file, a passing baseline check), never for a finding.

## Treatment

This is a utilitarian document — a report, not a marketing page. Polished typographic hierarchy
and a considered palette, no hero, no over-designing. Pick a real typeface pairing suited to a
technical/code-heavy report — a sans for prose plus a monospace for file paths/evidence/code (IBM
Plex Sans + IBM Plex Mono is a good default pairing for this kind of report; any equally
deliberate pairing is fine) — rather than defaulting to bare system-ui everywhere. Ground it in
the actual subject: this project's real module names, real file paths, real severities, the
actual command output you observed. Never lorem, never a generic "Finding 1/2/3" filler
structure.

## What the report needs, structurally

Adapt the grouping to what the flow actually produced — an audit's category sections differ from
a diff review's role sections differ from a test plan's scenario table — but every report
includes:

- **A header** naming what was run (repo/diff/PR, date, scope) — the artifact's own identity, not
  just a `<title>`.
- **A verdict/summary banner**, one sentence: the worst severity present, "no findings" stated
  plainly when true, or (for a test plan) the scenario count plus the reminder that `approved` is
  always `false` until a human reviews it.
- **A few stat tiles** that orient the reader before the first finding — files reviewed, findings
  by severity, categories/roles swept, baseline checks actually run. Skip these if the run is too
  small to need orienting (e.g. a two-file diff review).
- **Findings grouped the same way the flow's own report step already groups them** (by category
  for an audit, by severity for a diff review, by `test_type` for a test plan), each showing:
  severity as a chip or left-edge stripe in the mapped status color, the real `file:line`, a
  concrete "why," and the real evidence — an actual command plus its actual observed output in a
  code block. Never show a finding on the page with no evidence just because the chat summary
  compressed it away.
- **A coverage/honesty section** — what was and wasn't reviewed, named technical blockers, and
  anything escalated per `verification-protocol.md` (what the user chose, what happened). This is
  not optional trim — it's the same "say what you skipped and why" ground rule, also on the page.
- **A "Specialist source" line per category**, inside that same coverage/
  honesty section — not a separate page section of its own. For every category the run touched,
  name which specialist actually produced its findings: the plugin/MCP/CLI that ran (e.g.
  "Security: security-guidance plugin + semgrep CLI via Bash"), or that it fell back to the
  bundled prompt and why (e.g. "Security: fallback — hand-written prompt because the plugin isn't installed"), per
  `references/specialist-runner.md` step 7. **Whenever the specialist that ran wasn't `primary`,
  this line names every candidate tried before it and why each was ruled out** (missing vs.
  present-but-uninvokable-for-this-call, per `specialist-runner.md`'s own decision logic) — not
  only the one that ended up running; a line with just the final specialist's name reads as if
  nothing else was ever tried, which is exactly the silent-skip this section exists to catch. Any
  tool cited that isn't the category's registered specialist (extra corroborating evidence from
  an unrelated plugin, or a reused prior result) gets its own clearly-labeled mention, never
  folded into this line as if it were the registered specialist. This is the same "say what you
  skipped and why" principle applied one level deeper — not just *which category* was covered,
  but *what actually covered it, and what was tried and ruled out along the way*.
- **A footer** naming the flow that produced the report.

## Publishing

Write the file under the session's scratchpad directory, then `Artifact`-publish it with a real
`title` (a name, not a caption — see `artifact-design`'s own naming rules), a one-sentence
`description`, and a `favicon` that fits the flow (🔍 for an audit, ✅ for a diff/PR review, 🧪 for
a test plan — pick one and keep it stable across re-publishes of the same report). Share the link
back in chat with a short pointer (2-3 sentences: headline verdict + link) — the artifact is now
the detailed deliverable, not the chat message; don't paste the full findings list as chat text
*and* build the artifact, that's redundant work with two sources of truth. Chat carries the
headline, the artifact carries the detail.

## Updating vs. publishing a new one

A follow-up pass on the SAME run (the user asks to verify one more finding, or answers an
escalation question, or asks for a fix and wants the report to reflect it) updates the same
artifact (pass its `url`) rather than publishing a new one — read the Artifact tool's own
update-flow rules before republishing. A genuinely new run (a different diff, a different audit
scope, a later day) publishes a new artifact.

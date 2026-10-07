# Input: an existing QC checklist file (data-pipeline flow)

This project already runs its own hand-maintained QC checklist across multiple rounds — currently
`Feedback/[DCT] Grow Tool QC Pt2.xlsx`, sheet `02_Checklist Metrics` (companion sheets in the same
workbook: `00_QC Tổng quan` a rollup summary, `01_Product Metric Mapping` a per-platform metric
definition/status table, `03_Issues & Gaps` open issues). The team also works from single-tab CSV
exports of just that sheet — Google Sheets' own per-tab export names the file
`<Spreadsheet name> - <Sheet name>.csv`, e.g. `[DCT] Grow Tool QC Pt2 - 02_Checklist Metrics.csv` —
and a companion `...BACKUP.csv` may sit alongside it carrying the full round-by-round column
history the trimmed current-round CSV has already dropped (see "Two CSV shapes" below).

When the user points a `QC data pipeline` run at a file like this (by name, by path, or by
uploading it), **use it as the scope source and the status-vocabulary source** instead of the
generic full-grid default in `data-pipeline-flow.md`. This is the concrete instance of that flow's
own rule ("reuse whatever status vocabulary this project's own QC tracker already uses if the user
has shared one this session") — this file is that tracker.

## Reading it

- `.xlsx`: parse with `openpyxl` (`pip install openpyxl` if missing in the environment; use
  `read_only=True, data_only=True` — it's a large multi-sheet workbook and you only need computed
  values, not formulas).
- `.csv`: standard library `csv` module, `encoding="utf-8-sig"` (the exports carry a BOM).
- **Detect the header row and column layout from the file itself, don't hardcode either.** The
  round count and the exact column set change every time the team runs a new round — what's
  described below is this project's shape as of round 5 (R5); a later export will have moved on.
- **Data rows are the ones with a numeric row index in the first column** (`STT`/`Tô` depending on
  export — the header label itself has varied between exports; go by "first column parses as an
  int", not by its header text). Stop once that stops holding: trailing blank rows, then a
  `Type == "Notes"` row and a free-text comment row are template chrome, not checklist entries.

## Two CSV shapes you'll encounter

1. **Full history** (e.g. the `...BACKUP.csv`): every round's column-pair kept side by side —
   `1R Check`/`Note`, `2R Check`/`Note`, `3R Check`/`Note`, then per-product
   `"<Product> - Data Comment R4\nStatus - Issue and Next Steps"` pairs, then the equivalent R5
   pairs. Use this shape when you need round-over-round history for a specific row (has this metric
   flipped status before, or been stable since R3?).
2. **Current-round-only** (the plain, non-`BACKUP` CSV): old round columns dropped, keeping just
   `Type`, `Loại`, `Metric / App Event`, and **one column-pair per product for the latest round
   only**. This is the shape to read when the ask is "what's the current state," and the shape a
   fresh round's results get merged back into (see "Writing back" below).

## Column shape, current-round CSV (R5, this project's shape as of 2026-09)

| Column(s) | Meaning |
|---|---|
| col 1 (`Tô`/`STT`) | row index in the tracker — not a stable metric id, don't rely on it across re-exports |
| `Type` | platform / source: `Meta`, `Google`, `Tiktok`, `MMP`, `GA4-UA`, `GA4-Monet`, `GA4-Monet (Source Revenue)` — this is your `platform` scope dimension |
| `Loại` | category — sometimes `Ad Platform` (a plain platform metric), sometimes an MMP sub-type tag (`Metric chung (Adjust) - Đánh tag Adjust để phân biệt AF`, `Metric riêng (AppsFlyer) - (app event) - CODm...`), sometimes a product/game tag on a GA4 row (`CODM`, `VALORANT`) |
| `Metric / App Event` | the metric name — a UI label (`Amount spent`, `Results`, `Cost per Results`) or a raw event/field key (`all_revenue`, `skad_total_installs`) — this is your `metric` scope dimension |
| a repeating pair per product: `"<Product> - Data Comment R<N>\nStatus - Issue and Next Steps"`, *(blank header)* | **column 1 of the pair = status word** (`Đã đủ` / `Cần xác nhận` / `Thiếu` / `Không có trên tool` — see vocabulary below); **column 2 = the free-text note**, and that note is itself already written as `Raw→DB: ...` / `DB→UI: ...` two-part text — the exact same split `data-pipeline-flow.md` already prescribes for its own Note field. Current products, in column order: TFTPC, TFTm, LoL, PUBGm, NARAKA, VALORANT, WR, CODM. |
| `Ghi chú chung` | a general note, not product-specific |

## Status vocabulary — reuse verbatim, never invent a parallel one

Observed across all ~202 real rows of the current R5 export:

- **`Đã đủ`** — sufficient/complete: both Raw→DB and DB→UI check out for this metric×product.
- **`Cần xác nhận`** — needs confirmation: checked partially, or the result is plausible but not
  yet nailed down with real evidence — this is the closest match to this skill's own
  `reasoning_only`/unverified state; don't silently promote it to `Đã đủ`.
- **`Thiếu`** — missing: the metric genuinely isn't available end-to-end (may still be "not a bug,"
  e.g. the row 35 `Cost per Results` example below — Google has no `Results` concept at all, so
  there's structurally nothing to compare, same as this flow's "platform-inherent limitation"
  status kind).
- **`Không có trên tool`** — not on the tool: the column/feature doesn't exist in the product UI at
  all (distinct from `Thiếu`, which can mean "exists but no data flows through it").

An earlier round of this same tracker (seen in the full-history `BACKUP.csv`, rounds 1–3) used a
different, now-superseded vocabulary: `Có trong tool` / `Thiếu` / `Sai tên/vị trí` / `Chưa xác
định` (rounds 1–2), then `Có số` / `Chưa có số` / `Không có cột` / `Trùng cột` / `Có cột, kỳ này =
0` (round 3). **Always use whichever vocabulary the file you were actually handed uses** — check
the values present in that file's own columns rather than assuming R5's words below still apply to
an even later export.

When you run a **new** round against this checklist, map what you actually find for each row onto
one of the vocabulary values *actually present in the file you're extending* — same discipline as
`data-pipeline-flow.md`'s own four Status kinds, just expressed in the tracker's own current words.
Only add a new value when a row's true state genuinely doesn't fit any existing one, and say so
explicitly in your report rather than silently forcing a fit.

## How this changes `data-pipeline-flow.md`'s scope resolution

- **The checklist IS the scope** — skip the "nothing named → default to the full metric × platform
  × product grid" branch entirely. Each data row × each populated product-column-pair is one
  `(metric, platform, product)` unit already. Don't re-derive scope from `metricRegistry.ts` or
  invent a broader grid than what the tracker itself tracks.
- **Still batch a large checklist** — ~202 real rows × up to 8 products is a large grid; apply the
  same "batch by platform, report incrementally" principle `data-pipeline-flow.md` already
  documents for a self-generated grid, batching by the tracker's own `Type` groups (Meta 30 rows,
  Google 23, Tiktok 37, MMP 102, GA4-UA 3, GA4-Monet 6/1).
- **Prioritize what's actually unresolved.** A cell already `Đã đủ` this round only needs a
  regression check if the user wants one; `Cần xác nhận`, `Thiếu`, and `Không có trên tool` cells
  are the ones actually worth spending a real verification pass on. When the user hasn't said
  which, ask (or default to non-`Đã đủ` cells only, and say that's what you did) rather than
  silently re-running all ~200 rows × 8 products end to end.
- **The Note text is already two-part** (`Raw→DB: ...` / `DB→UI: ...`) — when you write a new
  round's note, keep that exact split; it's not a convention you're introducing, it's the one this
  tracker already uses.

## Writing back into the tracker

Only do this when the user explicitly asks for it (same ground rule as everywhere else in this
skill — don't rewrite the team's spreadsheet as a side effect of a QC pass). When asked: on the
**full-history** shape, append a new round's column-pair per product (e.g. an `R6` pair following
`R5`) rather than overwriting any existing round's columns. On the **current-round-only** shape,
either update it in place (it already represents "latest round only" by convention) or produce a
fresh current-round CSV for the new round — ask the user which of the two shapes they want back if
it isn't obvious from how they handed you the input.

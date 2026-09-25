# Plumbline Skill & Mode — Plan

## Overview

Add a Bob **skill** (`SKILL.md`) and a **custom mode** (`custom_modes.yaml`) called
**Plumbline** to this repository. Together they tell Bob how to perform a five-stage
structured audit of any target repository that carries formal documentation:

1. **Extract** — read `docs/*.xlsx` (test plan), `docs/*.docx` (spec), and
   `docs/*.pdf` (release checklist) into a structured `claims.json`, one entry per
   row / clause / item, tagged with its source cell or clause reference.
2. **Map** — for every test-plan case, locate the automated test that proves it, or
   record none. One subagent per test file.
3. **Mutate** — for every mapped case, generate the smallest source edit that makes
   the claim's *described behaviour* false. One subagent per test file (the subagent
   never receives the test file itself).
4. **Judge** — for every spec clause and checklist item, verdict against the current
   code and git history.
5. **Report** — produce a self-contained HTML report.

A companion runner script `plumbline-run.mjs` applies each mutation in a throwaway
`git worktree`, runs the mapped test, and records the outcome. A test that still
passes after its own mutation is stamped **"test in name only"** in the report.

### Scope

- New files only. Nothing in `src/`, `test/`, or any existing source is touched.
- No new runtime dependencies. Node >= 20 (`node:fs`, `node:child_process`, `node:path`,
  the built-in test runner). The `office_read` Bob tool provides .xlsx/.docx/.pdf
  extraction inside the skill's Bob context.
- Bob token cost is kept low by batching work **per file**, never per case.
- **Portability:** the skill and mode work when copied into any repository's `.bob/`
  folder. All paths are relative to the workspace root. No absolute paths.

---

## Architecture diagram (for reference)

```
docs/*.xlsx ──┐
docs/*.docx ──┤  Stage 1: claimsFromDocs()  ->  .plumbline/claims.json
docs/*.pdf  ──┘

.plumbline/claims.json (test-plan rows only)
  └─ Stage 2: one subagent per test file  ->  claims[].testFile + testName

.plumbline/claims.json (mapped rows only)
  └─ Stage 3: one subagent per test file  ->  claims[].mutation (JSON patch)
     (subagent receives claim text + source files; NEVER the test file)

.plumbline/claims.json (spec + checklist rows)
  └─ Stage 4: judge against code + git    ->  claims[].verdict

.plumbline/claims.json
  └─ Stage 5: renderHtml()               ->  .plumbline/report.html

plumbline-run.mjs
  └─ for each mapped row:
       git worktree add  ->  apply mutation  ->  run test  ->  record pass/fail
       git worktree remove
  └─ annotates .plumbline/claims.json with mutationResult
```

---

## Decisions (recorded at implementation time)

| Decision | Choice |
|---|---|
| Document search order | `docs/` first; fall back to repo root |
| Output directory | `.plumbline/` folder in the audited repository |
| Output files | `claims.json`, `report.html` (both under `.plumbline/`) |
| Stage 4 execute_command | Allowed for `git log`, `git show`, `git diff` (read-only git) and `node .bob/skills/plumbline/plumbline-run.mjs` only |
| PDF extraction failure | Try native read first; on failure emit a `PDF_UNREADABLE` claim and surface it as amber in the report; never skip silently |
| Stage 3 mutation target | Must make the **claim's described behaviour** false in source code, NOT aim at the test's assertion |
| Stage 3 subagent inputs | Claim text + source files the tests import; test file is withheld intentionally |
| Portability | Skill and mode work when copied into any repo's `.bob/` folder |
| Runner location | `.bob/skills/plumbline/plumbline-run.mjs` (inside skill folder; copying `.bob/` installs everything) |
| Renderer location | `.bob/skills/plumbline/render-report.mjs` (same; no `src/` changes) |
| Worktree location | OS `tmpdir()`, not inside the repo — prevents relative imports in test files from resolving against the original source tree |
| NODE_TEST_* stripping | Child processes spawned by `runTest` have `NODE_TEST_*` env vars removed to prevent Node's recursive test-runner guard from returning exit code 0 |
| Skill runs runner | The skill invokes `plumbline-run.mjs` via `execute_command` after Stage 3; the user does not run it separately |

---

## Sub-tasks

---

### Sub-task 1 — Scaffold `.bob/` directory and custom mode

**Status:** `[x] complete`

**Intent:**
Create the `.bob/` directory with `custom_modes.yaml` declaring the `plumbline` mode.
The mode restricts its tools to the ones the five stages need and directs Bob to
activate the plumbline skill via `use_skill` before starting any stage.

**Expected Outcomes:**
- `.bob/custom_modes.yaml` exists and is valid. ✓
- Bob surfaces a "Plumbline" mode in the mode switcher. ✓
- The mode's `roleDefinition` contains the `use_skill` directive. ✓

**Outcomes delivered:**
- `.bob/custom_modes.yaml` created with slug `plumbline`, name `Plumbline`.
- Groups: `read`, `edit`, `execute`, `skill`, `todo`, `subagent`.
- `execute` group included so Stage 4 git commands and `plumbline-run.mjs` are
  reachable from within the mode.
- `roleDefinition` ends with: "Before starting any stage, activate the plumbline
  skill with use_skill to load the full stage-by-stage instructions."

---

### Sub-task 2 — Write the Plumbline skill (`SKILL.md`)

**Status:** `[x] complete`

**Intent:**
Write the skill file that Bob loads when `use_skill` is called with `plumbline`.
The skill is the authoritative how-to for all five stages.

**Expected Outcomes:**
- `.bob/skills/plumbline/SKILL.md` exists and follows the Bob skill frontmatter schema. ✓
- The skill covers all five stages plus the activation guard and runner protocol. ✓
- The `name` field matches the id used in `custom_modes.yaml`. ✓

**Outcomes delivered:**
- Six sections written: § 0 Activation Guard, § 1 Claims Extraction,
  § 2 Test Mapping, § 3 Mutation Generation, § 4 Judging, § 5 HTML Report,
  § 6 plumbline-run.mjs Protocol.
- All user decisions incorporated (see Decisions table above).
- Output directory is `.plumbline/` throughout.
- Stage 3 includes the critical rule: subagent receives claim text + source files,
  never the test file; mutation must falsify the described behaviour, not the test.
- Stage 1 PDF: native read attempted; failure emits a `PDF_UNREADABLE` claim.
- Stage 4: `execute_command` explicitly allowed for read-only git commands.
- Portability note in the skill preamble.

---

### Sub-task 3 — Write `plumbline-run.mjs`

**Status:** `[x] complete`

**Intent:**
Write the standalone runner script that applies mutations in isolated git worktrees,
runs the mapped tests, and records whether each mutation was detected.

**Expected Outcomes:**
- `.bob/skills/plumbline/plumbline-run.mjs` exists (inside the skill folder so
  copying `.bob/` installs everything). ✓
- It is a valid ES module, no external dependencies, Node >= 20. ✓
- Reads `.plumbline/claims.json` (falling back to `./claims.json`), processes rows
  with `mutation != null`, writes `mutationResult` back, regenerates the report. ✓
- For each mapped claim: first runs the test on unbroken code (baseline). If baseline
  fails → `BASELINE_FAIL`, skip mutation. Then applies mutation in a throwaway worktree
  (placed in OS `tmpdir()`, not inside the repo, so relative imports resolve correctly).
  Records `CAUGHT` (test detected mutation) or `NAME_ONLY` (test did not). ✓
- Mutation's `search` string must appear exactly once or → `MUTATION_INVALID`. ✓
- Worktree cleanup is guaranteed even on failure (try/finally). ✓
- The runner strips `NODE_TEST_*` env vars from spawned child processes to prevent
  Node's recursive test-runner detection from producing false `NAME_ONLY` results. ✓

**Outcomes delivered:**
- `.bob/skills/plumbline/plumbline-run.mjs` — exports `loadClaims`, `saveClaims`,
  `applyMutation`, `runTest`, `runBaseline`, `processRow` for direct import in tests.
- `main()` runs when invoked directly; after writing claims, regenerates the HTML report
  via `render-report.mjs` if it exists alongside the script.
- Git guard: exits 1 with a clear message if `git` is not found or no `.git` dir.
- `"run": "node .bob/skills/plumbline/plumbline-run.mjs"` added to `package.json`.

---

### Sub-task 4 — Write `render-report.mjs`

**Status:** `[x] complete`

**Intent:**
Write a pure function module that turns the annotated `claims.json` into the
self-contained HTML report. Keeping this separate from the runner means the report
can be regenerated without re-running mutations.

**Expected Outcomes:**
- `.bob/skills/plumbline/render-report.mjs` exports `renderReport(claims): string`. ✓
- When run as a script, reads `.plumbline/claims.json` and writes `.plumbline/report.html`. ✓
- The HTML is self-contained: all CSS inline in a `<style>` block, no external URLs. ✓
- Dark theme: IBM Plex fonts (with system fallbacks), brass `#e4ad45`, red `#ff6a55`,
  green `#52d6a4`. ✓
- Leads with test-plan headline tiles: cases in plan, automated, with a test, without
  a test, tests in name only. ✓
- NAME_ONLY rows: `.bad` row class + "TEST IN NAME ONLY" label + call-out list. ✓
- Sections: test-plan coverage, spec verdicts, checklist verdicts, workbook summary claims. ✓

**Outcomes delivered:**
- `.bob/skills/plumbline/render-report.mjs` — exports `renderReport`, runnable as a script.
- `"report": "node .bob/skills/plumbline/render-report.mjs"` added to `package.json`.
- NOT exported from `src/index.mjs` (separate skill asset, not part of the public package API).

---

### Sub-task 5 — Wire the skill into the Bob activation chain

**Status:** `[x] complete`

**Intent:**
Ensure the Plumbline mode auto-activates the Plumbline skill when Bob enters it.

**Expected Outcomes:**
- The `plumbline` mode entry references the skill via a `use_skill` directive in
  its `roleDefinition`. ✓
- Running `use_skill plumbline` loads `.bob/skills/plumbline/SKILL.md`. ✓

**Outcomes delivered:**
- The Bob mode schema has no separate `skills:` array key; the correct mechanism
  is a directive in `roleDefinition`.
- `custom_modes.yaml` already contains the directive (written in Sub-task 1):
  "Before starting any stage, activate the plumbline skill with use_skill to load
  the full stage-by-stage instructions."
- No additional edit to `custom_modes.yaml` was required beyond Sub-task 1.

---

### Sub-task 6 — Add tests for `renderReport` and `plumbline-run` helpers

**Status:** `[x] complete`

**Intent:**
Add tests covering pure helpers and one integration test that builds a real git
repository to verify `CAUGHT` vs `NAME_ONLY`.

**Expected Outcomes:**
- `test/plumbline-run.test.mjs` passes under `node --test test/*.test.mjs`. ✓
- Unit tests: `applyMutation` (find+replace, throws on missing, throws on duplicate),
  `renderReport` (HTML structure, NAME_ONLY label, CAUGHT class, headline tiles). ✓
- Integration test: builds a real temp git repo with a real test file and a weak test
  file, runs the runner, asserts CAUGHT for the real one and NAME_ONLY for the other. ✓
- No new test dependencies. ✓

**Outcomes delivered:**
- `test/plumbline-run.test.mjs` — 8 tests, imports from
  `.bob/skills/plumbline/plumbline-run.mjs` and `.bob/skills/plumbline/render-report.mjs`.
- Integration test uses two separate test files (real vs weak) so `--test-name-pattern`
  runs each in isolation without the other test's exit code contaminating the result.
- Key fix: `runTest` strips `NODE_TEST_*` env vars from spawned child processes to
  prevent Node's recursive test-runner guard from producing false NAME_ONLY results.
- `README.md` updated to reflect the new test count (88 `test()` calls across all files).

---

## Files created by this plan

| File | Sub-task |
|---|---|
| `.bob/custom_modes.yaml` | 1, 5 |
| `.bob/skills/plumbline/SKILL.md` | 2 |
| `.bob/skills/plumbline/plumbline-run.mjs` | 3 |
| `.bob/skills/plumbline/render-report.mjs` | 4 |
| `test/plumbline-run.test.mjs` | 6 |
| `package.json` (scripts only) | 3, 4 |
| `README.md` (test count update) | 6 |

Existing source files modified: `package.json` (scripts), `README.md` (test count).
`src/index.mjs` is **not** modified — renderer is a skill asset, not a package export.

---

## Open questions

None — all decisions recorded in the Decisions table above.

---
name: plumbline
description: >-
  Use when the user wants to audit a repository's automated tests against its
  formal documentation -- runs five stages (Extract, Map, Mutate, Judge, Report)
  to surface every untested claim and every test that passes its own mutation.
---

# Plumbline Audit Skill

This skill drives a five-stage structured audit. Read all six sections before
starting Stage 1. Every output file goes into a `.plumbline/` folder at the root
of the audited repository. Create that folder if it does not exist.

> **Portability note.** This skill and its companion scripts live in
> `.bob/skills/plumbline/`. Copying the `.bob/` folder into any repository
> installs everything. All paths are relative to the workspace root that Bob
> has open. Never hard-code absolute paths.

---

## § 0 -- Activation Guard

Before doing anything else, verify all three conditions hold:

1. A `docs/` directory exists at the workspace root, **or** at least one
   `.xlsx`, `.docx`, or `.pdf` file exists at the workspace root itself.
2. At least one of those file types is present in the locations above.
3. A `.git/` directory exists at the workspace root.

If any condition fails, report exactly which is missing and stop. Do not
create any output files for a failed guard.

---

## § 1 -- Stage 1: Claims Extraction

**Goal:** read every piece of formal documentation and produce a single
`.plumbline/claims.json` array. One entry per test-plan row / spec clause /
checklist item.

### 1.1 File discovery

Use `glob` to discover documents. Search `docs/` first; if no matching files
are found there, search the repository root (`*.xlsx`, `*.docx`, `*.pdf`).

```
glob pattern: "docs/**/*.xlsx"   fallback: "*.xlsx"
glob pattern: "docs/**/*.docx"   fallback: "*.docx"
glob pattern: "docs/**/*.pdf"    fallback: "*.pdf"
```

Process every file found. Do not silently skip any file.

### 1.2 Excel / test-plan files (`.xlsx`)

For each `.xlsx` file:

1. Call `office_read mode:outline` **once** to get all sheet names and their
   column headers in one call.
2. Identify the sheet whose headers most closely match: `ID`, `Description`,
   `Expected` (or `Expected Result`), `Type` (or `Automated`/`Manual`), and
   `Pass/Fail` (or `Status`, `Result`).
   If no sheet matches, record a single claim with
   `kind: "test-plan"`, `text: "UNREADABLE: no recognisable test-plan sheet in <filename>"`,
   and `verdict: "UNVERIFIABLE"`.
3. Call `office_read mode:text` on that sheet **once** to get all rows in a
   single call. Do **not** make one call per row.
4. For each data row (skip the header row):
   - If the row has a `Type` column: only rows where `Type == "Automated"` (case-
     insensitive) go forward to Stage 2. Rows with `Type == "Manual"` are still
     emitted as claims (so they appear in the report) but `testFile` stays `null`
     and they are skipped in Stage 2.
   - Emit one claim per data row. The `source` field is
     `<filename>!<SheetName>!<rowRef>` for the Description cell.
5. Also scan every **other** sheet for workbook-level summary claims (e.g. a sheet
   that states "coverage is 100%" or a statistics summary table). Emit those as
   claims with `kind: "summary"`, `source: "<filename>!<SheetName>!<cellRef>"`.
   These claims are judged in Stage 4.

**Cost rule:** one `mode:outline` call + one `mode:text` call per sheet.
Do **not** call `mode:get` once per row.

### 1.3 Word / spec files (`.docx`)

For each `.docx` file:

1. Call `office_read mode:text` to extract all text (**one call per file**).
2. Split on **sub-clause headings** matching the regex
   `^\s*\d+\.\d+(\.\d+)*\s+\S` — i.e. headings with at least one dot
   (e.g. `2.1`, `4.1.2`). Do **not** emit top-level section headings like
   `1 Scope` or `3 Definitions` as claims; those are structural headings, not
   normative requirements.
3. Emit one claim per matched clause. The `text` field is the full clause
   heading plus the first 200 characters of its body. The `source` field is
   `<filename>!clause:<heading-number>`.

**Cost rule:** one `office_read` call per `.docx` file.

### 1.4 PDF / checklist files (`.pdf`)

For each `.pdf` file:

1. **Try `office_read` first:** call `office_read mode:text` on the PDF.
2. **If `office_read` refuses or returns empty, try `read_file`:** call
   `read_file` on the same path. `office_read` does not support `.pdf`; it will
   throw or return nothing. `read_file` may succeed for text-based or
   linearised PDFs.
3. If **either** call returns non-empty text, split on checklist-item
   patterns: lines beginning with `[ ]`, `[x]`, `☐`, `☑`, a bullet (`-`, `*`,
   `•`), or a numbered list item (`1.`, `2.`, etc.). Emit one claim per item.
   The `source` field is `<filename>!line:<approximate-line-number>`.
4. **If both calls fail** (throw, return empty, or return only whitespace):
   - **Try the PDF script as a third fallback:** run
     `node .bob/skills/plumbline/pdf-text.mjs <file.pdf>` via `execute_command`.
     The script decodes FlateDecode and ASCII85Decode content streams and maps
     ZapfDingbats glyphs (including ✔ U+2714, ✘ U+2718, ■ U+25A0, ❏ U+274F)
     to Unicode. If the script produces non-empty output, split its lines on
     item-ID patterns (e.g. `R-\d+`, `^\d+\.`) or treat each non-blank line
     as one checklist item. Each line that contains a ✔ is ticked; lines with
     ✘ or ■ (unchecked square) are unticked.
   - **If all three attempts fail**, emit a single claim entry:
     ```json
     {
       "id": "<auto-id>",
       "source": "<filename>!UNREADABLE",
       "kind": "checklist",
       "text": "PDF_UNREADABLE: <filename> could not be extracted natively. Manual review required.",
       "testFile": null,
       "testName": null,
       "mutation": null,
       "verdict": "UNVERIFIABLE",
       "verdictDetail": "PDF extraction failed; content was not available to Bob.",
       "mutationResult": null
     }
     ```
   - This failure is surfaced in the report as an amber row. Do **not** skip
     the file silently.

**Cost rule:** up to two `office_read`/`read_file` calls per `.pdf` file, plus
one `execute_command` call if those two fail. All attempts count toward the cost.

### 1.5 Claims JSON schema

Every entry in `.plumbline/claims.json` must conform to this shape:

```json
{
  "id": "TP-001",
  "source": "test-plan.xlsx!Sheet1!B3",
  "kind": "test-plan",
  "text": "The login endpoint returns 401 for an unknown user",
  "testFile": null,
  "testName": null,
  "mutation": null,
  "verdict": null,
  "verdictDetail": null,
  "mutationResult": null
}
```

- `id`: auto-assign sequentially if the document has no explicit ID column.
  Prefix by kind: `TP-` for test-plan, `SP-` for spec, `CL-` for checklist,
  `SUM-` for workbook summary.
- `kind`: `"test-plan"` | `"spec"` | `"checklist"` | `"summary"`
- All other fields start `null` and are filled by later stages.

Write the array to `.plumbline/claims.json`. Create the `.plumbline/` directory
if it does not exist (use `execute_command` with `mkdir -p .plumbline`).

---

## § 2 -- Stage 2: Test Mapping

**Goal:** for every `kind == "test-plan"` claim **where `testFile` is not already
set to `null` due to `Type == "Manual"`**, find the automated test that proves it
and record `testFile` + `testName`.

### 2.1 Discover test files

```
glob patterns (all of):
  **/*.test.mjs
  **/*.test.js
  **/*.test.ts
  **/*.spec.mjs
  **/*.spec.js
  **/*.spec.ts
```

Exclude paths containing `node_modules` or `.plumbline`.

### 2.2 One subagent per test file

For each test file, spawn one subagent. Pass:

- The **full text** of the test file.
- A JSON array of `{ "id": "TP-001", "text": "..." }` objects for every
  test-plan claim that is eligible for Stage 2 (id and text only -- no other
  fields).

The subagent must return a JSON array of zero or more:

```json
{ "claimId": "TP-001", "testName": "login returns 401 for unknown user" }
```

A test name matches a claim when the test's behaviour is a direct automated
proof of the claim's described expectation. Partial keyword matches alone are
not sufficient; the test must actually assert the claim's outcome.

**Cost rule:** one subagent call per test file, regardless of claim count.

### 2.3 Merge results

Update `claims.json`: for each returned `{ claimId, testName }`, set
`testFile` to the test file path and `testName` to the value. Claims with no
match retain `testFile: null`. Write the updated `claims.json`.

---

## § 3 -- Stage 3: Mutation Generation

**Goal:** for every mapped claim, produce the smallest source edit that would
make the claim's *described behaviour* false -- not necessarily the specific
assertion in the test. Each mutation carries a **witness** that proves the
mutation truly breaks the claim before the test result is trusted.

### 3.1 Critical rule -- what the mutation targets

The mutation must make **the behaviour described in the claim text** false in
the production source code. It must **not** be chosen to make the mapped test's
assertion fail. These are often the same thing, but when a test asserts the
wrong thing the difference is decisive: a mutation aimed at the claim text will
expose the broken test, while a mutation aimed at the test's assertion would
rubber-stamp it.

### 3.2 One subagent per test file -- with the test file withheld

Filter `claims.json` to rows where `testFile != null`. Group by `testFile`.
For each unique `testFile`, spawn one subagent. Pass:

- The list of `{ "claimId": "TP-001", "text": "..." }` pairs the test file owns
  (claim text only -- **do not pass the test file itself**).
- The full text of **every source file that the tests import** (resolved from
  `import` / `require` lines in the test file, which you read with `read_file`
  before spawning the subagent).

The subagent **never receives the test file**. This is intentional. The
subagent reasons from the claim text and the production source alone, so its
mutation targets what the claim says the code must do.

The subagent must return a JSON array of:

```json
{
  "claimId": "TP-001",
  "mutation": {
    "file": "src/auth.mjs",
    "search": "return 401;",
    "replace": "return 200;"
  },
  "witness": "export default async (load) => {\n  const { login } = await load('src/auth.mjs');\n  return login('x', 'bad').status === 401;\n};\n"
}
```

Rules for the subagent:
- The mutation must be the **smallest** change to a source file that makes the
  claim's described behaviour false.
- The `search` string must appear **exactly once** in the target file. The
  runner rejects mutations where the search matches zero or more than one
  occurrence.
- Prefer single-line changes. If two lines must change together, use an array:
  `"search": ["line A", "line B"]`, `"replace": ["line A'", "line B'"]`.
- If no source-level mutation can falsify the claim (e.g. the claim is a
  process/documentation requirement with no code counterpart), set
  `"mutation": null` and `"witness": null`.

**Witness rules:**
- Every non-null mutation **must** include a `witness`.
- The witness is the full text of an ES module whose **default export** is:
  `async (load) => boolean`
  where `load(relPath)` dynamically imports a module **from the code tree being
  tested** (not from the host system).
- The witness must return `true` when run against the **unbroken** code
  (confirming the claim holds before the mutation).
- The witness must return `false` when run against the **mutated** code
  (confirming the mutation actually breaks the claim's described behaviour).
- The witness reasons from the claim text and the production source alone —
  it must **not** replicate the mapped test's assertions. It is an independent
  proof that the described behaviour holds or is broken.
- Keep the witness as short as possible: import only what is needed, call the
  minimum function(s) needed to verify the claim, return a boolean.

**Cost rule:** one subagent call per test file (even though the subagent never
sees the test file -- the grouping is for batching efficiency).

### 3.3 Merge results

Update `claims.json` with `mutation` and `witness` for each claim. Write the
file. The `witness` field is a JSON string (the ES module source). Null when
`mutation` is null.

### 3.4 Run the mutation runner (Bob does this)

After all mutations are generated and `claims.json` is written, **Bob runs the
runner directly**:

```bash
node .bob/skills/plumbline/plumbline-run.mjs
```

The runner now executes the witness on the unbroken worktree (must return
`true`, else `WITNESS_INVALID`) and on the mutated worktree (must return
`false`, else `WEAK_MUTATION`). Only when the witness confirms the break **and**
the mapped test still passes is the result `NAME_ONLY`. This prevents false
NAME_ONLY verdicts caused by mutations that do not actually break the claim.

This populates `mutationResult` on every mapped row and regenerates
`.plumbline/report.html`. The skill does not ask the user to run the script;
Bob runs it automatically before Stage 4.

---

## § 4 -- Stage 4: Spec and Checklist Judging

**Goal:** for every `kind == "spec"`, `kind == "checklist"`, or `kind == "summary"`
claim, reach a verdict against the current code and git history.

### 4.1 Allowed commands in this stage

This stage may use `execute_command` for read-only git commands:

```bash
git log --oneline -20
git log --oneline --all -- <path>
git show <ref>:<path>
git diff HEAD~1 HEAD -- <path>
```

No other shell commands are permitted in this stage.

### 4.2 Workflow

1. Use `grep` on the clause text's key nouns/verbs to find relevant source
   files.
2. Use `read_file` to read those files.
3. Use `git log --oneline -20` via `execute_command` to check recent history
   for relevant commits.
4. Judge in topic groups (not one subagent per clause). Assign:
   - `HOLDS` -- code clearly satisfies the clause.
   - `PARTIAL` -- code partially satisfies it or evidence is mixed.
   - `FAILS` -- code clearly violates the clause.
   - `UNVERIFIABLE` -- not enough code evidence to decide (e.g. a process
     requirement, a PDF that failed extraction, or a purely external dependency).
5. Set both `verdict` and `verdictDetail` on each entry.

**Cost rule:** batch clauses by topic; do not spawn a subagent per clause.

---

## § 5 -- Stage 5: HTML Report

**Goal:** write `.plumbline/report.html` -- a self-contained, zero-dependency
HTML file. Use `render-report.mjs` (which was already run by Stage 3.4, so this
stage regenerates the report with the completed verdicts).

```bash
node .bob/skills/plumbline/render-report.mjs
```

The renderer reads `.plumbline/claims.json` and writes `.plumbline/report.html`.
It can also be imported as a module: `import { renderReport } from '.bob/skills/plumbline/render-report.mjs'`.

### 5.1 Structure

The report leads with the **test-plan headline** tiles:

| Tile | Content |
|---|---|
| Cases in plan | total test-plan rows |
| Automated | rows eligible for Stage 2 |
| With a test | rows where `testFile != null` |
| Without a test | rows where `testFile == null` |
| Tests in name only | rows where `mutationResult == "NAME_ONLY"` |

Followed by:
- **NAME_ONLY call-out list** (if any): every NAME_ONLY case with the mutation
  that survived.
- **Test-plan coverage table:** ID | Claim text | Test file / name |
  Mutation (search → replace) | Mutation result.
- **Spec verdicts table:** ID | Clause text | Verdict | Detail.
- **Checklist verdicts table:** ID | Item text | Verdict | Detail.
- **Workbook summary claims table** (if any): ID | Source | Claim | Verdict | Detail.

### 5.2 Row colour coding

| Condition | CSS class | Colour |
|---|---|---|
| `mutationResult == "NAME_ONLY"` (test in name only) | `.bad` | `#ff6a55` red |
| `verdict == "FAILS"` | `.bad` | `#ff6a55` red |
| `verdict == "UNVERIFIABLE"` | `.warn` | amber |
| `testFile == null` (unmapped test-plan claim) | `.warn` | amber |
| `verdict == "PARTIAL"` | `.warn` | amber |
| `mutationResult == "BASELINE_FAIL"` | `.warn` | amber |
| `mutationResult == "NO_SUCH_TEST"` (the mapped test name selects no test; fix the mapping) | `.warn` | amber |
| `mutationResult == "MUTATION_INVALID"` | `.warn` | amber |
| Everything else that is complete | `.ok` | `#52d6a4` green |

A `.bad` row with `mutationResult == "NAME_ONLY"` must also show the label
**"TEST IN NAME ONLY"** in bold red alongside the mutation result cell.

### 5.3 Design

Dark theme. IBM Plex fonts (with system fallbacks). Brass accent `#e4ad45`.
All CSS inline in a `<style>` block. No external URLs. No `<script>` tags.
The file must render correctly when opened from the filesystem with no network
access.

---

## § 6 -- plumbline-run.mjs Protocol

`plumbline-run.mjs` lives at `.bob/skills/plumbline/plumbline-run.mjs`.
**Bob runs it automatically** after Stage 3 (see § 3.4). The user may also
run it manually or in CI via `npm run run` (script added to `package.json`).

### What the runner does

Reads `.plumbline/claims.json` (falls back to `./claims.json`). For each row
where `mutation != null`:

1. **Baseline check:** runs the mapped test on the unbroken repository.
   - If the anchored name selects no test at all → records `NO_SUCH_TEST`. Node reports the test file itself as one passing test when a name pattern matches nothing, so the runner checks the name of the test that ran, not only the exit code.
   - If the baseline **fails** → records `BASELINE_FAIL` and skips the mutation.
2. Creates a throwaway git worktree **in the OS temp directory** (not inside the
   repo). This ensures relative imports in test files resolve against the
   worktree's own source tree, not the original:
   ```
   git worktree add <tmpdir>/plumbline-wt-<claimId>-<random> HEAD
   ```
3. Applies the `search/replace` mutation to `mutation.file` inside the worktree.
   - Throws `MUTATION_INVALID` if `search` text is not found or appears more than
     once (prevents silent no-ops and ambiguous patches).
4. Runs the test, **filtered to the exact test name**:
   ```
   node --test <testFile> --test-name-pattern "^<escaped-name>$"
   ```
   The child process has `NODE_TEST_*` env vars stripped so it does not inherit
   the parent test runner's context (which would return exit code 0 and produce
   a false `NAME_ONLY` result).
5. Records exit code:
   - Non-zero → `mutationResult = "CAUGHT"` (good: the test detected the mutation)
   - Zero → `mutationResult = "NAME_ONLY"` (bad: test in name only)
   - Worktree/spawn failure → `mutationResult = "ERROR"`
6. `git worktree remove --force <wtPath>` (in a `finally` block — always runs).

After all rows are processed, writes the updated `.plumbline/claims.json` and
regenerates `.plumbline/report.html` via `render-report.mjs`.

### Exported helpers (for tests and direct import)

`plumbline-run.mjs` exports: `loadClaims`, `saveClaims`, `applyMutation`,
`runTest`, `runBaseline`, `processRow`.

### Output files summary

All outputs live in `.plumbline/`:

| File | Written by |
|---|---|
| `.plumbline/claims.json` | Stages 1--4 (incrementally updated) |
| `.plumbline/report.html` | Stage 3.4, Stage 5, `plumbline-run.mjs` |

### Token-economy rules (summary)

- Stage 1: one `office_read mode:outline` + one `mode:text` per xlsx sheet.
  One `office_read mode:text` per docx/pdf.
- Stage 2: one subagent per test file.
- Stage 3: one subagent per test file (subagent never sees the test file).
  Bob runs `plumbline-run.mjs` before proceeding to Stage 4.
- Stage 4: batch clauses by topic; `execute_command` for git reads only.
- Stage 5: run `render-report.mjs`; no subagents.

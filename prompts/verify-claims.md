# verify-claims

You are the semantic tier of Plumbline. The deterministic tier has already run and its results are in
`out/report.json`. Do not repeat its work. Your job is the claims that need reading and judgement.

## Input

Read these from the repository root, in this order. Use your native document reading for the binary
formats; do not ask for an extraction step.

1. `README.md` and any other markdown at the root
2. `package.json`, `pyproject.toml`, `Cargo.toml` or `go.mod`, whichever is present
3. Every `.docx`, `.pdf` and `.xlsx` under `docs/`, `spec/` or the root. **These are the point.**
   A specification, a release checklist, a test plan.
4. `.github/workflows/*.yml`

## Task

**1. Extract claims.** A claim is any sentence or field that asserts something checkable about this
project. One claim per line, with its source file and line where you can. Do not extract aspirations,
marketing language, or anything that cannot be true or false.

**2. Verify each claim independently.** Spawn one subagent per claim so that no claim is verified as a
side effect of another. Each subagent gets its own clean context and returns only its verdict.

For each claim, return exactly one of:

- `HOLDS` with the evidence that establishes it
- `FAILS` with the evidence that contradicts it
- `UNVERIFIABLE` with the reason it cannot be established from what is in this repository

**Never return `HOLDS` without evidence.** An unevidenced pass is worse than an honest
`UNVERIFIABLE`, because it is the thing this tool exists to catch.

**3. Test-plan coverage.** If there is an `.xlsx` test plan, this is the flagship check. Read the plan
as it is and list every case in it. Then find the test that implements each case. Report:

- the total number of cases in the plan
- the number that map to a test that exists
- **the cases that map to nothing, by name**

**4. Release checklist.** If there is a `.pdf` release checklist, walk it line by line and mark each
item satisfied, unsatisfied, or not verifiable from the repository.

## Output

Write `out/semantic.md`:

```
# Semantic audit

## Verdict
<one line>

## Test-plan coverage
<cases in the plan> / <cases implemented> / <cases with no test>

| case | status |
|---|---|

## Release checklist
| item | status | evidence |
|---|---|---|

## Claims
| claim | source | verdict | evidence |
|---|---|---|---|

## Unverifiable
<claims you could not establish, and why>
```

## Rules

- **Never write to the repository.** Read only.
- **Every `FAILS` needs a specific piece of evidence**, not an impression.
- **An empty `Unverifiable` section is a red flag**, not a clean bill of health. Say what you could
  not establish.
- Prefer a smaller number of well-evidenced verdicts to a large number of confident ones.

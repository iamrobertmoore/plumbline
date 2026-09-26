<div align="center">

<img src="docs/brand/readme-banner.svg" alt="Plumbline: checks that your test plan, spec and README are still true, and proves it." width="900">

**Is your test plan still true? Plumbline has IBM Bob read the test plan, the spec and the release
checklist, find the test behind every claim, then break the code to prove the test is real.**

[Hosted checker](https://plumbline-smoky.vercel.app/check/) ·
[A real Plumbline report](https://plumbline-smoky.vercel.app/report/turnstile.html) ·
[The worked example, scored](examples/README.md) ·
[How Bob was used](docs/bob/SESSIONS.md) ·
[Slides](deck/plumbline-deck.pdf) ·
[How the number was measured](docs/MEASUREMENT.md)

</div>

---

## Check every claim here in five minutes

| Claim | How to check it |
|---|---|
| On the Turnstile sample, the test plan says all 84 automated cases pass. Bob found a test for 60 of them. | [`examples/turnstile/.plumbline/claims.json`](examples/turnstile/.plumbline/claims.json), or the [report](https://plumbline-smoky.vercel.app/report/turnstile.html) |
| 8 of those tests stay green when Bob breaks the behaviour they are named for, and each accusation carries a witness that proves the break | the report's first list; the witnesses are in `claims.json` |
| Bob found 4 of the 24 spec clauses and 4 of the 10 ticked checklist items false | the report's second row of tiles, one line of evidence each |
| Bob's audit agrees with an answer key written before Bob ran: 83 of 84 mappings, 24 of 24 spec clauses, 10 of 10 checklist items | `node examples/score.mjs` |
| The answer key is proved, not asserted | `node examples/answer-key/verify-ground-truth.mjs <clone> --self-test` flips every expectation and catches all 83 |
| Everything Bob does here was built with Bob during the event, in 8 tasks, for 30.23 of the 40 Bobcoins | [`docs/bob/SESSIONS.md`](docs/bob/SESSIONS.md), the exports in [`docs/bob/tasks/`](docs/bob/tasks/), the screenshots in [`bob_sessions/`](bob_sessions/) |
| 23 of the 100 most-starred installable repositories on GitHub owned by organisations fail a check against their own README | [`docs/MEASUREMENT.md`](docs/MEASUREMENT.md); two final runs, 23 and 22 |
| Paste any public repository and see its result | the [hosted checker](https://plumbline-smoky.vercel.app/check/) |
| Every figure on every surface agrees | `node facts/render.mjs --check`, and `--self-test` to prove the check can fail |

## The problem

I once shipped a project whose CI badge was green for days while it ran no tests at all. The job
skipped every test because it was waiting on a credential that did not exist. It passed, so nobody
looked.

A test plan is the same kind of promise, kept in a spreadsheet. Before a release somebody signs a
checklist that says every case in the plan has a passing test and the spec matches the code. Nothing
checks it. Coverage says a line ran, not that anything was asserted. Mutation testing scores a whole
suite at random and never reads the plan. Doc drift tools diff a commit and cannot see a claim that was
wrong from the day it was written.

## What Plumbline does

Plumbline is a **Bob custom mode and a Bob skill**. Copy [`.bob/`](.bob/) into a repository, open it in
IBM Bob, pick the **Plumbline** mode and ask it to audit the repository. It runs five stages:

1. **Read.** Bob reads the test plan (`.xlsx`), the spec (`.docx`) and the release checklist (`.pdf`)
   and turns every row, clause and ticked item into a claim, with its source cell or clause.
2. **Map.** One subagent per test file finds the test that proves each automated case, including tests
   whose names do not carry the case id. A case with no test is a finding, not a guess.
3. **Break.** For every mapped case, one subagent per test file writes a change to the code that makes
   the case's behaviour false. **It never sees the test.** It also writes a **witness**: a few lines
   that must pass on the real code and fail on the broken code. `plumbline-run.mjs` applies each change
   in a throwaway git worktree, checks the witness both ways, and runs the mapped test. A test that stays
   green while its witness proves the behaviour broken is a **test in name only**.
4. **Judge.** Bob judges every spec clause, checklist item and summary line against the code, the
   changelog and the git history, with one line of evidence each.
5. **Report.** A self-contained HTML report.

### What it found on Turnstile

Turnstile is a small authentication service I wrote for this, with its defects recorded in an
[answer key](examples/answer-key/GROUND-TRUTH.md) before Bob saw it. Its test plan says 100% of the 84
automated cases are covered and all pass, and its release checklist has all 10 items ticked.

- **24 of the 84 cases have no test.** Bob found a test for 60.
- **8 tests pass on broken code.** TC-41, "rejects an expired access token", asserts only that a
  result exists; delete the expiry check and it stays green. Two of the eight are real defects the
  answer key missed: TC-12's bad example fails on its capital letters, so the rule it is named for is
  never tested, and TC-42 passes when the refresh token is `undefined`.
- **The spec is wrong in 4 places**, including bcrypt (the code uses scrypt) and 15-minute access
  tokens (60 minutes since commit `1838534`, which the changelog does not mention).
- **4 of the 10 ticks are false**, including "the spec has been reviewed against the implementation".

The full score against the key is in [`examples/README.md`](examples/README.md).

### Why it does not accuse a test that does its job

Every mutation tester has the same weakness: a change that looks like a break but leaves the behaviour
intact. In my first run, 4 of the 12 surviving changes were like that. So an accusation needs proof. A
surviving change with no witness is reported as `UNPROVEN`. A witness that is not true on the real code
is `WITNESS_INVALID`. A change the witness shows did not break anything is `WEAK_MUTATION`. With every
witness removed, the same run makes **0** accusations.

The free half follows the same rule: every deterministic check ships with a negative control, and a
check that cannot be shown to fail is reported as unproven, never as a pass.

```
$ npx github:iamrobertmoore/plumbline --selfcheck
6/6 checks proved able to fail. Result: PROVEN.
```

## How IBM Bob is used

**Remove any one of these and the document tier stops working.**

| # | Bob feature | What it does in Plumbline | Where |
|---|---|---|---|
| 1 | **Custom mode** | the Plumbline mode: its role, and the tools it may use (read, edit, execute, skills, subagents, todo) | [`.bob/custom_modes.yaml`](.bob/custom_modes.yaml) |
| 2 | **Skills** | the five-stage procedure, the claim schema and the cost rules, loaded when the mode runs | [`.bob/skills/plumbline/SKILL.md`](.bob/skills/plumbline/SKILL.md) |
| 3 | **Document understanding** | reads the `.xlsx` plan and the `.docx` spec with `office_read`; for the `.pdf` checklist, which Bob's file tools could not read, Bob wrote a zero-dependency reader | `SKILL.md` §1.2 to §1.4, [`pdf-text.mjs`](.bob/skills/plumbline/pdf-text.mjs) |
| 4 | **Subagents** | one per test file to map cases to tests, and one per test file to write the mutations and witnesses, with the test file withheld | `SKILL.md` §2.2 and §3.2 |
| 5 | **Agent mode with commands** | runs the mutation runner and read-only git (`git log`, `git diff v2.2.0 v2.3.0`) to judge the spec and checklist | `SKILL.md` §3.4 and §4 |
| 6 | **Bob as the builder** | Bob planned and wrote the mode, the skill, the runner, the report renderer, the PDF reader and their tests, and ran every audit | [`docs/bob/SESSIONS.md`](docs/bob/SESSIONS.md) |

Remove Bob and the plan, the spec and the checklist are unread, nothing maps a claim to a test, and
nothing writes the counterexample. What is left is the free link checker.

**Reviewing Bob's work was part of using it.** Bob's first plan aimed each mutation at "the smallest
change that makes the named test fail", which would only ever confirm what a test already asserts; its
first runner could not tell a mistyped test name from a passing test; its first judging called a false
checklist tick "partial". Each correction is listed in [`docs/bob/SESSIONS.md`](docs/bob/SESSIONS.md),
with who fixed it. The small ones I fixed myself; the larger ones Bob fixed in a later task, from a brief I wrote.

## The free half: any repository, no Bob

The checks that need no judgement run without Bob: README links, file references, install commands,
published versions, licences, CI that cannot fail. They run in the hosted checker and on the command
line.

**23 of the 100 most-starred installable repositories on GitHub owned by organisations fail at least one
of them.** `react/create-react-app`'s README sends readers to its documentation at an address that has
not existed since the site moved. 12,269,541 stars between them, measured 25 Sep 2026. The method, the
corpus rule and all eighteen corrections I made to the checks are in
[`docs/MEASUREMENT.md`](docs/MEASUREMENT.md). The first pass said 89 of 100. That was wrong, in the
direction that flattered the tool, so I went through the findings by hand until the number survived.

```bash
npx github:iamrobertmoore/plumbline --repo .   # audit the current repository
npx github:iamrobertmoore/plumbline --selfcheck # prove every check can fail
```

Exits `0` on a pass or a warning, `1` on a blocker, `2` when a check cannot be shown to fail. Zero
runtime dependencies, Node 20 or later. The suite is `npm test` (86 tests); eleven reach the npm
registry and skip rather than fail offline.

## Business

| | |
|---|---|
| **Free** | The deterministic checks, hosted and in CI, for any repository. No Bob, no marginal cost. |
| **Paid** | **$20 per repository per month** for the document tier: the test plan, the spec and the checklist, every claim mapped and every test proved by breaking the code behind it. |
| **Who pays** | The release owner, the person who signs the checklist. |
| **Whose Bob** | The team's own Bob seat. Plumbline installs as a mode and a skill; the Bobcoins are the team's, and the $20 is for Plumbline. On the sample, tasks 04 to 08 (the audit of 90 cases, 24 clauses and 10 items, including every rerun and the skill improvements made along the way) cost 18.57 Bobcoins. |
| **What grows** | Repositories, then documents. It sits in the release path, so one repository leads to the rest. |

## What was built when

- **Before the event:** the free half (`src/`, the CLI, the negative controls), the measurement
  (`measure/`), the hosted checker, and the Turnstile sample with its answer key. None of it uses AI.
- **During the event, with Bob:** everything in [`.bob/`](.bob/), `test/plumbline-run.test.mjs`, and
  every audit of Turnstile. Eight Bob tasks, each exported to [`docs/bob/tasks/`](docs/bob/tasks/) with
  a screenshot of its Bobcoin cost in [`bob_sessions/`](bob_sessions/).

## Honest limitations

- **The sample is mine.** Turnstile was written for this, so the answer key could be written before Bob
  ran. That is what makes Bob's result checkable; it also means it is one repository. Bob found two
  defects the key had missed, which is some evidence the key did not flatter it.
- **Bob can miscount in prose.** Twice it wrote a count its own file contradicted. Counts in the report
  now come from a script, and the skill says so.
- **One mapping differs from the key.** Bob declined to map TC-43 to a test that does not test it; the
  key maps it and marks it a test in name only. Both flag it, differently.
- **The free-tier number is a snapshot.** Links rot and servers time out; the figure carries its date
  and its spread.

## Data used

No personal information, client data or social media. The Turnstile sample and every name in it are
invented (addresses are on the reserved `example` domain). The free tier and its measurement read
public data only: GitHub's REST API and raw file host (repository metadata, READMEs and file trees of
organisation-owned repositories), the npm registry, and the URLs those READMEs link to.

## Licence

MIT. See [LICENSE](LICENSE).

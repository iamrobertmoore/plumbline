<div align="center">

<img src="docs/brand/readme-banner.svg" alt="Plumbline: 22 of the 100 most-starred installable repositories on GitHub fail at least one check." width="900">

**A pre-ship auditor. It checks whether your repository does what it says it does.**

[Live report](https://iamrobertmoore.github.io/plumbline/) ·
[Slide deck](deck/plumbline-deck.pdf) ·
[Architecture](docs/architecture.svg) ·
[How the number was measured](docs/MEASUREMENT.md) ·
[Run it in CI](.github/workflows/plumbline.yml)

</div>

---

## The problem, measured

**I checked the 100 most-starred installable repositories on GitHub against their own claims.
22 of them fail at least one check.**

That is 14,304,526 stars of software. These are the best-maintained, most-read READMEs in public
existence, and one in five still describes itself inaccurately right now.

Measured 15 Sep 2026. Method, corpus, and every correction I made to the checks are in
[`docs/MEASUREMENT.md`](docs/MEASUREMENT.md). The first pass said 89 of 100. That was wrong, and it
was wrong in the direction that flattered the product, so I went back through the findings by hand
until the number survived scrutiny.

| What the repository claims | What is actually true | How many, of 100 |
|---|---|---|
| the links in the README work | 13 have links that return 404 or 410 | **13** |
| the README points at files that exist | 3 link to files that are not in the repository | **3** |
| the version in the manifest is published | 3 disagree with the registry | **3** |
| the licence shows in the About panel | 1 has a licence file GitHub cannot detect | **1** |
| the install command names a real package | 1 names a package that does not exist | **1** |
| a version named in the README exists | 1 names a version that was never published | **1** |

## The person this is for

It is the hour before you ship. You think you are finished. Nobody has read your README since you
wrote it, your CI has been green for a month, and the demo link in it was renamed in March.

Green is not the same as true. Nothing in a normal pipeline reads what the documentation claims and
goes and checks. So the claims rot quietly, and the first person to find out is a user.

## What it does

Plumbline reads everything a project says about itself. The README, the manifest, and the documents
a real team keeps: the specification, the release checklist, the test plan. It treats all of that as
a set of **claims**, then tests each one against reality, in parallel, with one subagent per claim.

It does not tell you whether your code works. It tells you every place your project says something
that is not true, ordered by what a reader would hit first.

### Try this, watch what happens

| | |
|---|---|
| **See a real finding** | [The report on ruvnet/RuView](https://iamrobertmoore.github.io/plumbline/#finding). Its README links the same architecture decision record twice, to two different filenames. One exists. One never has. |
| **Check the tool, not the claim** | [The negative controls](https://iamrobertmoore.github.io/plumbline/#controls). Every check is run against an input designed to fail it. A check that cannot fail is reported as unproven, never as a pass. |
| **Run it on your own repo** | `npx github:iamrobertmoore/plumbline --repo .` |

## Why it is not a bundle of linters

Every check above has a tool that does something similar. Link checkers exist. Version drift tools
exist. What none of them do is **prove their own checks can fail**, and that is the whole point.

A check that has never been observed to fail is not evidence. I have shipped a green CI badge that
was doing nothing at all: a conformance job that ran nightly for days and skipped every test, because
it gated on a credential that did not exist. It passed, so nothing drew attention to it. I found it
on submission day.

So every check in Plumbline ships with a **negative control**. Before it is allowed to report a pass,
it is run against an input built to fail it. If the check does not fail, the result is `UNPROVEN` and
the run exits non-zero.

```
$ npx github:iamrobertmoore/plumbline --selfcheck
6/6 checks proved able to fail. Result: PROVEN.
```

## How IBM Bob is used

Four of Bob's capabilities do real work here, and none of them is decoration.

- **Document understanding.** The claims come out of real documents, not just markdown. Bob reads
  `.docx`, `.pdf` and `.xlsx` as they are, so a specification, a release checklist or a test plan can
  be the source of a claim. The flagship check is test-plan coverage: every case in the `.xlsx` plan
  traced to a test that exists, and a list of the ones nobody wrote. No existing tool can do that,
  because no existing tool reads the plan.
- **Subagents.** One subagent per claim, each with its own clean context, so nothing gets checked by
  accident while something else is being checked.
- **Parallel tasks.** Claims that do not depend on each other are checked at the same time, so a
  hundred-repository corpus does not have to queue up.
- **Agent mode.** Runs the whole thing, decides what is left to check, and writes the result.

The half of the tool that needs no judgement has **no Bob dependency at all** and runs in CI on every
push. If Bob is not available, those claims are reported as **unverified**, never as passing.

## Architecture

![Architecture](docs/architecture.svg)

## Run it

```bash
npx github:iamrobertmoore/plumbline --repo .   # audit the current repository
npx github:iamrobertmoore/plumbline --selfcheck # prove every check can fail
npx github:iamrobertmoore/plumbline --repo . --format json --out r.json
```

Exits `0` on pass, `1` on a failed check, `2` when a check cannot be shown to fail.

Zero runtime dependencies. Node 20 or later. Reads the repository, writes nothing.

The suite is `node --test test/*.test.mjs` (33 tests). Three of them reach the npm registry;
those skip rather than fail when the network is down.

A claim the tool cannot observe is reported as **not observable**, never as a pass and never as a
failure. If the About panel cannot be seen, or a package name on the registry turns out to belong to
a different project, Plumbline says so and moves on. It does not guess, and it does not accuse.

> **On the package name.** `plumbline` on npm is an unrelated Angular component-testing utility
> (v10.0.9, last published 2022), so `npx plumbline` installs the wrong tool. Until this is published
> under a name that is free, the `github:` form above is the correct way to run it.

## Honest limitations

- **A failing check is not broken software.** A dead link in a README does not stop anyone installing
  the package. That is precisely why these defects survive: no test looks at what the docs claim.
- **The number is a snapshot.** Links rot and versions move. It carries its date for that reason.
- **The corpus is not a random sample of GitHub.** It is deliberately the strongest end, so 22% is a
  floor rather than an average.
- **CI checks that can silently pass are reported as warnings, not failures.** 47 of the 100 have a
  workflow containing `|| true`, `if: false`, or a step gated on a secret that may not exist. That is
  worth knowing, but `continue-on-error` on a docs job is a deliberate choice, not a lie, so it is
  not counted in the headline.

## Licence

MIT. See [LICENSE](LICENSE).

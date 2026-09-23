# How the headline number was measured

The claim on the front page is:

> **23 of the 100 most-starred installable repositories on GitHub fail at least one check.**
>
> Measured 23 Sep 2026. **Four full runs the same afternoon returned 22, 26, 23 and 22**, and the published
> count is the set confirmed by hand rather than the output of any one of them. The spread is the
> network's: the corpus-side quantities are identical to the digit in every run, and the outcome
> of each individual link is not. Section "The result" shows both.

Measured 17 Sep 2026, re-measured 23 Sep 2026. This document is the method, including every correction
I made to the checks along the way, because a measurement that only reports its final answer cannot be
audited.

---

## The corpus

The 100 most-starred repositories on GitHub that ship an installable package manifest. The selection
rule is four steps with no judgement in any of them:

```bash
# 1. the 200 most-starred repositories on GitHub
gh api "search/repositories?q=stars:%3E5000&sort=stars&order=desc&per_page=100&page=1"
gh api "search/repositories?q=stars:%3E5000&sort=stars&order=desc&per_page=100&page=2"

# 2. drop the archived ones
# 3. drop the ones with no package.json, pyproject.toml, Cargo.toml, go.mod, setup.py,
#    pom.xml, Gemfile or composer.json at the repository root
# 4. take the first 100 of what is left, still in star order

node measure/verify-corpus.mjs     # check the frozen corpus against that rule
```

**Composition:** 65 npm, 25 Python, 4 Go, 3 Rust, 2 setup.py, 1 Maven.
**14,304,526 stars between them.**

**The corpus cannot be rebuilt, and that is stated rather than hidden.** Stars drift by a few hundred
a day at this end of GitHub, so step 1 returns a different 200 every time it runs. The artefact is
`measure/corpus.json`, captured 17 September 2026; the query is how it was made. `measure/CORPUS.md`
records the rule, what is preserved, and the one thing that is not: page 2 of the source response,
which 45 of the 100 entries came from and which no longer exists in that state. Anyone who disagrees
with the selection can read the rule, run it, and get a corpus of their own to compare against.

`measure/verify-corpus.mjs` checks the frozen file rather than rebuilding it: star order, every entry
installable, none archived, the summary fields agreeing with the lists they summarise, and the star
total and composition matching the figures on this page. `--self-test` mutates a copy eight ways to
prove each check can fail, because a check that cannot fail is not a check.

These are the best-maintained, most-scrutinised repositories in public existence. Millions of people
read these READMEs. If they fail a check, that is a floor for the ecosystem, not a ceiling, and the
sample cannot be accused of being chosen to look bad.

---

## What each check asserts

| check | the claim being tested | how it is tested |
|---|---|---|
| `link.relative` | every path the README links to exists | against the repository's own file tree, fetched in full |
| `link.external` | every URL the README links to resolves | HTTP, and **only a 404 or 410 counts as gone** |
| `manifest.version` | the version in the manifest is the published version | against the npm registry, today |
| `install` | the install command names a real package | against the registry |
| `license.claimed` | the licence is one GitHub can show in the About panel | the API's own `license` field |
| `readme.versions` | a version named in the README is published | against the published version list |
| `readme.present` | there is a README at all | the file tree |

Those names are the ones the tool itself uses. Run `plumbline --selfcheck` and it prints six of them,
each with the input it accepts and the input it must reject. The other two are harness-side:

- **`readme.present` is a precondition**, not a claim. Nothing else can be evaluated on a repository
  with no README, so it is reported first and separately.
- **`readme.versions` is measured here and not exposed by the CLI.** It is the check that a version
  named in a README is actually published, and it found nothing in this corpus: the repositories that
  name versions are the ones whose registry entry is guarded as belonging to a different project, so
  it skips rather than asserts. It is kept because it is the one check whose absence would flatter the
  number, and a check that is skipped everywhere should be visible as skipped.

**And the harness does not evaluate `ci.claimed`**, the sixth shipped check. CI that cannot fail is a
warning tier rather than a failure, so it is measured separately by `measure/ci-warnings.mjs` and
reported outside the headline. The harness used to label its rows with its own names, which meant the
published method described seven checks that appeared nowhere in the published tool. It now uses the
tool's ids, so there is one name for each check and no mapping to get wrong.

---

## The corrections

**The first pass said 89 of 100.** That was wrong, and it was wrong in the direction that flattered
the tool, which is the failure mode that matters. Thirteen corrections follow. Five came from
re-checking a finding by hand, one from trying to reproduce the number from the shipped code rather
than from the harness that produced it, one from reading this document against the tool's own output,
one from cross-checking the deck against the harness JSON, and five from an adversarial review of the
repository and a hand-check of what it found, on 23 September:

**1. The file tree was capped at 6,000 entries.** 34 of the 100 repositories exceed that. A path past
the cap looked identical to a path that does not exist. Fixed by fetching the tree per repository with
no cap, and refusing to run the check when GitHub reports the tree truncated.

**2. Relative links were mis-parsed.** Autolinks, `irc:` and `mailto:` targets, query strings, leading
slashes and paths containing `|` were all treated as filesystem paths. **This check went from 22% to
3%**, the largest single correction.

**3. A private manifest is a workspace root, not a published package.** 9 of 16 version flags were
false positives for this reason, plus a case where the repository is a v2 branch of a package whose
npm name now belongs to v3. Fixed by skipping `private: true` and requiring the registry's own
`repository` field to point back at the repository before comparing at all. A name collision is not a
finding. **This check went from 16% to 3%.**

**4. `HEAD` was trusted.** Some servers answer `HEAD` with 404 and serve the same URL fine on `GET`.
Re-testing a sample of twelve flagged links with a real `GET` found three that returned 200. Fixed by
using `HEAD` only as a cheap positive and confirming any non-2xx with a `GET`.

**5. Three of the four corrections had never been carried into the tool.** Found on 17 September,
while reproducing this measurement from the shipped code rather than from the harness that produced
it. Correction 2 (query strings), correction 3 (the registry `repository` guard) and correction 4
(`HEAD`/`GET`) were all applied here and then not applied in `src/`. **The published number was right
and the published tool was not**, which is not a distinction anyone outside would have noticed.

It also means the shipped tool was making three classes of false accusation, and a false accusation is
the one thing this tool must never produce:

- a relative link carrying a query string, e.g. `images/x.png?WT.mc_id=abc`, was reported as pointing
  at nothing. Marketing parameters on relative links are everywhere.
- a link that climbs out of the repository, e.g. `../../releases`, was reported as an escape. On
  GitHub that resolves to the repository's own releases page, and it is correct. The file tree cannot
  answer a question about GitHub's URL space, so it is now reported as not observable.
- **any URL whose server answers `HEAD` with a 404 and serves `GET` with a 200 was reported dead.**
  Four in this corpus alone, and all four were confirmed returning 200 with the tool's own user agent:

  ```
  HEAD=404  GET=200   https://support.google.com/chrome/answer/95346
  HEAD=404  GET=200   https://bsky.app/profile/angular.dev
  HEAD=404  GET=200   https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright
  HEAD=404  GET=200   https://get.neon.com/VqfnMo4
  ```

All three are fixed in `src/`, each with a regression test. The `HEAD`/`GET` tests run against a local
HTTP server, so they prove the behaviour offline rather than depending on a real host happening to
misbehave on the day. The harness now imports the shipped checks and the shipped path rule instead of
re-implementing them, because while those rules lived in two places they disagreed and the figure
moved.

**6. A link inside a code span is not a link.** Found on 17 September, by checking one of the three
relative-link findings by hand and discovering that the path was not in the README at all. Graphify's
README documents its own parser with `` `[text](./other.md)` `` inside backticks. That is an example of
markdown syntax, written to explain what the tool parses. Plumbline read it as a link, found no
`other.md` in the repository, and reported the project for pointing at a file it had never written.

This is the worst class of defect this tool can have. It is a false accusation, stated with
confidence, against a repository that had done nothing wrong, and it is precisely the failure the tool
exists to argue against. Fixed by running both link passes against a copy of the README with fenced
blocks and inline code spans blanked out. The copy keeps every newline and its length, so two URLs that
were never adjacent cannot become adjacent and invent a link between them.

**7. The harness named the checks something the tool has never called them.** Found on 17 September,
by reading this document against the tool's own output rather than by checking any finding.
`measure/audit.mjs` called the shipped checks but labelled its rows `readme_external_links_resolve`,
`manifest_version_published`, `license_detectable` and four more, and the tables above published those
names. Run `--selfcheck` and the tool prints `link.external`, `manifest.version`, `license.claimed` and
three more. **Seven published check names appeared nowhere in the published tool**, and this document
claimed the harness "runs the same checks the tool runs". The harness now reports under the tool's ids.
Proved label-only rather than asserted: re-running the whole corpus returns the same 18, the same
14,304,526 stars, the same per-check counts and the same failing set repository for repository, and
every difference between the two runs is a name. The two rows that genuinely are harness-side
(`readme.present`, a precondition, and `readme.versions`, a claim type the CLI does not expose) and the
one the harness does not evaluate (`ci.claimed`) are now stated rather than left to be noticed.

**8. The deck quoted figures from a run that does not exist, and this document published a variable as
a constant.** Found on 17 September, by cross-checking the deck's measured panel against the harness
JSON rather than against the prose. The deck said **542 s** and **1,850 links**. No run produces either.
The counts for the run being described were 1,667 external links, 251 badges and 1,644 relative links,
and the wall clock has measured 273, 283, 293, 298 and 336 seconds across five runs. **The counts are
stable and the timing is not**, so the panel now leads with the count and states the time as a range.
The counts in this paragraph are the capped ones, from before correction 10; the current figures are in
The result below.

Checking that also caught a figure in this document. The **unreachable** count was published as 53, and
53 is not a constant. It measured **53, 57 and 64** across three consecutive runs, because an
unreachable link is almost always a timeout rather than a statement about the repository. It is now
reported as a range, and the distinction between the figures that move and the figures that do not is
stated rather than left implicit.

**9. The shipped tool dropped two kinds of link claim in silence.** Found on 23 September by an
adversarial review of the repository, and confirmed by reading the dispatch rather than the prose.
`audit()` looked a claim's check up directly by the claim's id and did `continue` when it found
nothing. Two of the ids the parsers emit are external links, `link.bare` (a bare URL in prose) and
`manifest.homepage` (a manifest's homepage field), and neither had a check registered under its own
name, so both were discarded without a word.

**This moved the tool and not the number, and the distinction is the point.** The harness selects links
on `kind === 'link'` rather than on the id, so it had been testing those URLs all along.
`denoland/deno` and `localsend/localsend` failed this corpus on 17 September for exactly those URLs,
`https://crates.io/crates/deno` and a 410 from a delisted store listing, and were counted. What was
wrong is that running the **tool** on the same repository reported nothing. A repository could pass the
CLI and fail the measurement.

That is correction 5's defect recurring in a place nobody had looked, and it is fixed structurally
rather than patched: there is now an explicit `CHECK_FOR` map, an explicit `UNCHECKED` map for claims
nothing answers, and an unmapped claim is reported rather than dropped. `test/mapping.test.mjs` fails if
a parser gains an id that no map mentions, and it checks that in both directions, so dead map entries
are caught as well as missing ones. The `manifest.homepage` route has its own end-to-end test against a
local server, because the two ids reach the dispatch by different routes: with the map entry removed,
the bare-URL test still passes and the homepage test fails.

**10. The harness capped external links at 25 per repository and did not say so.** Found on 23
September, in the same review. 21 of the 100 repositories assert more external links than that, so for
those the READMEs were only partly tested and the published link figure was an undisclosed lower bound.
A bound is where a silent truncation hides, so the cap is gone by default and a cap that is set is
printed with the run.

Removing it changed the answer, which is how it was found to matter: **Eleven repositories the capped run cleared now fail**, on links that were never tested, and two
more gained an extra failing check on top of the one they already had. repositories
that the capped run cleared now fail, on links that were never tested. The cost is one slow repository.
Most READMEs in this corpus yield under 50 external links, `vinta/awesome-python` yields 543 and
`avelino/awesome-go` yields 3,248, and a curated link list is exactly where dead links accumulate, so
truncating one is the last place to save time.

**11. The client did not look like a reader, and one server answered it accordingly.** Found on 23
September, while hand-checking the dead links the uncapped run reported. `nodejs/node`'s README links
to `https://ibm.com`, and the tool called it a 404. A browser gets 200.

The cause is a header. Node's `fetch` sends `Accept-Language: *` on its own, and IBM's geo-router cannot
resolve a locale from a literal `*`, so it emits a redirect to `https://www.ibm.com/gb-*`, which 404s.
Name a language and the same request resolves to the locale page and returns 200. Isolated by testing
one header at a time: `Accept` alone does not fix it, a browser user agent does not fix it,
`Accept-Language` alone does.

**The question this check asks is whether the link works for the reader**, and the reader is a browser.
A request that looks nothing like one is entitled to a different answer, so the client now sends
`Accept-Language` and a browser-like `Accept`. The user agent stays the tool's own, because a site that
blocks this agent answers 403 and 403 reads as unverifiable rather than as dead, so identifying honestly
costs nothing here.

This is correction 4's class again: a check producing an accusation the evidence does not support. It is
also the second time the fix came from testing a **local HTTP server** rather than a live host, because a
real host misbehaving on the day is not a reproducible test. The regression test rejects `*` as well as
an absent header, and that detail matters: the first version of the test only rejected absence, so it
passed with the fix removed and proved nothing. A check has to be able to fail for the reason it claims.

**The count fell from 30 to 22 when the headers went in.** That is the measure of how much the
check had been over-reporting, and it is worth being exact about the direction: correction 10 moved the
figure up because a bound was hiding failures that were really there, and correction 11 moved it down
because the client was inventing failures that were not.

**12. A registry that would not answer was reported as a package that does not exist.** Found on
23 September by running the whole corpus twice and **diffing the two results** rather than reading
either. `openclaw/openclaw` failed on `install` in one run and passed in the other, with nothing about
the repository changing between them.

The cause was one line in `npmLatest`: any non-ok response returned `missing`, and `install` reports
`missing` as `README says "npm install X"; no such package`. That check is a **blocker**, so a throttled
lookup was the loudest thing the tool can say, said about a repository that may be entirely fine. The
registry throttles this tool specifically, because it asks about every install command in every README
it reads.

`manifest.version` already had the guard and `install` did not, and the two are putting the same
question to the same registry. Only a **404** now means a package is not published. A 429, a 503 or a
timeout is reported as the registry not answering, and the check skips rather than asserts. Three
regression tests pin it: 429 and 503 must skip, and a genuine 404 must still fail, because a guard that
turns a blocker into a silence is a different defect from the one it fixes.

**13. A link that could not be reached was counted as a link that works.** This is why the two runs
disagreed, and it is correction 10's shape in a different costume.

Run the corpus twice on the same day, with the same code and the same corpus, and the answers were
**22 and 26**. The difference was not in the parsing: every repository tested exactly the same number of
links in both runs. It was in how many of those links answered. In the run that returned 22, **53 links
across the corpus were unreachable and therefore never tested**; in the run that returned 26, they
answered, and some of them were dead.

An unreachable link is not evidence of a defect, so it must not be reported as a failure. It is also not
a pass, and the harness had been letting a repository with unreachable links count as clean, which is
the cap's defect again: a bound nobody reported, hiding whatever is past it. The harness now names a
third category, **not fully tested**, prints it beside the count, and lists the repositories in it, so a
reader can tell a complete pass from an incomplete one. That is also why the headline carries its run
date: at this scale the figure measures the corpus **and the network on the day**.

**The headline moved 89 → 47 → 30 → 22 → 19 → 18 → 30 → 22.**
Corrections 1 to 4 produced the 22. Correction 5, carrying three of those corrections into the shipped
tool, produced the 19. Correction 6, the code-span false accusation, produced the 18. **Corrections 7, 8
and 9 moved no figure at all, and that is what made them worth writing down:** all three were defects in
how the result was described or reported, and a description defect cannot show up in a result.

**One step in that sequence is not a correction at all.** The move from 18 to 19 happened on
23 September with no change to the method: `affaan-m/ECC` published `2.2.2` to its manifest while npm's
registry still served `2.2.1`, between the two runs. The corpus is frozen; the repositories are not.
That is the defect this tool exists to find, appearing in the wild during the measurement period, and it
is worth separating from the corrections because a figure that moves for that reason is evidence rather
than error.

**Corrections 10 and 11 are the only two corrections that moved the number, and they moved it in
opposite directions.** Correction 10 removed a cap that had been hiding failures, and the figure rose.
Correction 11 removed a false accusation that had been inventing them, and the figure fell. Both are
worth stating plainly, because "the number went up" and "the number went down" are not findings on their
own: what matters is which direction the evidence supported, and these two are the cleanest illustration
in this document of why a tool's error rate has to be measured in both directions at once.

---

## The result

| check | repositories failing, of 100 |
|---|---|
| `link.external` | 17 |
| `manifest.version` | 4 |
| `readme.versions` | 1 |
| `link.relative` | 2 |
| `license.claimed` | 1 |
| `readme.present` | 1 |
| **at least one of the above** | **23** |

`install` found nothing in this corpus. `ci.claimed` is not evaluated here. The six rows above are the
six that produced a failure, and they are listed in full rather than trimmed to the interesting ones,
because a method that shows only its hits cannot be audited.

Behind those six rows: **9,351 external links fetched and tested**, of which **66 are gone**. **64** of those were found by the confirmation run; the other two are the two dead links in `microsoft/generative-ai-for-beginners`, which that run could not reach and a hand check confirmed are 404. A
further **364 are badges**, which are skipped rather than asserted, because a shields.io badge is an
image whose 404 is not a claim the README makes. **1,650 relative links** were checked against the
repositories' own file trees, making **11,001 links** in total. Two repositories report their tree
truncated, so their relative links are reported as not observable rather than guessed at.

**Some of these numbers move between runs and some do not, and the difference matters.** The
quantities that come from the corpus are **identical to the digit** in every run: **9,715 links found,
9,351 external links checked, 364 badges, 1,650 relative links**. The quantities that describe the
network are not. Across the runs that recorded them:

| quantity | run A | run B | run C | run D |
|---|---|---|---|---|
| gone | 58 | 62 | 64 | 64 |
| unreachable | 3,450 | 2,773 | 3,036 | 3,116 |
| repositories not fully tested | | | 37 | 41 |

**They are not even a conserved split of the same set.** 58 + 3,450 is 3,508, 62 + 2,773 is 2,835,
64 + 3,036 is 3,100, and 64 + 3,116 is 3,180. A link that times out in one run can answer 404 in the
next, and only the 404 is a finding, so **the headline moves with the network**. The wall clock moves
for the same reason and is reported as a range.

**The stable part is worth stating precisely, because it is stronger than it looks.** The set of
repositories that fail is not arbitrary: two of the four runs returned **the same 22 repositories,
repository for repository**, and every other run returned those same 22 plus one or more. So 22 is a
floor that no run has ever gone below, and the count published here is what a hand check adds to it.
An earlier version of this document quoted the unreachable count as a single figure and described the
gone count as stable, and **both were samples of a variable wearing the costume of a fact**.

**A sample of the gone links was re-confirmed by hand with a real `GET`**, following redirects,
with a browser user agent and an explicit `Accept-Language`. Every one checked came back the same
status the harness reported: `pythonware.com/products/pil/`, `kubernetes.io/case-studies/`, the
Storybook toolbar path, `docs.n8n.io/sustainable-use-license/` and `u.ant.design/reproduce` are hard
404s, and `localsend/localsend`'s store listing is a 410 from a delisted app. The `ecc-universal`
version page is the one worth reading: it is a 404 because **2.2.2 is not on npm**, which is the same
fact `manifest.version` reports from the other direction. **Both relative-link findings were confirmed
against the GitHub contents API.**

**Two independent runs do not produce the same number, and this document used to say they did.** The
first pair that was compared, on the code before corrections 12 and 13, returned **22 and 26**, with
`link.external` at 16 against 19 and four repositories differing in the failing set. Three of those four
differences were network artefacts and are now guarded: a registry throttle that read as a missing
package (correction 12), and two links that answered in one run and 404ed in the next.

**The pair that was compared on the shipped code returned 23 and 22, and the difference between them is
one repository.** Both runs returned the **same 22 repositories**, repository for repository. The 23rd
is `microsoft/generative-ai-for-beginners`, which fails whenever its links can be reached and passes
when they cannot, because it has 32 links that time out together. So the figure is published as a count
with its spread, and the spread is **22 to 26** over four full runs. **A run prints a candidate set. The
count here is the candidate set confirmed by hand**, which is the same rule the rest of this document
follows.

**Reported separately, not in the headline.** Across the **1,768 workflow files** in these 100
repositories, **6 have a step or job marked `if: false`**, which can never run, and **55 have a step
marked `continue-on-error`**, whose failure does not fail the job. Three repositories have no GitHub
Actions workflows at all, because they use another CI system. This is a warning tier rather than a
failure: `continue-on-error` on a docs job is a deliberate engineering choice, not a lie.

Reproduce it with `measure/ci-warnings.mjs`. **An earlier version of this figure said 47, and it was
wrong.** It counted any `|| true`, which appears legitimately inside command substitution
(`candidate="$(find ... || true)"`), at the end of best-effort cleanup (`gh pr merge ... || true`), and
inside a comment explaining why a workflow does **not** use it. The pattern was measuring "CI that
mentions `|| true`" and reporting it as "CI that cannot fail". It was narrowed to the two cases that
are unambiguous from the file alone.

---

## What this number does not say

- **It is a snapshot.** Links rot and versions move. The figure carries its date for that reason.
- **Failing a check is not broken software.** A dead link in a README does not stop anyone installing
  the package. That is exactly the point: these are the defects that survive every existing quality
  gate, because no test reads what the documentation claims.
- **The corpus is deliberately the strongest end of GitHub**, not a random sample.

---

## The example used in the demo

`ruvnet/RuView`. Its README links the same architecture decision record twice:

```
[ADR-079](docs/adr/ADR-079-camera-ground-truth-training.md)      exists
[ADR-079](docs/adr/ADR-079-camera-supervised-pose-finetune.md)   never existed
```

One document, one README, two filenames, one invented. Confirmed against the GitHub contents API.

---

## Reproducing

The harness ships with the tool and reports under the same check ids, so a row here and a row from
`--selfcheck` name the same thing:

```bash
GH_TOKEN=$(gh auth token) node measure/audit.mjs            # the whole corpus, about fifteen minutes
GH_TOKEN=$(gh auth token) node measure/audit.mjs --only 8   # a pilot, first eight repositories
GH_TOKEN=$(gh auth token) node measure/audit.mjs --out r.json
```

`measure/corpus.json` is the 100 repositories and their metadata. `measure/audit.mjs` imports the
checks from `src/` rather than re-implementing them, so the link parsing and the registry rules are
the shipped ones and cannot drift away from them. What it does not do is evaluate all six: `ci.claimed`
is measured by `measure/ci-warnings.mjs` instead, and `readme.versions` is a claim type the CLI does
not expose. Both are stated above rather than left for a reader to notice. The one exception is the relative-path check, which
the shipped version answers against the local filesystem and the harness answers against GitHub's file
tree, because the repository is remote.

It needs network access: GitHub for the file trees and the READMEs, npm for the version lookups. It
reads only, and writes nothing unless you pass `--out`.

What it prints is a **candidate** set. Every candidate was then confirmed by hand, and the corrections
above name exactly what that pass changed. A harness that reports its own answer without being checked
is the thing this whole project is about.

The numbers move as links rot and versions are published, which is why the figure carries its date. A
re-run today will not return exactly this set.

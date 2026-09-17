# How the headline number was measured

The claim on the front page is:

> **18 of the 100 most-starred installable repositories on GitHub fail at least one check.**

Measured 17 Sep 2026. This document is the method, including every correction I made to the checks
along the way, because a measurement that only reports its final answer is not reproducible.

---

## The corpus

The 100 most-starred repositories on GitHub that ship an installable package manifest.

```bash
# 1. the 200 most-starred repositories on GitHub
gh api "search/repositories?q=stars:%3E5000&sort=stars&order=desc&per_page=100&page=1"
gh api "search/repositories?q=stars:%3E5000&sort=stars&order=desc&per_page=100&page=2"

# 2. from those, the first 100 that are not archived and carry one of
#    package.json, pyproject.toml, Cargo.toml, go.mod, setup.py, pom.xml,
#    Gemfile, composer.json at the repository root
```

**Composition:** 65 npm, 25 Python, 4 Go, 3 Rust, 2 setup.py, 1 Maven.
**14,304,526 stars between them.**

These are the best-maintained, most-scrutinised repositories in public existence. Millions of people
read these READMEs. If they fail a check, that is a floor for the ecosystem, not a ceiling, and the
sample cannot be accused of being chosen to look bad.

---

## What each check asserts

| check | the claim being tested | how it is tested |
|---|---|---|
| `readme_relative_links_resolve` | every path the README links to exists | against the repository's own file tree, fetched in full |
| `readme_external_links_resolve` | every URL the README links to resolves | HTTP, and **only a 404 or 410 counts as gone** |
| `manifest_version_published` | the version in the manifest is the published version | against the npm registry, today |
| `readme_versions_exist` | a version named in the README exists | against the published version list |
| `install_command_resolves` | the install command names a real package | against the registry |
| `license_detectable` | the licence is one GitHub can show in the About panel | the API's own `license` field |
| `readme_present` | there is a README | the file tree |

---

## The corrections

**The first pass said 89 of 100.** That was wrong, and it was wrong in the direction that flattered
the tool, which is the failure mode that matters. Four defects were found by re-checking findings by
hand:

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

**The headline moved 89 → 47 → 30 → 22 → 19 → 18.** Corrections 1 to 4 produced the 22. Correction 5,
carrying three of those corrections into the shipped tool, produced the 19. Correction 6, the code-span
false accusation, produced the 18. **Every move has been downward, and every move has been the removal
of an accusation the evidence did not support.** That is the only direction this number should ever
move, and it is worth being explicit about why: a tool that finds more problems when you fix it is
finding problems that were not there.

---

## The result

| check | repositories failing, of 100 |
|---|---|
| `readme_external_links_resolve` | 11 |
| `manifest_version_published` | 3 |
| `readme_relative_links_resolve` | 2 |
| `license_detectable` | 1 |
| `readme_present` | 1 |
| **at least one of the above** | **18** |

Behind those five rows: **1,667 links fetched and tested**, of which **21 are gone** and **53 could
not be reached at all**. A further **251 are badges**, which are skipped rather than asserted, because
a shields.io badge is an image whose 404 is not a claim the README makes. **1,644 relative links** were
checked against the repositories' own file trees. Two repositories report their tree truncated, so
their relative links are reported as not observable rather than guessed at.

**All 21 gone links were re-confirmed by hand with a real `GET`**, following redirects. 20 are hard
404s and one is a 410 from a delisted store listing. **All three relative-link findings were confirmed
against the GitHub contents API**, and one of them is the correction 6 story below: the first version
of this pass reported three, and the third was not real.

**Two independent runs of the shipped code produce the same answer.** Both audited all 100
repositories, both reported no errors, and both returned the same 18, the same per-check counts, the
same 21 gone links and the same failing set, repository for repository. That is the property this
number was missing. Until it was measured, a reader had no way to tell a move caused by the corpus
from a move caused by the tool, and the two happened together four times.

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

The harness ships with the tool, and it runs the same checks the tool runs:

```bash
GH_TOKEN=$(gh auth token) node measure/audit.mjs            # the whole corpus, about ten minutes
GH_TOKEN=$(gh auth token) node measure/audit.mjs --only 8   # a pilot, first eight repositories
GH_TOKEN=$(gh auth token) node measure/audit.mjs --out r.json
```

`measure/corpus.json` is the 100 repositories and their metadata. `measure/audit.mjs` imports the
checks from `src/` rather than re-implementing them, so the link parsing and the registry rules are
the shipped ones and cannot drift away from them. The one exception is the relative-path check, which
the shipped version answers against the local filesystem and the harness answers against GitHub's file
tree, because the repository is remote.

It needs network access: GitHub for the file trees and the READMEs, npm for the version lookups. It
reads only, and writes nothing unless you pass `--out`.

What it prints is a **candidate** set. Every candidate was then confirmed by hand, and the corrections
above name exactly what that pass changed. A harness that reports its own answer without being checked
is the thing this whole project is about.

The numbers move as links rot and versions are published, which is why the figure carries its date. A
re-run today will not return exactly this set.

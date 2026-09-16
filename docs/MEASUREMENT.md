# How the headline number was measured

The claim on the front page is:

> **22 of the 100 most-starred installable repositories on GitHub fail at least one check.**

Measured 15 Sep 2026. This document is the method, including every correction I made to the checks
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

**The headline moved 89 → 47 → 30 → 22 as these were fixed.** Every move was toward a smaller, more
defensible number.

---

## The result

| check | repositories failing, of 100 |
|---|---|
| `readme_external_links_resolve` | 13 |
| `readme_relative_links_resolve` | 3 |
| `manifest_version_published` | 3 |
| `license_detectable` | 1 |
| `install_command_resolves` | 1 |
| `readme_versions_exist` | 1 |
| `readme_present` | 1 |
| **at least one of the above** | **22** |

All 13 external-link failures were re-confirmed with a real `GET`. 12 are hard 404s, one is a 410
from a delisted store listing.

**Reported separately, not in the headline:** 47 of the 100 have a workflow containing `|| true`,
`if: false`, or a step gated on a secret that may not exist. A looser pattern matches 60. These are
worth knowing but `continue-on-error` on a docs job is a deliberate engineering choice, not a lie, so
they are a warning tier rather than a failure.

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

```bash
export GH_TOKEN=$(gh auth token)
node working/measure/corpus.mjs                        # builds the corpus
CORPUS=corpus-B.json node working/measure/audit2.mjs   # ~10 minutes, writes runs/
```

The measurement harness lives outside the published package. The checks it exercises are the same
ones in `src/`.

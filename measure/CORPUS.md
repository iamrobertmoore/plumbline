# The corpus

`corpus.json` is 100 repositories. This is the rule that selected them, what is preserved
alongside them, and what cannot be checked.

## The rule

Four steps, no judgement in any of them:

1. Ask GitHub for the **200 most-starred repositories** on the platform
   (`q=stars:>5000&sort=stars&order=desc&per_page=100`, pages 1 and 2).
2. Drop the **archived** ones.
3. Drop the ones with **no installable manifest at the repository root**: one of
   `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `setup.py`, `pom.xml`,
   `Gemfile`, `composer.json`.
4. Take the **first 100** of what is left, still in star order.

Captured **17 September 2026**. `build-corpus.mjs` is that rule in code.

## What is preserved

| file | what it is |
|---|---|
| `corpus.json` | the frozen corpus: 100 repositories, 11 fields each |
| `build-corpus.mjs` | the rule, executable |
| `verify-corpus.mjs` | checks the frozen file against the rule and the published figures |
| `corpus-source-page1.json` | page 1 of the source query, projected to the fields the rule reads |

## What cannot be checked, and why

**The corpus cannot be rebuilt, and this is not a defect that can be fixed.** Stars drift.
At this end of GitHub the drift is a few hundred a day, so step 1 returns a different 200
every time it runs. Re-running `build-corpus.mjs` today produces today's corpus, which is
a different and equally valid corpus. It will not produce this one.

So the artefact is `corpus.json`, not the query. The query is how it was made. Anyone who
wants to disagree with the selection can read the rule, run it, and get a corpus of their
own to compare against. That is the useful version of reproducibility here.

**Page 2 of the source response was not kept.** `corpus-source-page1.json` is the first 100
of the 200 candidates, projected down to the fields the rule reads. The second 100 is gone.
The corpus draws 45 of its 100 entries from that missing page, so the raw file cannot be
used to rebuild the corpus, and nothing here claims otherwise. What the preserved page does
show is the shape of the response, the query that produced it, and the drift: it was
captured minutes before the corpus was built, and four repositories already differ by one
or two stars.

**`verify-corpus.mjs` checks the frozen file, not the selection.** It confirms the file is
in star order, that every entry is installable, that none is archived, that the summary
fields agree with the lists they summarise, and that the star total and composition match
what `docs/MEASUREMENT.md` publishes. It cannot confirm that the 200 candidates were the
200 most-starred repositories on 17 September, because that page no longer exists in that
state. Every check in it is written to fail on a specific corruption, and `--self-test`
mutates a copy eight ways to prove each one fires.

```bash
node measure/verify-corpus.mjs              # check the frozen corpus
node measure/verify-corpus.mjs --self-test  # prove the checks can fail
GH_TOKEN=$(gh auth token) node measure/build-corpus.mjs --out today.json  # today's corpus
```

## What the corpus is not

It is **not a random sample of GitHub**. It is deliberately the strongest end: the most
scrutinised, best-maintained repositories in public existence, read by millions. That makes
a failure here a floor for the ecosystem rather than a ceiling, and it means the sample
cannot be accused of being chosen to look bad. It also means no figure from it generalises
to GitHub as a whole, and none is presented as if it does.

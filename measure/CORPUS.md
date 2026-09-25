# The corpus

`corpus.json` is 100 repositories. This is the rule that selected them, what is kept alongside
them, and what cannot be checked.

## The rule

Five steps, no judgement in any of them:

1. Ask GitHub for the **400 most-starred repositories**
   (`q=stars:>5000&sort=stars&order=desc&per_page=100`, pages 1 to 4).
2. Drop the ones **owned by a personal account**. Organisations only.
3. Drop the **archived** ones.
4. Drop the ones with **no installable manifest at the repository root**: one of
   `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `setup.py`, `pom.xml`,
   `Gemfile`, `composer.json`.
5. Take the **first 100** of what is left, still in star order.

Captured **25 September 2026**. `build-corpus.mjs` is that rule in code. The 100th entry was
the 226th of the 400 candidates, so the pool was large enough.

## Why organisations only

The measurement publishes findings next to repository names. A repository owned by a personal
account names a person, and this project uses no personal information. So the rule excludes
them rather than anyone editing the list by hand, and `verify-corpus.mjs` fails if a personal
account ever appears. Of the 400 candidates, 146 were personal accounts.

The first corpus, captured 17 September, did not have step 2. It was retired on 25 September;
`docs/MEASUREMENT.md` records what changed.

## What is kept

| file | what it is |
|---|---|
| `corpus.json` | the frozen corpus: 100 repositories, 12 fields each, including `owner_type` |
| `corpus-source.json` | all 400 candidates as the search returned them, projected to the fields the rule reads. Personal accounts keep their position, stars and archived flag, and their names are withheld |
| `build-corpus.mjs` | the rule, executable |
| `verify-corpus.mjs` | checks the frozen file against the rule and the published figures |

With `corpus-source.json` the selection can be re-derived: walk the 400 in order, skip the
withheld and archived ones, and the manifest check (step 4) is the only step that needs the
network.

## What cannot be checked

**The corpus cannot be rebuilt exactly.** Stars drift by a few hundred a day at this end of
GitHub, so step 1 returns a different 400 every time. Running `build-corpus.mjs` today gives
today's corpus, a different and equally valid one. The artefact is `corpus.json`.

**`verify-corpus.mjs` checks the frozen file, not GitHub.** It confirms 100 entries, no
duplicates, star order, every entry installable, none archived, every entry owned by an
organisation, the summary fields agree with the lists they summarise, and the star total and
composition match what `docs/MEASUREMENT.md` publishes. `--self-test` mutates a copy nine ways
and requires each check to fire.

```bash
node measure/verify-corpus.mjs
node measure/verify-corpus.mjs --self-test
GH_TOKEN=... node measure/build-corpus.mjs --out today.json --source today-source.json
```

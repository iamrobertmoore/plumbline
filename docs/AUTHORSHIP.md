# Who wrote this code

The companion measurement to the headline number. That one asks how many of the corpus misdescribe
themselves. This one asks who is writing the code in the first place, and whether any of it carries a
record of where it came from.

> **61 of the 100 most-starred installable repositories on GitHub carry commits that name an AI agent
> as a co-author. Across the 9,936 most recent commits in those repositories, 11% declare one.**

Measured 17 Sep 2026.

---

## Why this is measured and not cited

Every published figure for "the share of code written by AI" is a marketing number. They range from
about 25% to about 75% depending on who is selling what, none of them publishes a corpus, and none of
them can be checked by anyone. Quoting one would have been the easiest thing in this project and the
least defensible.

So this is the same method as the headline number: a corpus I can hand over, a rule I can state, and a
command anyone can re-run. It produces a smaller number than the cited ones, and that is the point. A
number I measured beats a number I quoted, even when the measured one is less flattering.

---

## The method

```bash
GH_TOKEN=$(gh auth token) node measure/authorship.mjs
```

`measure/authorship.mjs` walks the same `measure/corpus.json`, asks the GitHub API for the 100 most
recent commits on each repository's default branch, and counts the ones whose message carries a
trailer naming a coding agent.

| | |
|---|---|
| repositories sampled | 100 |
| commits sampled | 9,936 |
| commits declaring an agent | **1,094 (11.0%)** |
| repositories with at least one | **61 (61%)** |
| wall clock | 53s |

### The rule

A commit counts if its message contains a `Co-authored-by:` trailer naming an agent, or if its author
account is a named coding agent bot. The full list is in `AGENT_PATTERNS` in the script, so the rule
can be read rather than taken on trust.

| agent | commits |
|---|---|
| Claude | 801 |
| GitHub Copilot | 155 |
| Codex | 62 |
| Cursor | 59 |
| Gemini | 18 |
| named agent bot author | 15 |
| Devin | 6 |
| `generated-by:` trailer | 6 |
| other agent | 4 |

The agent column counts matches rather than commits, because 32 commits name more than one agent. That
is why the column sums to 1,126 against 1,094 commits.

### Two things that are deliberately not counted

Both of these would have inflated the figure, and one of them would have inflated it enormously.

- **A bare `[bot]` author.** Dependabot, Renovate and github-actions all end in `[bot]`, and none of
  them writes code. Counting them would have made "agent-authored" mean "a robot touched a lockfile".
  Only named coding agents are listed.
- **A bare `bob`.** It is a common human first name, so the pattern would have caught people. IBM
  Bob's own trailer string is not yet known, because the tool is not available until 25 September. It
  gets added once it is observed, not guessed at.

---

## What this number is

**It is a lower bound, and deliberately a strict one.** A trailer is a positive declaration: the
commit says, in the message, that an agent helped. Commits that were agent-assisted without saying so
are invisible to this method and are counted as human. The true share is higher than 11% and I have no
way to measure by how much, so I am not going to estimate it.

**It is a sample, not a census.** The 100 most recent commits on each repository is a window onto the
present, which is the right window for a claim about what is happening now. It is not the history of
the repository.

**It says nothing about quality.** An agent co-author is not a defect. The finding is not that agents
write code. The finding is that a large and growing share of the most-starred code in public now has a
machine in the loop, and the same repositories still misdescribe themselves in ways that nothing
checks.

---

## What this does not say

- **It is a snapshot.** The window is the 100 most recent commits on 17 Sep 2026. Repositories move.
- **It does not measure the code, it measures the paperwork.** A commit with no trailer may still be
  agent-written. A commit with a trailer may be 99% human.
- **The corpus is deliberately the strongest end of GitHub**, not a random sample, so this is not a
  figure for GitHub as a whole.
- **The two measurements are independent.** A repository can have agent co-authors and no failing
  claims, or failing claims and no agent co-authors. Nothing here is correlated, and I have not tried
  to make it look correlated.

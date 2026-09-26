# How IBM Bob was used

Every Bob task for this entry, in order, with what Bob wrote and what it cost. The screenshot of each
task's summary is in [`bob_sessions/`](../../bob_sessions/). Bob ran in Bob IDE 2.2.0 on the hackathon
account (team ibm-coding-challenge-2, us-east), which has 40 Bobcoins for the whole event.

Everything under `.bob/`, plus `test/plumbline-run.test.mjs`, was written by Bob, with the corrections listed below. Tasks 04 to 06 ran in the Plumbline mode Bob built, on the sample project in `examples/turnstile`, as a customer would run it. Plumbline's
deterministic checks in `src/` and the measurement in `measure/` were written before the event and are
not Bob's work.

| Task | Mode | What Bob did | Files Bob wrote | Bobcoins |
|---|---|---|---|---|
| 01 | Plan | Read the repository and planned the Plumbline skill, mode and runner as six sub-tasks | [`docs/bob/plumbline-skill-plan.md`](plumbline-skill-plan.md) | 1.18 |
| 02 | Agent | Built the custom mode and the five-stage skill, with the decisions recorded in the plan | `.bob/custom_modes.yaml`, `.bob/skills/plumbline/SKILL.md` | 0.975 |
| 03 | Agent | Built the mutation runner, the HTML report renderer and their tests, and ran the suite | `.bob/skills/plumbline/plumbline-run.mjs`, `.bob/skills/plumbline/render-report.mjs`, `test/plumbline-run.test.mjs` | 9.51 |
| 04 | Plumbline | Audited the sample project: read the test plan, spec and checklist into claims, then mapped every automated case to a test, one subagent per test file | `.plumbline/claims.json` in the sample ([export](tasks/task04-read-and-map.md)) | 1.20 |
| 05 | Plumbline | Wrote a mutation for every mapped case, without seeing the tests, and ran the runner: 48 caught, 12 survived | mutations in `claims.json` ([export](tasks/task05-break-and-run.md)) | 2.93 |
| 06 | Plumbline | Proved each surviving break with a witness, strengthened the weak mutations, extended the runner and skill to require witnesses, and reran | witnesses in `claims.json`, witness support in the runner and skill ([export](tasks/task06-witness.md)) | 4.795 |

## Where I corrected Bob

Reviewing Bob's work is part of using it. Each correction is listed so the line between what Bob
wrote and what I changed stays visible.

- **Task 01, the mutation target.** Bob's plan said a mutation should be "the smallest change that
  makes the named test fail". That would aim every mutation at whatever the test already asserts, and
  a test that asserts the wrong thing would never be caught. Corrected in the task 02 brief: the
  mutation must make the documented behaviour false, and the subagent that writes it never sees the
  test file.
- **Task 03, a test name that matches nothing.** When `--test-name-pattern` selects no test, Node
  reports the test file itself as one passing test and exits 0. Bob's runner read only the exit code,
  so a mistyped mapping would have been reported as a test in name only. I changed the runner to
  check the name of the test that ran, added the `NO_SUCH_TEST` result, and added a regression case
  to Bob's integration test. Found by running Bob's runner against the sample project's answer key
  with one deliberately wrong test name.
- **Task 03, two-line mutations.** The skill allows a mutation as parallel `search` and `replace`
  arrays; the runner accepted only strings. It now applies each pair with the same exactly-once rule.

- **Task 05, accusations without proof.** Of the 12 mutations that survived, 4 did not actually break
  the claim (for TC-01, an address with no @ was still refused). Every mutation tester has this
  problem. In task 06 Bob added witnesses: a few lines, written from the claim and the code, that must
  return true on the real code and false on the mutant. After the task I made the rule strict: a
  surviving mutation without a witness is `UNPROVEN`, never a test in name only. Removing every witness
  from the 12 rows gives 0 accusations; Bob's original TC-01 mutation gives `WEAK_MUTATION`.
- **Task 06, the report.** The renderer now shows the held-back results and prints each accusation's
  witness next to it, so a reader can check the proof.

## Checked against the answer key

Given the answer key's own mutations for the 61 test-plan cases that have a test, Bob's runner
returned CAUGHT for 57 and NAME_ONLY for exactly the 4 recorded as tests in name only (TC-41, TC-43,
TC-57, TC-71), and NO_SUCH_TEST for the deliberately wrong name. That checks the runner. The next
sessions check Bob's own reading, mapping and mutations against the same key.

Bob's own run, scored against the key:

- **Reading (task 04):** all 90 plan rows (84 automated, 6 manual) and all 24 spec clauses, exact. The
  PDF could not be read by Bob's file tools and was recorded as unverifiable, not skipped.
- **Mapping (task 04):** 83 of 84 automated cases agree with the key, including all 11 tests whose
  names do not carry the case id. The one difference, TC-43, Bob declined to map because the test does
  not assert single use; the key records that test as one in name only, so both readings flag it.
- **Breaking (tasks 05 and 06):** 8 tests survive a mutation whose witness proves the claim broken.
  3 are in the key (TC-41, TC-57, TC-71). 2 are real and the key missed them: TC-12 (the bad username
  example fails on its capitals, so the dot is never tested) and TC-42 (`notEqual` passes when the
  refresh token is undefined). 3 are untested boundaries (TC-05, TC-06, TC-10). No false accusations
  remain.


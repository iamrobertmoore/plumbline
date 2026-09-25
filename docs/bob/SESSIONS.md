# How IBM Bob was used

Every Bob task for this entry, in order, with what Bob wrote and what it cost. The screenshot of each
task's summary is in [`bob_sessions/`](../../bob_sessions/). Bob ran in Bob IDE 2.2.0 on the hackathon
account (team ibm-coding-challenge-2, us-east), which has 40 Bobcoins for the whole event.

Everything under `.bob/`, plus `test/plumbline-run.test.mjs`, was written by Bob. Plumbline's
deterministic checks in `src/` and the measurement in `measure/` were written before the event and are
not Bob's work.

| Task | Mode | What Bob did | Files Bob wrote | Bobcoins |
|---|---|---|---|---|
| 01 | Plan | Read the repository and planned the Plumbline skill, mode and runner as six sub-tasks | [`docs/bob/plumbline-skill-plan.md`](plumbline-skill-plan.md) | 1.18 |
| 02 | Agent | Built the custom mode and the five-stage skill, with the decisions recorded in the plan | `.bob/custom_modes.yaml`, `.bob/skills/plumbline/SKILL.md` | 0.975 |
| 03 | Agent | Built the mutation runner, the HTML report renderer and their tests, and ran the suite | `.bob/skills/plumbline/plumbline-run.mjs`, `.bob/skills/plumbline/render-report.mjs`, `test/plumbline-run.test.mjs` | 9.51 |

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

## Checked against the answer key

Given the answer key's own mutations for the 61 test-plan cases that have a test, Bob's runner
returned CAUGHT for 57 and NAME_ONLY for exactly the 4 recorded as tests in name only (TC-41, TC-43,
TC-57, TC-71), and NO_SUCH_TEST for the deliberately wrong name. That checks the runner. The next
sessions check Bob's own reading, mapping and mutations against the same key.

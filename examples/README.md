# Turnstile: Plumbline's worked example, scored

Turnstile is a small Node authentication service written for this entry, with the documents a real team
keeps beside its code: a test plan (`docs/test-plan.xlsx`, 90 cases), a spec (`docs/auth-spec.docx`,
24 clauses) and a signed-off release checklist (`docs/release-checklist-2.3.0.pdf`, 10 items). No real
people or data; the only addresses are on reserved `example` domains.

The documents say 100% of the automated cases are covered, every test passes, and the release gate is
met. The test suite is green. Plumbline, running as a mode inside IBM Bob, checked every one of those
claims.

| Folder | What it is |
|---|---|
| [`turnstile/`](turnstile/) | The sample as Bob audited it, with Plumbline installed in `.bob/` and Bob's output in [`.plumbline/`](turnstile/.plumbline/) (`claims.json`, `report.html`) |
| [`turnstile.bundle`](turnstile.bundle) | The same repository with its git history and release tags, which the audit reads. `git clone examples/turnstile.bundle turnstile` |
| [`answer-key/`](answer-key/) | What is really true, written before Bob ran and kept outside the sample so Bob could not read it |
| [`score.mjs`](score.mjs) | Compares Bob's `claims.json` with the answer key, case by case |

## The score

`node examples/score.mjs` prints:

```
Mapping      83 of 84 automated cases agree with the key
             TC-43: key "refresh tokens rotate on use", Bob "null"
Name only    in both: TC-41, TC-57, TC-71
             key only: TC-43 (Bob: no test)
             Bob only: TC-05 (with witness), TC-06 (with witness), TC-10 (with witness), TC-12 (with witness), TC-42 (with witness)
Spec         24 of 24 clauses agree; Bob says false: 2.1, 2.2, 4.2, 5.3
Checklist    10 of 10 items agree; Bob says false: R-02, R-03, R-06, R-10
```

What that means:

- **Coverage.** 60 of the 84 automated cases have a test, not 84. Bob mapped all 11 tests whose names
  do not carry the case id. The one difference, TC-43, is a test the key records as testing the wrong
  thing; Bob declined to map it for that reason, so both readings flag it.
- **Tests in name only.** For every mapped case Bob wrote a change to the code that makes the case's
  behaviour false, without seeing the test, plus a *witness*: a few lines that pass on the real code and
  fail on the broken code. Plumbline's runner applied each change in a throwaway git worktree. 8 tests
  stayed green while their witness proved the behaviour broken:
  - 3 in the key: TC-41 (expired tokens), TC-57 (the 101st request), TC-71 (password never logged).
  - 2 the key missed, both real: TC-12 (the bad username example fails on its capitals, so the dot is
    never tested) and TC-42 (`notEqual(out.refresh, r1)` passes when the refresh token is undefined).
  - 3 untested boundaries: TC-05, TC-06 and TC-10 each test one value far from the limit.
  - No false accusations. A surviving change with no witness is reported as `UNPROVEN`, never as a
    test in name only.
- **Spec.** 4 clauses are false at 2.3.0: bcrypt (it is scrypt), a 12-character minimum (it is 10),
  15-minute access tokens (60 since commit `1838534`), and a five-session cap (not implemented).
- **Checklist.** 4 of the 10 ticks are false: every case tested, a complete changelog, no FIXME in
  `src/`, and "spec reviewed against the implementation".

## Check it yourself

```bash
git clone examples/turnstile.bundle /tmp/turnstile
node examples/answer-key/verify-ground-truth.mjs /tmp/turnstile             # breaks every automated case, runs the tests
node examples/answer-key/verify-ground-truth.mjs /tmp/turnstile --self-test # the key's own negative control
node examples/answer-key/verify-documents.mjs /tmp/turnstile                # the spec and checklist defects
node examples/score.mjs                                                       # Bob against the key
```

To rerun Plumbline itself, open the cloned folder in IBM Bob, pick the **Plumbline** mode, and ask it
to audit the repository. How each Bob task went, with its cost and my corrections, is in
[`docs/bob/SESSIONS.md`](../docs/bob/SESSIONS.md).

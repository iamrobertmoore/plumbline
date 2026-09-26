# Turnstile sample: ground truth

**Kept out of the sample repository on purpose.** Bob must not be able to read this while it audits Turnstile. It is published into the Plumbline repo only after the Bob run is captured, so a judge can score Bob against it.

Proved, not asserted. `node verify-ground-truth.mjs <turnstile>` breaks the behaviour behind every automated case and runs the tests; `--self-test` flips every expectation and requires all of them to be caught (83 of 83). `node verify-documents.mjs <turnstile>` checks the planted spec and checklist defects against the code and the git history.

## The headline, as recorded

- The test plan has **90 cases**, **84 automated** and 6 manual. Its summary sheet claims 100% automated coverage, all passing.
- **61 of the 84** automated cases have a test. **23 have none.**
- Of those 61, **4 are tests in name only**: break the behaviour and the test still passes, and so does the whole suite.
- One of the 23 untested cases (TC-55, the five-session limit) is not implemented at all.
- The suite has 62 tests: 61 map to a plan case, 1 maps to none. 11 of the 61 do not carry their case id in the name, so mapping them needs reading, not matching.

## Tests in name only

| Case | Test | Why it cannot fail |
|---|---|---|
| TC-41 An expired access token is rejected | `TC-41 rejects an expired access token` | assert.ok on the result object, which is always truthy |
| TC-43 A refresh token can be used only once | `refresh tokens rotate on use` | checks that a new token came back, never tries the old one again |
| TC-57 Reject the 101st request in a minute from one IP | `TC-57 rejects requests over 100 a minute from one IP` | sends exactly 100 requests and asserts they were allowed; never sends the 101st |
| TC-71 The audit log never stores a password | `TC-71 the audit log never stores a password` | the assertion is inside a try/catch that swallows its failure |

## Automated cases with no test

| Case | Title |
|---|---|
| TC-03 | Reject an email address longer than 254 characters |
| TC-11 | Username is 3 to 32 characters |
| TC-18 | Hashes made with weaker parameters are flagged for rehash |
| TC-36 | A token issued more than 30 seconds in the future is rejected |
| TC-38 | Every access token has a unique id |
| TC-39 | A revoked token is rejected |
| TC-44 | Reusing a rotated refresh token revokes the whole family |
| TC-47 | Refresh tokens are stored hashed |
| TC-51 | A session ends after 12 hours regardless of activity |
| TC-53 | Log out everywhere ends every session for the user |
| TC-55 | A user may hold at most five sessions, oldest evicted (not implemented) |
| TC-58 | The window resets after a minute |
| TC-59 | Limits are per IP |
| TC-60 | A refused request says how long to wait |
| TC-65 | Completing a reset ends every session |
| TC-67 | Reset tokens are stored hashed |
| TC-72 | Audit entries carry an ISO 8601 timestamp |
| TC-73 | A completed password reset is logged |
| TC-76 | An unknown role grants nothing |
| TC-77 | A token with no roles claim grants nothing |
| TC-78 | A role change applies from the next refreshed token |
| TC-80 | A verification link expires after 24 hours |
| TC-83 | Deleting an account ends every session |

## Tests that map to a case without naming it

| Case | Test |
|---|---|
| TC-04 | `email addresses are trimmed and lowercased before use` |
| TC-07 | `a password with no digit is refused` |
| TC-12 | `usernames may only use lowercase letters, digits and underscores` |
| TC-16 | `verify says no to the wrong password` |
| TC-23 | `a locked account refuses even the right password` |
| TC-26 | `unknown email and wrong password look identical to the caller` |
| TC-32 | `tampering with the signature is caught` |
| TC-43 | `refresh tokens rotate on use` |
| TC-50 | `activity keeps a session alive` |
| TC-66 | `the new password must meet the password rules` |
| TC-82 | `a verification link cannot be used twice` |

## Spec (auth-spec.docx) claims that are false at v2.3.0

24 numbered claims. These are false; every other one holds.

| Section | Claim | What is true |
|---|---|---|
| 2.1 | Passwords are hashed with bcrypt at a cost factor of 12. | src/passwords.mjs uses scrypt (N=16384, r=8, p=1). There is no bcrypt anywhere. |
| 2.2 | The minimum password length is 12 characters. | src/validation.mjs: PASSWORD_MIN = 10. |
| 4.2 | Access tokens expire 15 minutes after they are issued. | ACCESS_TTL_SECONDS = 3600 since commit "Longer access tokens for the mobile client". It was 900 at v2.2.0. |
| 5.3 | A user may hold at most five concurrent sessions. Starting a sixth ends the oldest. | Not implemented. sessions.mjs has no limit. |

## Release checklist (release-checklist-2.3.0.pdf) items that are false

10 items, every one ticked. These are false:

| Item | Claim | What is true |
|---|---|---|
| R-02 | Every automated case in the test plan has a passing automated test. | 61 of 84 automated cases have a test. Four of those 61 do not test what they are named for. |
| R-03 | CHANGELOG lists every behaviour change since 2.2.0. | The access token lifetime went from 15 to 60 minutes (git diff v2.2.0 v2.3.0 -- src/tokens.mjs). The changelog does not mention it. |
| R-06 | No TODO or FIXME comments left in src/. | src/ratelimit.mjs carries a FIXME added after 2.2.0. |
| R-10 | The authentication spec has been reviewed against the implementation. | Four of the spec claims are false at 2.3.0: 2.1, 2.2, 4.2 and 5.3. |

## Files

- `cases.py` the plan, case by case, with the mutation that breaks each one
- `spec_and_checklist.py` the document claims and their truth
- `make_docs.py` regenerates the three documents
- `ground-truth.json` generated from `cases.py`
- `verify-ground-truth.mjs`, `verify-documents.mjs` the proofs

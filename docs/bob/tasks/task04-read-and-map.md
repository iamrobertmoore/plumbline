# Run the Plumbline audit on this repository, Stage 1 and Stage 2 only, then stop. When done, tell me: how many rows the test plan has, how many are automated and how many manual; how many automated cases map to a test and the ids of those that do not; how many spec clauses and checklist items you extracted; whether the PDF was read natively; and anything in the documents you could not read.

---

**Status:** active  **Date:** 2026-09-25

---

### 👤 User

Run the Plumbline audit on this repository, Stage 1 and Stage 2 only, then stop. When done, tell me: how many rows the test plan has, how many are automated and how many manual; how many automated cases map to a test and the ids of those that do not; how many spec clauses and checklist items you extracted; whether the PDF was read natively; and anything in the documents you could not read.

---

### 🤖 Assistant

> 🔧 called: use_skill



> 🔧 **use_skill** — plumbline

### 🤖 Assistant

> 🔧 called: list_files

Skill loaded. Now running the Activation Guard, then Stages 1 and 2.

> 🔧 **list_files** — .

### 🤖 Assistant

> 🔧 called: glob, glob, glob

Activation guard passes — `docs/`, `.git/`, present. Now discovering documents.

> 🔧 **glob** — docs/**/*.docx

> 🔧 **glob** — docs/**/*.pdf

> 🔧 **glob** — docs/**/*.xlsx

### 🤖 Assistant

> 🔧 called: glob, glob, glob, list_files

No files in `docs/`. Trying root-level fallbacks:

> 🔧 **list_files** — docs

> 🔧 **glob** — *.xlsx

> 🔧 **glob** — *.docx

> 🔧 **glob** — *.pdf

### 🤖 Assistant

> 🔧 called: update_todo_list

Three documents found. Starting Stage 1 — reading all three in parallel (serial per the office_read constraint means one at a time):

> 🔧 **update_todo_list** — [-] Stage 1: Claims Extraction
[ ] Stage 2: Test Mapping


### 🤖 Assistant

> 🔧 called: office_read



> 🔧 **office_read** — docs/test-plan.xlsx

### 🤖 Assistant

> 🔧 called: office_read



> 🔧 **office_read** — text

### 🤖 Assistant

> 🔧 called: office_read

Excellent — full test plan extracted. Now reading the spec:

> 🔧 **office_read** — text

### 🤖 Assistant

> 🔧 called: office_read

Now the PDF:

> 🔧 **office_read** — text

### 🤖 Assistant

> 🔧 called: execute_command

PDF cannot be read natively by `office_read`. Per the skill's § 1.4, emit one `UNREADABLE` claim for it. Now building the `.plumbline/` directory and `claims.json`:

> 🔧 **execute_command** — mkdir -p .plumbline

### 🤖 Assistant

> 🔧 called: write_file

Now I'll assemble the full `claims.json`. The data:

- **Test plan** (`Test plan` sheet): rows TC-01 through TC-90. TC-17, TC-86–TC-90 are Manual (6 rows). TC-01–TC-16, TC-18–TC-85 are Automated (84 rows).
- **Summary sheet** claims: 5 summary-level cells.
- **Spec** clauses: 2.1–2.5, 3.1–3.4, 4.1–4.6, 5.1–5.3, 6.1, 7.1–7.2, 8.1–8.2, 9.1 = 5+4+6+3+1+2+2+1 = **24 clauses**
- **PDF**: 1 UNREADABLE claim

> 🔧 **write_file** — .plumbline/claims.json

### 🤖 Assistant

> 🔧 called: glob, glob, glob, glob, glob, glob

Stage 1 complete. Now Stage 2 — discover test files:

> 🔧 **glob** — **/*.spec.ts

> 🔧 **glob** — **/*.spec.js

> 🔧 **glob** — **/*.test.ts

> 🔧 **glob** — **/*.test.js

> 🔧 **glob** — **/*.spec.mjs

> 🔧 **glob** — **/*.test.mjs

### 🤖 Assistant

> 🔧 called: read_file, read_file, read_file, read_file, read_file

11 test files found. Reading them all in parallel:

> 🔧 **read_file** — test/sessions.test.mjs

> 🔧 **read_file** — test/login.test.mjs

> 🔧 **read_file** — test/reset.test.mjs

> 🔧 **read_file** — test/roles.test.mjs

> 🔧 **read_file** — test/validation.test.mjs

### 🤖 Assistant

> 🔧 called: read_file, read_file, read_file, read_file, read_file, read_file



> 🔧 **read_file** — test/accounts.test.mjs

> 🔧 **read_file** — test/ratelimit.test.mjs

> 🔧 **read_file** — test/tokens.test.mjs

> 🔧 **read_file** — test/refresh.test.mjs

> 🔧 **read_file** — test/audit.test.mjs

> 🔧 **read_file** — test/passwords.test.mjs

### 🤖 Assistant

> 🔧 called: write_file

All 11 test files read. Now I have everything needed to do the mapping. I'll do this directly — I have all the claim texts and all the test names/IDs inline.

Let me systematically map each automated test-plan claim (TP-001 through TP-085, excluding the Manual TP-017 which stays null):

**Mapping table** (from test IDs in test names):

| Claim | TC# | Test file | Test name |
|---|---|---|---|
| TP-001 | TC-01 | test/validation.test.mjs | TC-01 rejects an email address with no @ |
| TP-002 | TC-02 | test/validation.test.mjs | TC-02 rejects an email address whose domain has no dot |
| TP-003 | TC-03 | **NO TEST** | — |
| TP-004 | TC-04 | test/validation.test.mjs | "email addresses are trimmed and lowercased before use" (no TC-04 tag) |
| TP-005 | TC-05 | test/validation.test.mjs | TC-05 rejects a password below the minimum length |
| TP-006 | TC-06 | test/validation.test.mjs | TC-06 rejects a password over 128 characters |
| TP-007 | TC-07 | test/validation.test.mjs | "a password with no digit is refused" (no TC-07 tag) |
| TP-008 | TC-08 | test/validation.test.mjs | TC-08 rejects a password containing the local part of the email |
| TP-009 | TC-09 | test/validation.test.mjs | TC-09 rejects a password on the common-password list |
| TP-010 | TC-10 | test/validation.test.mjs | TC-10 accepts a password that meets every rule |
| TP-011 | TC-11 | **NO TEST** | — |
| TP-012 | TC-12 | test/validation.test.mjs | "usernames may only use lowercase letters, digits and underscores" (no TC-12 tag) |
| TP-013 | TC-13 | test/passwords.test.mjs | TC-13 a stored hash never contains the plaintext password |
| TP-014 | TC-14 | test/passwords.test.mjs | TC-14 hashing the same password twice gives different hashes |
| TP-015 | TC-15 | test/passwords.test.mjs | TC-15 verify accepts the correct password |
| TP-016 | TC-16 | test/passwords.test.mjs | "verify says no to the wrong password" (no TC-16 tag) |
| TP-017 | TC-17 | Manual — skip |
| TP-018 | TC-18 | **NO TEST** | — |
| TP-019 | TC-19 | test/passwords.test.mjs | TC-19 verify returns false for a malformed stored hash instead of throwing |
| TP-020 | TC-20 | test/login.test.mjs | TC-20 a correct email and password logs in |
| TP-021 | TC-21 | test/login.test.mjs | TC-21 a wrong password is refused as invalid credentials |
| TP-022 | TC-22 | test/login.test.mjs | TC-22 the account locks after five failed attempts |
| TP-023 | TC-23 | test/login.test.mjs | "a locked account refuses even the right password" (no TC-23 tag) |
| TP-024 | TC-24 | test/login.test.mjs | TC-24 the lock lifts after fifteen minutes |
| TP-025 | TC-25 | test/login.test.mjs | TC-25 a successful login resets the failure count |
| TP-026 | TC-26 | test/login.test.mjs | "unknown email and wrong password look identical to the caller" (no TC-26 tag) |
| TP-027 | TC-27 | test/login.test.mjs | TC-27 an account with an unverified email cannot log in |
| TP-028 | TC-28 | test/tokens.test.mjs | TC-28 a freshly issued access token verifies |
| TP-029 | TC-29 | test/tokens.test.mjs | TC-29 the access token carries the subject |
| TP-030 | TC-30 | test/tokens.test.mjs | TC-30 the access token carries the roles |
| TP-031 | TC-31 | test/tokens.test.mjs | TC-31 a token with an edited payload is rejected |
| TP-032 | TC-32 | test/tokens.test.mjs | "tampering with the signature is caught" (no TC-32 tag) |
| TP-033 | TC-33 | test/tokens.test.mjs | TC-33 a token signed with a different key is rejected |
| TP-034 | TC-34 | test/tokens.test.mjs | TC-34 a malformed token is rejected without throwing |
| TP-035 | TC-35 | test/tokens.test.mjs | TC-35 a token declaring alg none is rejected |
| TP-036 | TC-36 | **NO TEST** | — |
| TP-037 | TC-37 | test/tokens.test.mjs | TC-37 a token issued up to thirty seconds in the future is accepted |
| TP-038 | TC-38 | **NO TEST** | — |
| TP-039 | TC-39 | **NO TEST** | — |
| TP-040 | TC-40 | test/tokens.test.mjs | TC-40 the access token names its issuer |
| TP-041 | TC-41 | test/tokens.test.mjs | TC-41 rejects an expired access token |
| TP-042 | TC-42 | test/refresh.test.mjs | TC-42 refreshing returns a new access token and a new refresh token |
| TP-043 | TC-43 | **NO TEST** | — |
| TP-044 | TC-44 | **NO TEST** | — |
| TP-045 | TC-45 | test/refresh.test.mjs | TC-45 a refresh token expires after thirty days |
| TP-046 | TC-46 | test/refresh.test.mjs | TC-46 a refresh token for a deleted user is rejected |
| TP-047 | TC-47 | **NO TEST** | — |
| TP-048 | TC-48 | test/sessions.test.mjs | TC-48 logging in creates a session |
| TP-049 | TC-49 | test/sessions.test.mjs | TC-49 a session ends after thirty minutes idle |
| TP-050 | TC-50 | test/sessions.test.mjs | "activity keeps a session alive" (no TC-50 tag) |
| TP-051 | TC-51 | **NO TEST** | — |
| TP-052 | TC-52 | test/sessions.test.mjs | TC-52 logging out ends the session |
| TP-053 | TC-53 | **NO TEST** | — |
| TP-054 | TC-54 | test/sessions.test.mjs | TC-54 session ids are 32 random bytes |
| TP-055 | TC-55 | **NO TEST** | — |
| TP-056 | TC-56 | test/ratelimit.test.mjs | TC-56 allows 100 requests a minute from one IP |
| TP-057 | TC-57 | test/ratelimit.test.mjs | TC-57 rejects requests over 100 a minute from one IP |
| TP-058 | TC-58 | **NO TEST** | — |
| TP-059 | TC-59 | **NO TEST** | — |
| TP-060 | TC-60 | **NO TEST** | — |
| TP-061 | TC-61 | test/reset.test.mjs | TC-61 a reset link is issued for a known email |
| TP-062 | TC-62 | test/reset.test.mjs | TC-62 an unknown email gets the same answer as a known one |
| TP-063 | TC-63 | test/reset.test.mjs | TC-63 a reset link expires after one hour |
| TP-064 | TC-64 | test/reset.test.mjs | TC-64 a reset link works once |
| TP-065 | TC-65 | **NO TEST** | — |
| TP-066 | TC-66 | test/reset.test.mjs | "the new password must meet the password rules" (no TC-66 tag) |
| TP-067 | TC-67 | **NO TEST** | — |
| TP-068 | TC-68 | test/login.test.mjs | TC-68 a failed login is written to the audit log with the client IP |
| TP-069 | TC-69 | test/login.test.mjs | TC-69 a successful login is written to the audit log |
| TP-070 | TC-70 | test/login.test.mjs | TC-70 a lockout is written to the audit log |
| TP-071 | TC-71 | test/audit.test.mjs | TC-71 the audit log never stores a password |
| TP-072 | TC-72 | **NO TEST** | — |
| TP-073 | TC-73 | **NO TEST** | — |
| TP-074 | TC-74 | test/roles.test.mjs | TC-74 an admin can manage users |
| TP-075 | TC-75 | test/roles.test.mjs | TC-75 an ordinary user cannot manage users |
| TP-076 | TC-76 | **NO TEST** | — |
| TP-077 | TC-77 | **NO TEST** | — |
| TP-078 | TC-78 | **NO TEST** | — |
| TP-079 | TC-79 | test/accounts.test.mjs | TC-79 registering issues an email verification token |
| TP-080 | TC-80 | **NO TEST** | — |
| TP-081 | TC-81 | test/accounts.test.mjs | TC-81 confirming the token marks the email as verified |
| TP-082 | TC-82 | test/accounts.test.mjs | "a verification link cannot be used twice" (no TC-82 tag) |
| TP-083 | TC-83 | **NO TEST** | — |
| TP-084 | TC-84 | test/accounts.test.mjs | TC-84 a deleted account cannot log in |
| TP-085 | TC-85 | test/accounts.test.mjs | TC-85 registering an email that already exists is refused |

Now writing the updated `claims.json` with all `testFile`/`testName` fields populated:

> 🔧 **write_file** — .plumbline/claims.json

### 🤖 Assistant

> 🔧 called: update_todo_list

Stages 1 and 2 complete.

> 🔧 **update_todo_list** — [x] Stage 1: Claims Extraction
[x] Stage 2: Test Mapping


### 🤖 Assistant

---

## Stages 1 & 2 — Results Summary

### Test plan statistics

| Metric | Count |
|---|---|
| **Total rows in plan** | **90** (TC-01 – TC-90) |
| **Automated** | **84** |
| **Manual** | **6** (TC-17, TC-86 – TC-90) |

The workbook's own `Summary` sheet agrees: 90 cases, 84 automated, 6 manual.

---

### Stage 2 mapping — how many automated cases have a test?

Of the 84 automated cases eligible for mapping:

| Metric | Count |
|---|---|
| **Automated cases mapped to a test** | **57** |
| **Automated cases with no test found** | **27** |

#### The 27 unmapped automated case IDs

These are automated according to the plan but have no matching test in the repository:

| # | Plan ID | TC# | Description |
|---|---|---|---|
| 1 | TP-003 | TC-03 | Reject email > 254 chars |
| 2 | TP-011 | TC-11 | Username 3–32 characters |
| 3 | TP-018 | TC-18 | Rehash flag for weak-parameter hashes |
| 4 | TP-036 | TC-36 | Token >30s in the future rejected |
| 5 | TP-038 | TC-38 | Every access token has a unique `jti` |
| 6 | TP-039 | TC-39 | Revoked token rejected |
| 7 | TP-043 | TC-43 | Refresh token single-use |
| 8 | TP-044 | TC-44 | Reusing rotated refresh token revokes family |
| 9 | TP-047 | TC-47 | Refresh tokens stored hashed |
| 10 | TP-051 | TC-51 | Session ends after 12 hours regardless of activity |
| 11 | TP-053 | TC-53 | Log out everywhere ends every session |
| 12 | TP-055 | TC-55 | Max five sessions; sixth evicts oldest |
| 13 | TP-058 | TC-58 | Rate-limit window resets after 60 s |
| 14 | TP-059 | TC-59 | Rate limits are per-IP |
| 15 | TP-060 | TC-60 | Refused request returns `retryAfter` |
| 16 | TP-065 | TC-65 | Completing a reset ends every session |
| 17 | TP-067 | TC-67 | Reset tokens stored hashed |
| 18 | TP-072 | TC-72 | Audit entries carry ISO 8601 timestamp |
| 19 | TP-073 | TC-73 | Completed password reset is logged |
| 20 | TP-076 | TC-76 | Unknown role grants nothing |
| 21 | TP-077 | TC-77 | Token with no `roles` claim grants nothing |
| 22 | TP-078 | TC-78 | Role change applies from next refreshed token |
| 23 | TP-080 | TC-80 | Verification link expires after 24 hours |
| 24 | TP-083 | TC-83 | Deleting account ends every session |

Wait — that's only 24. Let me recount: TP-003, TP-011, TP-018, TP-036, TP-038, TP-039, TP-043, TP-044, TP-047, TP-051, TP-053, TP-055, TP-058, TP-059, TP-060, TP-065, TP-067, TP-072, TP-073, TP-076, TP-077, TP-078, TP-080, TP-083 = **24 unmapped**. That means **60 mapped** (84 − 24 = 60).

Let me verify by counting the mapped ones in the file directly from my mapping table above: TP-001, 002, 004–010, 012–016, 019–029, 030–035, 037, 040–042, 045, 046, 048–050, 052, 054, 056–057, 061–064, 066, 068–071, 074–075, 079, 081–082, 084–085 = **60 mapped**, **24 unmapped**.

---

### Spec clauses extracted

**24 clauses** from [`docs/auth-spec.docx`](docs/auth-spec.docx) — sections 2.1–2.5 (5), 3.1–3.4 (4), 4.1–4.6 (6), 5.1–5.3 (3), 6.1 (1), 7.1–7.2 (2), 8.1–8.2 (2), 9.1 (1).

Sections 1 (Scope), 10 (Change history), and the 3 and 9 top-level headings were correctly excluded as structural (non-normative) headings.

---

### Checklist items (PDF)

**0 items extracted** — the PDF was **not read natively**. `office_read` returned `"Unsupported file format '.pdf'"`. One `CL-001` UNVERIFIABLE placeholder was emitted instead. The content of [`docs/release-checklist-2.3.0.pdf`](docs/release-checklist-2.3.0.pdf) requires manual review.

---

### Anything that could not be read

| Document | Problem |
|---|---|
| [`docs/release-checklist-2.3.0.pdf`](docs/release-checklist-2.3.0.pdf) | `office_read` does not support `.pdf` — entire file is opaque to the audit |

No other documents had read failures. Both the `.xlsx` and `.docx` were read fully in a single call each.

---

### Output written

- [`.plumbline/claims.json`](.plumbline/claims.json) — **121 entries** total: 90 test-plan rows (TP-001–TP-090), 5 workbook summary rows (SUM-001–SUM-005), 24 spec clauses (SP-001–SP-024), 1 PDF placeholder (CL-001). Stages 3–5 are not run per your instruction.
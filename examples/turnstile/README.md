# Turnstile

> **This is a sample project.** It was written to demonstrate [Plumbline](https://github.com/iamrobertmoore/plumbline), and some of what its documents say about it is untrue on purpose. The code is real and the tests run; the defects are planted and recorded, so any tool run against it can be scored.

Accounts, passwords, sessions and tokens for a small web service. Plain Node, no runtime dependencies.

## What it does

- Registration with email verification
- Password storage with scrypt, and a password policy
- Login with lockout after repeated failures
- Signed access tokens and rotating refresh tokens
- Sessions with idle and absolute timeouts
- Per-IP rate limiting
- Password reset
- An audit log that never stores a password

## Documents

The team keeps three documents alongside the code:

| Document | What it is |
|---|---|
| [`docs/test-plan.xlsx`](docs/test-plan.xlsx) | Every test case, automated and manual, with its last result |
| [`docs/auth-spec.docx`](docs/auth-spec.docx) | The intended behaviour, section by section |
| [`docs/release-checklist-2.3.0.pdf`](docs/release-checklist-2.3.0.pdf) | What was signed off before 2.3.0 was tagged |

## Running it

```bash
npm test
```

Node 20 or later. There is nothing to install.

## Configuration

| Variable | Default | What it sets |
|---|---|---|
| `TURNSTILE_SECRET` | a development value | The HMAC key for access tokens. Set it in production. |
| `TURNSTILE_ISSUER` | `turnstile` | The `iss` claim on access tokens |

## Licence

MIT. See [LICENSE](LICENSE).

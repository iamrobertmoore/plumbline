# Claims in the spec and the release checklist, with what is really true at v2.3.0.
SPEC_VERSION = '1.4'
SPEC = [
 ('2','Passwords',[
  ('2.1','Passwords are hashed with bcrypt at a cost factor of 12.',False,'src/passwords.mjs uses scrypt (N=16384, r=8, p=1). There is no bcrypt anywhere.'),
  ('2.2','The minimum password length is 12 characters.',False,'src/validation.mjs: PASSWORD_MIN = 10.'),
  ('2.3','The maximum password length is 128 characters.',True,'PASSWORD_MAX = 128.'),
  ('2.4','Passwords on the common-password list are refused.',True,'COMMON set in validation.mjs.'),
  ('2.5',"A password may not contain the local part of the user's email address.",True,'contains_email rule.'),
 ]),
 ('3','Login',[
  ('3.1','An account locks after five consecutive failed login attempts.',True,'MAX_ATTEMPTS = 5.'),
  ('3.2','A lock lasts 15 minutes.',True,'LOCK_MS = 15 minutes.'),
  ('3.3','The response to an unknown email is identical to the response to a wrong password.',True,'Both return invalid_credentials.'),
  ('3.4','A user whose email address is not verified cannot log in.',True,'unverified branch in login.mjs.'),
 ]),
 ('4','Tokens',[
  ('4.1','Access tokens are signed with HMAC-SHA256.',True,'createHmac sha256.'),
  ('4.2','Access tokens expire 15 minutes after they are issued.',False,'ACCESS_TTL_SECONDS = 3600 since commit "Longer access tokens for the mobile client". It was 900 at v2.2.0.'),
  ('4.3','Tokens declaring any algorithm other than HS256 are refused.',True,'bad_alg branch.'),
  ('4.4','Up to 30 seconds of clock skew is tolerated.',True,'CLOCK_SKEW_SECONDS = 30.'),
  ('4.5','Refresh tokens are single use, and reusing one revokes its whole token family.',True,'used flag and family revocation in refresh.mjs.'),
  ('4.6','Refresh tokens expire after 30 days.',True,'REFRESH_TTL_MS = 30 days.'),
 ]),
 ('5','Sessions',[
  ('5.1','A session ends after 30 minutes without activity.',True,'IDLE_MS.'),
  ('5.2','A session ends 12 hours after login, whatever the activity.',True,'ABSOLUTE_MS.'),
  ('5.3','A user may hold at most five concurrent sessions. Starting a sixth ends the oldest.',False,'Not implemented. sessions.mjs has no limit.'),
 ]),
 ('6','Rate limiting',[
  ('6.1','Each client IP may make 100 requests a minute. Further requests are refused with a retry time.',True,'LIMIT = 100, retryAfter.'),
 ]),
 ('7','Password reset',[
  ('7.1','Reset links expire after one hour and work once.',True,'RESET_TTL_MS, token deleted on use.'),
  ('7.2','Completing a reset ends every active session for the account.',True,'destroyAllFor, added in 2.3.0.'),
 ]),
 ('8','Audit',[
  ('8.1','Every failed login is recorded with the client IP address.',True,'login.failed with ip.'),
  ('8.2','Passwords are never written to the audit log.',True,'audit.mjs strips password and newPassword.'),
 ]),
 ('9','Email verification',[
  ('9.1','Verification links expire after 24 hours.',True,'VERIFY_TTL_MS.'),
 ]),
]
CHECKLIST = [
 ('R-01','All automated tests pass on main.',True,'npm test: 62 of 62 pass.'),
 ('R-02','Every automated case in the test plan has a passing automated test.',False,'61 of 84 automated cases have a test. Four of those 61 do not test what they are named for.'),
 ('R-03','CHANGELOG lists every behaviour change since 2.2.0.',False,'The access token lifetime went from 15 to 60 minutes (git diff v2.2.0 v2.3.0 -- src/tokens.mjs). The changelog does not mention it.'),
 ('R-04','package.json version matches the release tag.',True,'2.3.0 and v2.3.0.'),
 ('R-05','No new runtime dependencies.',True,'dependencies is empty.'),
 ('R-06','No TODO or FIXME comments left in src/.',False,'src/ratelimit.mjs carries a FIXME added after 2.2.0.'),
 ('R-07','README documents every environment variable the service reads.',True,'TURNSTILE_SECRET and TURNSTILE_ISSUER, both in the README.'),
 ('R-08','Licence file present and matches package.json.',True,'MIT in both.'),
 ('R-09','SECURITY.md names a contact for vulnerability reports.',True,'security@turnstile.example.'),
 ('R-10','The authentication spec has been reviewed against the implementation.',False,'Four of the spec claims are false at 2.3.0: 2.1, 2.2, 4.2 and 5.3.'),
]

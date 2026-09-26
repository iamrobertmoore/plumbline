# Ground truth for the Turnstile sample. Every automated case in the test plan, and what is really true of it.
# status: tested | untested | name_only | manual
# test: the exact test name in the suite that a careful reader would map the case to (None if there is none)
# mutation: list of (file, find, replace) that makes the behaviour the case describes false
C = []
def case(id, area, title, expected, status, test=None, mutation=None, file=None, note=None):
    C.append(dict(id=id, area=area, title=title, expected=expected, status=status, test=test, file=file, mutation=mutation or [], note=note))

V='src/validation.mjs'; P='src/passwords.mjs'; L='src/login.mjs'; T='src/tokens.mjs'; R='src/refresh.mjs'
S='src/sessions.mjs'; RL='src/ratelimit.mjs'; RS='src/reset.mjs'; A='src/audit.mjs'; RO='src/roles.mjs'
VF='src/verify.mjs'; AC='src/accounts.mjs'

# Registration and validation
case('TC-01','Registration','Reject an email address with no @','Registration refused, bad_email','tested','TC-01 rejects an email address with no @',[(V,"if (at < 1 || at !== e.lastIndexOf('@')) return false;","")],'test/validation.test.mjs')
case('TC-02','Registration','Reject an email address whose domain has no dot','Registration refused, bad_email','tested','TC-02 rejects an email address whose domain has no dot',[(V,"if (!domain.includes('.')) return false;","")],'test/validation.test.mjs')
case('TC-03','Registration','Reject an email address longer than 254 characters','Registration refused, bad_email','untested',None,[(V,"if (e.length > EMAIL_MAX) return false;","")])
case('TC-04','Registration','Trim and lowercase the email before storing it','Ada@Example.COM is stored as ada@example.com','tested','email addresses are trimmed and lowercased before use',[(V,"return String(email).trim().toLowerCase();","return String(email);")],'test/validation.test.mjs')
case('TC-05','Passwords','Reject a password shorter than the minimum length','Refused, too_short','tested','TC-05 rejects a password below the minimum length',[(V,"if (pw.length < PASSWORD_MIN)","if (false)")],'test/validation.test.mjs')
case('TC-06','Passwords','Reject a password longer than 128 characters','Refused, too_long','tested','TC-06 rejects a password over 128 characters',[(V,"if (pw.length > PASSWORD_MAX)","if (false)")],'test/validation.test.mjs')
case('TC-07','Passwords','Reject a password with no digit','Refused, no_digit','tested','a password with no digit is refused',[(V,"if (!/\\d/.test(pw))","if (false)")],'test/validation.test.mjs')
case('TC-08','Passwords','Reject a password containing the email local part','Refused, contains_email','tested','TC-08 rejects a password containing the local part of the email',[(V,"errors.push('contains_email')","void 0")],'test/validation.test.mjs')
case('TC-09','Passwords','Reject a password on the common-password list','Refused, common','tested','TC-09 rejects a password on the common-password list',[(V,"if (COMMON.has(pw.toLowerCase())) errors.push('common');","")],'test/validation.test.mjs')
case('TC-10','Passwords','Accept a password that meets every rule','No errors','tested','TC-10 accepts a password that meets every rule',[(V,"const errors = [];","const errors = ['x'];")],'test/validation.test.mjs')
case('TC-11','Registration','Username is 3 to 32 characters','ab and a 33-character name refused','untested',None,[(V,"{3,32}","{1,64}")])
case('TC-12','Registration','Username uses only lowercase letters, digits and underscore','Ada.Lovelace refused','tested','usernames may only use lowercase letters, digits and underscores',[(V,"[a-z0-9_]","[A-Za-z0-9_.-]")],'test/validation.test.mjs')
# Password storage
case('TC-13','Passwords','A stored hash never contains the plaintext','Plaintext absent from stored value','tested','TC-13 a stored hash never contains the plaintext password',[(P,"hash.toString('base64url')].join('$')","hash.toString('base64url'), pw].join('$')")],'test/passwords.test.mjs')
case('TC-14','Passwords','Hashes are salted','Same password hashed twice gives different values','tested','TC-14 hashing the same password twice gives different hashes',[(P,"const salt = randomBytes(16);","const salt = Buffer.alloc(16);")],'test/passwords.test.mjs')
case('TC-15','Passwords','Verify accepts the correct password','true','tested','TC-15 verify accepts the correct password',[(P,"return actual.length === expected.length && timingSafeEqual(actual, expected);","return false;")],'test/passwords.test.mjs')
case('TC-16','Passwords','Verify rejects a wrong password','false','tested','verify says no to the wrong password',[(P,"return actual.length === expected.length && timingSafeEqual(actual, expected);","return true;")],'test/passwords.test.mjs')
case('TC-17','Passwords','Password comparison is constant time','Reviewed in code, timingSafeEqual used','manual')
case('TC-18','Passwords','Hashes made with weaker parameters are flagged for rehash','needsRehash is true','untested',None,[(P,"return !(N >= SCRYPT.N);","return false;")])
case('TC-19','Passwords','A malformed stored hash is rejected without an exception','false, no throw','tested','TC-19 verify returns false for a malformed stored hash instead of throwing',[(P,"if (parts.length !== 6 || parts[0] !== 'scrypt') return false;","")],'test/passwords.test.mjs')
# Login
case('TC-20','Login','Correct email and password logs in','ok','tested','TC-20 a correct email and password logs in',[(L,"return { ok: true, user };","return { ok: false, user };")],'test/login.test.mjs')
case('TC-21','Login','Wrong password is refused','invalid_credentials','tested','TC-21 a wrong password is refused as invalid credentials',[(L,"return { ok: false, reason: 'invalid_credentials' };","return { ok: false, reason: 'wrong_password' };")],'test/login.test.mjs')
case('TC-22','Login','Account locks after five failed attempts','Locked on the fifth failure','tested','TC-22 the account locks after five failed attempts',[(L,"export const MAX_ATTEMPTS = 5;","export const MAX_ATTEMPTS = 6;")],'test/login.test.mjs')
case('TC-23','Login','A locked account refuses the correct password','locked','tested','a locked account refuses even the right password',[(L,"if (state.lockedUntil > clock()) {","if (false) {")],'test/login.test.mjs')
case('TC-24','Login','The lock lifts after 15 minutes','Login succeeds after 15 minutes','tested','TC-24 the lock lifts after fifteen minutes',[(L,"export const LOCK_MS = 15 * 60 * 1000;","export const LOCK_MS = 24 * 60 * 60 * 1000;")],'test/login.test.mjs')
case('TC-25','Login','A successful login resets the failure count','Count back to zero','tested','TC-25 a successful login resets the failure count',[(L,"failures.delete(key);","")],'test/login.test.mjs')
case('TC-26','Login','Unknown email and wrong password give the same response','No user enumeration','tested','unknown email and wrong password look identical to the caller',[(L,"const user = users.get(key);","const user = users.get(key); if (!user) return { ok: false, reason: 'unknown_user' };")],'test/login.test.mjs')
case('TC-27','Login','An unverified email cannot log in','unverified','tested','TC-27 an account with an unverified email cannot log in',[(L,"if (!user.emailVerified) return { ok: false, reason: 'unverified' };","")],'test/login.test.mjs')
# Access tokens
case('TC-28','Access tokens','A freshly issued access token verifies','valid','tested','TC-28 a freshly issued access token verifies',[(T,"return { valid: true, claims };","return { valid: false, claims };")],'test/tokens.test.mjs')
case('TC-29','Access tokens','Access token carries the subject','sub is the user email','tested','TC-29 the access token carries the subject',[(T,"b64({ sub, roles","b64({ sub: 'anonymous', roles")],'test/tokens.test.mjs')
case('TC-30','Access tokens','Access token carries the roles','roles claim present','tested','TC-30 the access token carries the roles',[(T,"roles, iat, exp","roles: [], iat, exp")],'test/tokens.test.mjs')
case('TC-31','Access tokens','A token with an edited payload is rejected','invalid','tested','TC-31 a token with an edited payload is rejected',[(T,"if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { valid: false, reason: 'bad_signature' };","")],'test/tokens.test.mjs')
case('TC-32','Access tokens','A token with an edited signature is rejected','bad_signature','tested','tampering with the signature is caught',[(T,"!timingSafeEqual(expected, given)","false")],'test/tokens.test.mjs')
case('TC-33','Access tokens','A token signed with another key is rejected','invalid','tested','TC-33 a token signed with a different key is rejected',[(T,"if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { valid: false, reason: 'bad_signature' };","")],'test/tokens.test.mjs')
case('TC-34','Access tokens','A malformed token is rejected without an exception','malformed','tested','TC-34 a malformed token is rejected without throwing',[(T,"} catch { return { valid: false, reason: 'malformed' }; }","} catch (e) { throw e; }")],'test/tokens.test.mjs')
case('TC-35','Access tokens','A token declaring alg none is rejected','bad_alg','tested','TC-35 a token declaring alg none is rejected',[(T,"if (header.alg !== 'HS256') return { valid: false, reason: 'bad_alg' };","")],'test/tokens.test.mjs')
case('TC-36','Access tokens','A token issued more than 30 seconds in the future is rejected','not_yet_valid','untested',None,[(T,"if (claims.iat > t + CLOCK_SKEW_SECONDS)","if (false)")])
case('TC-37','Access tokens','Up to 30 seconds of clock skew is tolerated','valid','tested','TC-37 a token issued up to thirty seconds in the future is accepted',[(T,"export const CLOCK_SKEW_SECONDS = 30;","export const CLOCK_SKEW_SECONDS = 0;")],'test/tokens.test.mjs')
case('TC-38','Access tokens','Every access token has a unique id','Two tokens, two jti values','untested',None,[(T,"jti: randomBytes(12).toString('base64url')","jti: 'fixed'")])
case('TC-39','Access tokens','A revoked token is rejected','revoked','untested',None,[(T,"if (revoked.has(claims.jti)) return { valid: false, reason: 'revoked' };","")])
case('TC-40','Access tokens','Access token names its issuer','iss is turnstile','tested','TC-40 the access token names its issuer',[(T,"iss: config.issuer","iss: 'unknown'")],'test/tokens.test.mjs')
case('TC-41','Access tokens','An expired access token is rejected','expired','name_only','TC-41 rejects an expired access token',[(T,"if (claims.exp <= t - CLOCK_SKEW_SECONDS) return { valid: false, reason: 'expired' };","")],'test/tokens.test.mjs','assert.ok on the result object, which is always truthy')
# Refresh tokens
case('TC-42','Refresh tokens','Refreshing returns a new access token and a new refresh token','Both new','tested','TC-42 refreshing returns a new access token and a new refresh token',[(R,"refresh: issue(rec.sub, rec.family),","refresh: token,")],'test/refresh.test.mjs')
case('TC-43','Refresh tokens','A refresh token can be used only once','Second use refused, reused','name_only','refresh tokens rotate on use',[(R,"rec.used = true;\n","")],'test/refresh.test.mjs','checks that a new token came back, never tries the old one again')
case('TC-44','Refresh tokens','Reusing a rotated refresh token revokes the whole family','Every token in the family refused','untested',None,[(R,"for (const r of store.values()) if (r.family === rec.family) r.used = true;","")])
case('TC-45','Refresh tokens','A refresh token expires after 30 days','expired','tested','TC-45 a refresh token expires after thirty days',[(R,"if (rec.exp <= clock()) return { ok: false, reason: 'expired' };","")],'test/refresh.test.mjs')
case('TC-46','Refresh tokens','A refresh token for a deleted user is rejected','no_user','tested','TC-46 a refresh token for a deleted user is rejected',[(R,"if (users && !users.has(rec.sub)) return { ok: false, reason: 'no_user' };","")],'test/refresh.test.mjs')
case('TC-47','Refresh tokens','Refresh tokens are stored hashed','Raw token never in the store','untested',None,[(R,"const h = (t) => createHash('sha256').update(t).digest('hex');","const h = (t) => t;")])
# Sessions
case('TC-48','Sessions','Logging in creates a session','Session readable by id','tested','TC-48 logging in creates a session',[(S,"sessions.set(id, { userId, created: t, lastSeen: t });","")],'test/sessions.test.mjs')
case('TC-49','Sessions','A session ends after 30 minutes idle','null after 31 minutes','tested','TC-49 a session ends after thirty minutes idle',[(S,"if (t - s.lastSeen > IDLE_MS)","if (false)")],'test/sessions.test.mjs')
case('TC-50','Sessions','Activity extends the idle timer','Alive after 40 minutes with activity at 20','tested','activity keeps a session alive',[(S,"s.lastSeen = t;\n","")],'test/sessions.test.mjs')
case('TC-51','Sessions','A session ends after 12 hours regardless of activity','null after 12 hours','untested',None,[(S,"if (t - s.created > ABSOLUTE_MS)","if (false)")])
case('TC-52','Sessions','Logging out ends the session','null after logout','tested','TC-52 logging out ends the session',[(S,"function destroy(id) {\n    sessions.delete(id);","function destroy(id) {")],'test/sessions.test.mjs')
case('TC-53','Sessions','Log out everywhere ends every session for the user','All sessions gone','untested',None,[(S,"for (const [id, s] of sessions) if (s.userId === userId) sessions.delete(id);","")])
case('TC-54','Sessions','Session ids are 32 random bytes','64 hex characters','tested','TC-54 session ids are 32 random bytes',[(S,"randomBytes(32).toString('hex')","randomBytes(8).toString('hex')")],'test/sessions.test.mjs')
case('TC-55','Sessions','A user may hold at most five sessions, oldest evicted','Sixth login evicts the first session','untested',None,[],None,'not implemented at all; no mutation exists because there is no code')
# Rate limiting
case('TC-56','Rate limiting','Allow 100 requests a minute from one IP','All 100 allowed','tested','TC-56 allows 100 requests a minute from one IP',[(RL,"export const LIMIT = 100;","export const LIMIT = 99;")],'test/ratelimit.test.mjs')
case('TC-57','Rate limiting','Reject the 101st request in a minute from one IP','allowed false','name_only','TC-57 rejects requests over 100 a minute from one IP',[(RL,"if (b.count > limit)","if (false)")],'test/ratelimit.test.mjs','sends exactly 100 requests and asserts they were allowed; never sends the 101st')
case('TC-58','Rate limiting','The window resets after a minute','Allowed again after 60 seconds','untested',None,[(RL,"if (!b || t - b.start >= WINDOW_MS) {","if (!b) {")])
case('TC-59','Rate limiting','Limits are per IP','A second IP is unaffected','untested',None,[(RL,"let b = buckets.get(ip);","let b = buckets.get('all');"),(RL,"buckets.set(ip, b);","buckets.set('all', b);")])
case('TC-60','Rate limiting','A refused request says how long to wait','retryAfter in seconds','untested',None,[(RL,"retryAfter: Math.ceil((b.start + WINDOW_MS - t) / 1000)","retryAfter: 0")])
# Password reset
case('TC-61','Password reset','A reset link is issued for a known email','Token sent','tested','TC-61 a reset link is issued for a known email',[(RS,"return { sent: true, token };","return { sent: true };")],'test/reset.test.mjs')
case('TC-62','Password reset','An unknown email gets the same response as a known one','No user enumeration','tested','TC-62 an unknown email gets the same answer as a known one',[(RS,"if (!users.has(key)) return { sent: true };","if (!users.has(key)) return { sent: false };")],'test/reset.test.mjs')
case('TC-63','Password reset','A reset link expires after one hour','expired','tested','TC-63 a reset link expires after one hour',[(RS,"if (rec.exp <= clock()) { tokens.delete(h(token)); return { ok: false, reason: 'expired' }; }","")],'test/reset.test.mjs')
case('TC-64','Password reset','A reset link works once','Second use refused','tested','TC-64 a reset link works once',[(RS,"tokens.delete(h(token));\n    users.get","users.get")],'test/reset.test.mjs')
case('TC-65','Password reset','Completing a reset ends every session','All sessions gone','untested',None,[(RS,"sessions?.destroyAllFor(rec.email);","")])
case('TC-66','Password reset','The new password must meet the password rules','weak_password','tested','the new password must meet the password rules',[(RS,"if (errors.length) return { ok: false, reason: 'weak_password', errors };","")],'test/reset.test.mjs')
case('TC-67','Password reset','Reset tokens are stored hashed','Raw token never in the store','untested',None,[(RS,"const h = (t) => createHash('sha256').update(t).digest('hex');","const h = (t) => t;")])
# Audit
case('TC-68','Audit','A failed login is logged with the client IP','Entry with type and ip','tested','TC-68 a failed login is written to the audit log with the client IP',[(L,"audit({ type: 'login.failed', email: key, ip });","")],'test/login.test.mjs')
case('TC-69','Audit','A successful login is logged','Entry present','tested','TC-69 a successful login is written to the audit log',[(L,"audit({ type: 'login.succeeded', email: key, ip });","")],'test/login.test.mjs')
case('TC-70','Audit','A lockout is logged','Entry present','tested','TC-70 a lockout is written to the audit log',[(L,"audit({ type: 'account.locked', email: key, ip });","")],'test/login.test.mjs')
case('TC-71','Audit','The audit log never stores a password','No password in any entry','name_only','TC-71 the audit log never stores a password',[(A,"const { password, newPassword, ...safe } = event;","const safe = event;")],'test/audit.test.mjs','the assertion is inside a try/catch that swallows its failure')
case('TC-72','Audit','Audit entries carry an ISO 8601 timestamp','at is ISO 8601','untested',None,[(A,"at: new Date(clock()).toISOString()","at: clock()")])
case('TC-73','Audit','A completed password reset is logged','Entry present','untested',None,[(RS,"audit({ type: 'reset.completed', email: rec.email });","")])
# Roles
case('TC-74','Roles','An admin can manage users','can users:write','tested','TC-74 an admin can manage users',[(RO,"admin: ['users:read', 'users:write', 'tokens:revoke'],","admin: ['users:read'],")],'test/roles.test.mjs')
case('TC-75','Roles','An ordinary user cannot manage users','cannot users:write','tested','TC-75 an ordinary user cannot manage users',[(RO,"user: ['profile:read', 'profile:write'],","user: ['profile:read', 'profile:write', 'users:write'],")],'test/roles.test.mjs')
case('TC-76','Roles','An unknown role grants nothing','cannot anything','untested',None,[(RO,"(PERMISSIONS[r] ?? [])","(PERMISSIONS[r] ?? PERMISSIONS.user)")])
case('TC-77','Roles','A token with no roles claim grants nothing','cannot anything','untested',None,[(RO,"Array.isArray(claims?.roles) ? claims.roles : []","Array.isArray(claims?.roles) ? claims.roles : ['user']")])
case('TC-78','Roles','A role change applies from the next refreshed token','New roles in refreshed token','untested',None,[(R,"issueAccess(rec.sub, user?.roles ?? [], { now: clock() })","issueAccess(rec.sub, [], { now: clock() })")])
# Verification and accounts
case('TC-79','Email verification','Registering issues a verification token','Token returned','tested','TC-79 registering issues an email verification token',[(AC,"const verifyToken = verifier.issue(key);","const verifyToken = null;")],'test/accounts.test.mjs')
case('TC-80','Email verification','A verification link expires after 24 hours','expired','untested',None,[(VF,"if (rec.exp <= clock()) return { ok: false, reason: 'expired' };","")])
case('TC-81','Email verification','Confirming the link marks the email verified','emailVerified true','tested','TC-81 confirming the token marks the email as verified',[(VF,"users.get(rec.email).emailVerified = true;","")],'test/accounts.test.mjs')
case('TC-82','Email verification','A verification link works once','Second use refused','tested','a verification link cannot be used twice',[(VF,"pending.delete(token);","")],'test/accounts.test.mjs')
case('TC-83','Accounts','Deleting an account ends every session','All sessions gone','untested',None,[(AC,"sessions?.destroyAllFor(key);","")])
case('TC-84','Accounts','A deleted account cannot log in','Login refused','tested','TC-84 a deleted account cannot log in',[(AC,"users.delete(key);","")],'test/accounts.test.mjs')
case('TC-85','Registration','Registering an existing email is refused','exists','tested','TC-85 registering an email that already exists is refused',[(AC,"if (users.has(key)) return { ok: false, reason: 'exists' };","")],'test/accounts.test.mjs')
# Manual, non-functional
case('TC-86','Non-functional','Penetration test sign-off for the release','Signed report on file','manual')
case('TC-87','Non-functional','Login and reset pages usable with a screen reader','Checked with VoiceOver and NVDA','manual')
case('TC-88','Non-functional','Reset and verification emails render in Outlook and Gmail','Checked by eye','manual')
case('TC-89','Non-functional','Sustains 500 logins a second on the reference box','Load test report','manual')
case('TC-90','Non-functional','Security headers reviewed on every endpoint','Reviewed in the release meeting','manual')

# Extra tests in the suite that implement no plan case. A good mapping leaves them unmapped.
EXTRA_TESTS = ['hash format is self-describing']

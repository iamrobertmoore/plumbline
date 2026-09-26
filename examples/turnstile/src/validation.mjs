export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
export const EMAIL_MAX = 254;

const COMMON = new Set(['password1234', 'qwertyuiop1', 'letmein12345', '1234567890a', 'iloveyou123']);

export function normaliseEmail(email) {
  return String(email).trim().toLowerCase();
}

export function validateEmail(email) {
  const e = normaliseEmail(email);
  if (e.length > EMAIL_MAX) return false;
  const at = e.indexOf('@');
  if (at < 1 || at !== e.lastIndexOf('@')) return false;
  const domain = e.slice(at + 1);
  if (!domain.includes('.')) return false;
  return !/\s/.test(e);
}

export function validatePassword(pw, { email } = {}) {
  const errors = [];
  if (pw.length < PASSWORD_MIN) errors.push('too_short');
  if (pw.length > PASSWORD_MAX) errors.push('too_long');
  if (!/\d/.test(pw)) errors.push('no_digit');
  if (email) {
    const local = normaliseEmail(email).split('@')[0];
    if (local.length >= 3 && pw.toLowerCase().includes(local)) errors.push('contains_email');
  }
  if (COMMON.has(pw.toLowerCase())) errors.push('common');
  return errors;
}

export function validateUsername(u) {
  return /^[a-z0-9_]{3,32}$/.test(u);
}

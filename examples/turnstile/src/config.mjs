// Configuration is read from the environment once, at import.
export const config = {
  secret: process.env.TURNSTILE_SECRET ?? 'dev-only-secret-change-me',
  issuer: process.env.TURNSTILE_ISSUER ?? 'turnstile',
};

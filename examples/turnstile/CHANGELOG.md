# Changelog

## 2.3.0

- Completing a password reset now ends every active session for the account.

## 2.2.0

- Refresh tokens now belong to a family, and reusing a rotated token revokes the family.
- Access tokens carry an `iss` claim.

## 2.1.0

- Email verification. An account cannot log in until its address is verified.
- Reset links expire after one hour.

## 2.0.0

- Password hashing moved to scrypt.
- Sessions have an absolute lifetime of 12 hours as well as the idle timeout.

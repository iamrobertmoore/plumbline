export const PERMISSIONS = {
  admin: ['users:read', 'users:write', 'tokens:revoke'],
  user: ['profile:read', 'profile:write'],
};

export function can(claims, permission) {
  const roles = Array.isArray(claims?.roles) ? claims.roles : [];
  return roles.some((r) => (PERMISSIONS[r] ?? []).includes(permission));
}

export function createAuditLog({ clock = () => Date.now() } = {}) {
  const entries = [];

  function record(event) {
    const { password, newPassword, ...safe } = event;
    entries.push({ at: new Date(clock()).toISOString(), ...safe });
  }

  return { record, entries };
}

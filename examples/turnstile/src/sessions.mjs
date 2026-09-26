import { randomBytes } from 'node:crypto';

export const IDLE_MS = 30 * 60 * 1000;
export const ABSOLUTE_MS = 12 * 60 * 60 * 1000;

export function createSessionStore({ clock = () => Date.now() } = {}) {
  const sessions = new Map();

  function create(userId) {
    const id = randomBytes(32).toString('hex');
    const t = clock();
    sessions.set(id, { userId, created: t, lastSeen: t });
    return id;
  }

  function get(id) {
    const s = sessions.get(id);
    if (!s) return null;
    const t = clock();
    if (t - s.lastSeen > IDLE_MS) { sessions.delete(id); return null; }
    if (t - s.created > ABSOLUTE_MS) { sessions.delete(id); return null; }
    s.lastSeen = t;
    return s;
  }

  function destroy(id) {
    sessions.delete(id);
  }

  function destroyAllFor(userId) {
    for (const [id, s] of sessions) if (s.userId === userId) sessions.delete(id);
  }

  return { create, get, destroy, destroyAllFor, count: () => sessions.size };
}

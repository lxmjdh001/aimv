import { authenticateDbUser, createDbSession, deleteDbSession, getDbSessionUser } from './db.js';

const cookieName = 'ai_mv_session';

export function parseCookies(request) {
  const header = request.headers.cookie ?? '';
  return Object.fromEntries(
    header.split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function sessionTokenFromRequest(request) {
  const cookies = parseCookies(request);
  const header = request.headers.authorization ?? '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return cookies[cookieName];
}

export function getRequestUser(request) {
  return getDbSessionUser(sessionTokenFromRequest(request));
}

export function loginUser(email, password) {
  const user = authenticateDbUser(email, password);
  if (!user) return null;
  const session = createDbSession(user.id);
  return { user, session };
}

export function logoutRequest(request) {
  deleteDbSession(sessionTokenFromRequest(request));
}

export function sessionCookie(session) {
  return `${cookieName}=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
}

export function clearSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

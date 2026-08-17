import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const EXPIRES_IN = '12h';

// One shared helper for signing/verifying the session token issued at
// login (backend/src/routes/auth.js) and checked by requireAdminAuth
// (backend/src/admin/auth.js) — a regular user gets the same kind of
// token as an admin, just with is_admin: false, so there's a single
// token format for the whole app rather than two.
export function signSession(user) {
  return jwt.sign({ sub: user.id, email: user.email, is_admin: !!user.is_admin }, env.sessionSecret, { expiresIn: EXPIRES_IN });
}

export function verifySession(token) {
  return jwt.verify(token, env.sessionSecret);
}

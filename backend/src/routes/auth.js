import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { signSession } from '../admin/session.js';

export const authRouter = Router();

// Backs the login/senha form already built in the frontend (p-auth in
// index.html). Login issues a signed session token (12h) — needed once the
// admin review panel required real, server-verifiable identity instead of
// just a client-side "logged in" flag. is_admin is never settable from
// signup; it only exists as a DB column an operator sets directly.

authRouter.post('/signup', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'validation_error', message: 'Informe um e-mail válido.' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'validation_error', message: 'A senha precisa ter pelo menos 8 caracteres.' });
    }

    const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.trim().toLowerCase(), passwordHash],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'validation_error', message: 'Informe login e senha.' });
    }
    const { rows } = await pool.query('SELECT id, email, password_hash, is_admin FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    // Same generic message whether the user doesn't exist or the password is
    // wrong — don't leak which one it was.
    const invalid = () => res.status(401).json({ error: 'invalid_credentials', message: 'Login ou senha incorretos.' });
    if (!rows.length) return invalid();

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return invalid();

    const token = signSession(rows[0]);
    res.json({ id: rows[0].id, email: rows[0].email, is_admin: rows[0].is_admin, token });
  } catch (err) { next(err); }
});

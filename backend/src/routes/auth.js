import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';

export const authRouter = Router();

// Backs the login/senha form already built in the frontend (p-auth in
// index.html). This implements real password hashing and credential
// verification — it does not yet issue a session token or cookie, since
// that wasn't asked for in this phase and pulls in a separate set of
// decisions (JWT vs. server session, expiry, refresh). Treat that as the
// next increment once this phase is reviewed.

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
    const { rows } = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    // Same generic message whether the user doesn't exist or the password is
    // wrong — don't leak which one it was.
    const invalid = () => res.status(401).json({ error: 'invalid_credentials', message: 'Login ou senha incorretos.' });
    if (!rows.length) return invalid();

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return invalid();

    res.json({ id: rows[0].id, email: rows[0].email });
  } catch (err) { next(err); }
});

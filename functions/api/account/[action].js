// Study Hub accounts: /api/account/me (GET) and /api/account/signup | login | logout | reset | delete (POST).
import { json, allowedOrigin, clientIp, rateLimited, readJson } from "../../../lib/shared.js";
import {
  ensureSchema, hashSecret, sameText, randomToken, newRecoveryCode, normaliseCode,
  validUsername, validPassword, createSession, currentUser, endSession, clearCookie,
} from "../../../lib/auth.js";

const AUTH_LIMIT = 15;           // sign-in attempts per IP per 10 minutes
const MAX_FAILS = 5;             // wrong passwords before a username is locked…
const LOCK_MS = 15 * 60 * 1000;  // …for 15 minutes (best effort, per worker)
const fails = new Map();         // username -> { count, until }

const locked = (u) => { const f = fails.get(u); return f && f.until > Date.now(); };
function failed(u) {
  const f = fails.get(u) || { count: 0, until: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.count = 0; }
  fails.set(u, f);
  if (fails.size > 5000) fails.clear();
}

const withCookie = (body, cookie, status = 200) => {
  const res = json(body, status);
  res.headers.append("Set-Cookie", cookie);
  return res;
};

async function newSecrets(password) {
  const pwSalt = randomToken(16), recSalt = randomToken(16), recoveryCode = newRecoveryCode();
  return {
    pwSalt, pwHash: await hashSecret(password, pwSalt),
    recSalt, recHash: await hashSecret(normaliseCode(recoveryCode), recSalt),
    recoveryCode,
  };
}

async function findUser(db, username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
}

export async function onRequestGet({ env, request, params }) {
  if (!env.DB) return json({ error: "accounts_off" }, 503);
  if (params.action !== "me") return json({ error: "not_found" }, 404);
  await ensureSchema(env.DB);
  const user = await currentUser(env.DB, request);
  return user ? json({ username: user.username }) : json({ error: "signed_out" }, 401);
}

export async function onRequestPost({ env, request, params }) {
  if (!allowedOrigin(request)) return json({ error: "forbidden" }, 403);
  if (!env.DB) return json({ error: "accounts_off" }, 503);
  const db = env.DB;
  await ensureSchema(db);
  const action = params.action;

  if (action === "logout") {
    await endSession(db, request);
    return withCookie({ ok: true }, clearCookie());
  }

  if (rateLimited("auth:" + clientIp(request), AUTH_LIMIT)) return json({ error: "rate_limited" }, 429);
  const body = (await readJson(request)) || {};
  const username = String(body.username || "").trim().toLowerCase();

  if (action === "signup") {
    if (!validUsername(username)) return json({ error: "bad_username" }, 400);
    if (!validPassword(body.password)) return json({ error: "bad_password" }, 400);
    if (await findUser(db, username)) return json({ error: "taken" }, 409);
    const s = await newSecrets(body.password);
    let row;
    try {
      row = await db.prepare(
        "INSERT INTO users (username, pw_hash, pw_salt, rec_hash, rec_salt, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
      ).bind(username, s.pwHash, s.pwSalt, s.recHash, s.recSalt, Date.now()).first();
    } catch (e) {
      return json({ error: "taken" }, 409); // someone took it at the same moment
    }
    return withCookie({ username, recoveryCode: s.recoveryCode }, await createSession(db, row.id));
  }

  if (action === "login") {
    if (!validUsername(username) || typeof body.password !== "string") return json({ error: "wrong_login" }, 401);
    if (locked(username)) return json({ error: "locked" }, 429);
    const user = await findUser(db, username);
    if (!user || !sameText(await hashSecret(body.password.slice(0, 128), user.pw_salt), user.pw_hash)) {
      failed(username);
      return json({ error: "wrong_login" }, 401);
    }
    fails.delete(username);
    return withCookie({ username }, await createSession(db, user.id));
  }

  if (action === "reset") {
    if (!validPassword(body.newPassword)) return json({ error: "bad_password" }, 400);
    if (!validUsername(username)) return json({ error: "wrong_code" }, 401);
    if (locked(username)) return json({ error: "locked" }, 429);
    const user = await findUser(db, username);
    if (!user || !sameText(await hashSecret(normaliseCode(body.recoveryCode).slice(0, 64), user.rec_salt), user.rec_hash)) {
      failed(username);
      return json({ error: "wrong_code" }, 401);
    }
    fails.delete(username);
    const s = await newSecrets(body.newPassword); // the old recovery code stops working too
    await db.batch([
      db.prepare("UPDATE users SET pw_hash = ?, pw_salt = ?, rec_hash = ?, rec_salt = ? WHERE id = ?")
        .bind(s.pwHash, s.pwSalt, s.recHash, s.recSalt, user.id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id), // sign out everywhere else
    ]);
    return withCookie({ username, recoveryCode: s.recoveryCode }, await createSession(db, user.id));
  }

  if (action === "delete") {
    const me = await currentUser(db, request);
    if (!me) return json({ error: "signed_out" }, 401);
    const user = await findUser(db, me.username);
    if (typeof body.password !== "string" || !sameText(await hashSecret(body.password.slice(0, 128), user.pw_salt), user.pw_hash)) {
      return json({ error: "wrong_login" }, 401);
    }
    await db.batch([
      db.prepare("DELETE FROM progress WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
      db.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
    ]);
    return withCookie({ ok: true }, clearCookie());
  }

  return json({ error: "not_found" }, 404);
}

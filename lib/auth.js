import crypto from "node:crypto";

export const SESSION_COOKIE = "diablo_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 hari

function hmac(value) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET belum diset.");
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

/** Daftar Telegram User ID yang boleh memakai Diablo. Kosong = semua boleh. */
export function isAllowedUser(uid) {
  const raw = process.env.TELEGRAM_ALLOWED_USER_IDS || process.env.ALLOWED_TELEGRAM_USER_IDS || "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length === 0 || ids.includes(String(uid));
}

export function signSession(uid) {
  const payload = Buffer.from(
    JSON.stringify({ uid: String(uid), exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 })
  ).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

/** Ambil Telegram User ID dari cookie session. null jika tidak valid/kedaluwarsa. */
export function readSession(req) {
  try {
    const [payload, sig] = (req.cookies.get(SESSION_COOKIE)?.value || "").split(".");
    if (!payload || !sig) return null;
    const expected = hmac(payload);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return exp > Date.now() && isAllowedUser(uid) ? uid : null;
  } catch {
    return null;
  }
}

/** URL publik web (untuk link login dari bot). */
export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

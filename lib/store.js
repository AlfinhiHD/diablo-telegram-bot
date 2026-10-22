import crypto from "node:crypto";
import fs from "fs/promises";
import path from "path";
import { getDb } from "./firebase-admin.js";
import { getConfig } from "./bundled-config.js";

function loginTokenHmac(value) {
  const secret = getConfig("SESSION_SECRET") || "e5cbdaa0493d7cf856711e7a5d62f0189e59915275dbabd22c38bd59cd0436c6";
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export const DEFAULT_PROFILE = {
  ownerName: "",
  monthlyIncome: 0,
  paydayDate: 25,
  fixedCosts: [], // [{ id, name, amount }]
  savingsPots: [], // [{ id, name, monthly, target, deadline: "YYYY-MM", saved }]
  setupDone: false,
};

const USERS = "diablo_users";
const TOKENS = "diablo_login_tokens";
const LOGIN_TOKEN_TTL_MS = 10 * 60 * 1000;

// ---------- Penyimpanan lokal (fallback jika Firebase belum dikonfigurasi) ----------
const LOCAL_DIR = process.env.VERCEL
  ? path.join("/tmp", ".data")
  : path.join(process.cwd(), ".data");

async function readLocal(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(LOCAL_DIR, `${name}.json`), "utf-8"));
  } catch {
    return fallback;
  }
}

async function writeLocal(name, data) {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, `${name}.json`), JSON.stringify(data, null, 2), "utf-8");
}

const localKey = (uid) => `user-${String(uid).replace(/[^\w-]/g, "")}`;
const readLocalUser = (uid) => readLocal(localKey(uid), { profile: null, transactions: [], advisorHistory: [] });
const userDoc = (db, uid) => db.collection(USERS).doc(String(uid));

// ---------- Helpers ----------
const toAmount = (n) => Math.max(0, Math.min(1e12, Math.round(Number(n) || 0)));
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

function normalizeProfile(p) {
  return {
    ...DEFAULT_PROFILE,
    ...(p || {}),
    fixedCosts: Array.isArray(p?.fixedCosts) ? p.fixedCosts : [],
    savingsPots: Array.isArray(p?.savingsPots) ? p.savingsPots : [],
  };
}

async function writeProfile(uid, profile) {
  const db = getDb();
  if (db) {
    await userDoc(db, uid).collection("config").doc("profile").set(profile);
    return profile;
  }
  const store = await readLocalUser(uid);
  store.profile = profile;
  await writeLocal(localKey(uid), store);
  return profile;
}

// ---------- Profil ----------
export async function getUserProfile(uid) {
  const db = getDb();
  if (db) {
    const snap = await userDoc(db, uid).collection("config").doc("profile").get();
    return normalizeProfile(snap.exists ? snap.data() : null);
  }
  return normalizeProfile((await readLocalUser(uid)).profile);
}

/** Simpan dari halaman Atur. Menandai setup selesai. */
export async function saveUserProfile(uid, input = {}) {
  const clean = {
    ownerName: String(input.ownerName || "").trim().slice(0, 40),
    monthlyIncome: toAmount(input.monthlyIncome),
    paydayDate: Math.min(28, Math.max(1, Math.round(Number(input.paydayDate) || 25))),
    fixedCosts: (input.fixedCosts || []).slice(0, 30).map((c) => ({
      id: c.id || newId("fc"),
      name: String(c.name || "").trim().slice(0, 60) || "Tagihan",
      amount: toAmount(c.amount),
    })),
    savingsPots: (input.savingsPots || []).slice(0, 30).map((p) => ({
      id: p.id || newId("pot"),
      name: String(p.name || "").trim().slice(0, 60) || "Tabungan",
      monthly: toAmount(p.monthly),
      target: toAmount(p.target),
      deadline: /^\d{4}-\d{2}$/.test(p.deadline || "") ? p.deadline : "",
      saved: toAmount(p.saved),
    })),
    setupDone: true,
  };
  return writeProfile(uid, clean);
}

/** Tambah saldo ke pos tabungan berdasarkan id atau nama (dipakai web & /nabung). */
export async function addToPot(uid, { id, name }, amount) {
  const profile = await getUserProfile(uid);
  const q = String(name || "").toLowerCase().trim();
  const pot =
    profile.savingsPots.find((p) => (id ? p.id === id : p.name.toLowerCase() === q)) ||
    (q ? profile.savingsPots.find((p) => p.name.toLowerCase().includes(q)) : null);
  if (!pot) return { pot: null, pots: profile.savingsPots };
  pot.saved = toAmount(pot.saved + amount);
  await writeProfile(uid, profile);
  return { pot, pots: profile.savingsPots };
}

// ---------- Transaksi ----------
export async function getTransactions(uid, limitCount = 300) {
  const db = getDb();
  if (db) {
    const snap = await userDoc(db, uid).collection("transactions").orderBy("createdAt", "desc").limit(limitCount).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return ((await readLocalUser(uid)).transactions || []).slice(0, limitCount);
}

export async function addTransaction(uid, tx) {
  const entry = {
    amount: toAmount(tx.amount),
    item: String(tx.item || "Pengeluaran").trim().slice(0, 80),
    category: String(tx.category || "Lainnya").trim().slice(0, 40),
    intent: tx.intent === "NEED" ? "NEED" : "WANT",
    paymentMethod: String(tx.paymentMethod || "QRIS").trim().slice(0, 30),
    notes: String(tx.notes || "").trim().slice(0, 200),
    source: String(tx.source || "telegram"),
    createdAt: tx.createdAt ? new Date(tx.createdAt).toISOString() : new Date().toISOString(),
  };

  const db = getDb();
  if (db) {
    const ref = await userDoc(db, uid).collection("transactions").add(entry);
    return { id: ref.id, ...entry };
  }
  const store = await readLocalUser(uid);
  const created = { id: newId("tx"), ...entry };
  store.transactions = [created, ...(store.transactions || [])];
  await writeLocal(localKey(uid), store);
  return created;
}

export async function toggleTransactionIntent(uid, txId) {
  const db = getDb();
  if (db) {
    const ref = userDoc(db, uid).collection("transactions").doc(String(txId));
    const snap = await ref.get();
    if (!snap.exists) return null;
    const intent = snap.data().intent === "NEED" ? "WANT" : "NEED";
    await ref.update({ intent });
    return { id: txId, ...snap.data(), intent };
  }
  const store = await readLocalUser(uid);
  const tx = (store.transactions || []).find((t) => t.id === txId);
  if (!tx) return null;
  tx.intent = tx.intent === "NEED" ? "WANT" : "NEED";
  await writeLocal(localKey(uid), store);
  return tx;
}

export async function deleteTransaction(uid, txId) {
  const db = getDb();
  if (db) {
    await userDoc(db, uid).collection("transactions").doc(String(txId)).delete();
    return true;
  }
  const store = await readLocalUser(uid);
  store.transactions = (store.transactions || []).filter((t) => t.id !== txId);
  await writeLocal(localKey(uid), store);
  return true;
}

export async function undoLastTransaction(uid) {
  const [last] = await getTransactions(uid, 1);
  if (!last) return null;
  await deleteTransaction(uid, last.id);
  return last;
}

export async function addAdvisorHistory(uid, { question, reply, verdict }) {
  const entry = { question, reply, verdict, createdAt: new Date().toISOString() };
  const db = getDb();
  if (db) {
    await userDoc(db, uid).collection("advisor_history").add(entry);
    return entry;
  }
  const store = await readLocalUser(uid);
  store.advisorHistory = [...(store.advisorHistory || []), entry].slice(-50);
  await writeLocal(localKey(uid), store);
  return entry;
}

export async function getAdvisorHistory(uid, max = 30) {
  const db = getDb();
  if (db) {
    const snap = await userDoc(db, uid)
      .collection("advisor_history")
      .orderBy("createdAt", "desc")
      .limit(max)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  const store = await readLocalUser(uid);
  return (store.advisorHistory || []).slice(-max).reverse();
}

// ---------- Login token cryptographic HMAC (dikirim bot lewat /login) ----------
export async function createLoginToken(uid) {
  const payload = Buffer.from(
    JSON.stringify({
      uid: String(uid),
      exp: Date.now() + LOGIN_TOKEN_TTL_MS,
      nonce: crypto.randomBytes(6).toString("hex"),
    })
  ).toString("base64url");
  return `${payload}.${loginTokenHmac(payload)}`;
}

/** Tukar token jadi uid. Memverifikasi signature cryptographic & timestamp */
export async function consumeLoginToken(token) {
  try {
    const [payload, sig] = (token || "").split(".");
    if (!payload || !sig) return null;
    const expected = loginTokenHmac(payload);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (exp < Date.now()) return null;
    return String(uid);
  } catch {
    return null;
  }
}

// ---------- Analitik (sederhana) ----------
function monthsUntil(deadline, now) {
  const [y, m] = deadline.split("-").map(Number);
  return Math.max(1, y * 12 + (m - 1) - (now.getFullYear() * 12 + now.getMonth()));
}

function potStatus(pot, now) {
  const target = Number(pot.target) || 0;
  const saved = Number(pot.saved) || 0;
  const monthly = Number(pot.monthly) || 0;
  const progress = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  const base = { ...pot, progress, requiredMonthly: 0, shortfall: 0, monthsToGoal: null };

  if (target <= 0) return { ...base, state: "BEBAS" };
  if (saved >= target) return { ...base, state: "TERCAPAI" };

  const remaining = target - saved;
  if (pot.deadline) {
    const requiredMonthly = Math.ceil(remaining / monthsUntil(pot.deadline, now));
    return {
      ...base,
      requiredMonthly,
      shortfall: Math.max(0, requiredMonthly - monthly),
      state: monthly >= requiredMonthly ? "CUKUP" : "KURANG",
    };
  }
  return { ...base, state: "JALAN", monthsToGoal: monthly > 0 ? Math.ceil(remaining / monthly) : null };
}

/**
 * Inti Diablo: berapa uang bebas bulan ini & berapa boleh dipakai hari ini.
 * Uang bebas = gaji - tagihan tetap - setoran tabungan.
 */
export function computeAnalytics(profile, transactions = []) {
  const now = new Date();
  const payday = Math.min(28, Math.max(1, Number(profile.paydayDate) || 25));
  const DAY = 86_400_000;

  let cycleStart = new Date(now.getFullYear(), now.getMonth(), payday);
  if (now.getDate() < payday) cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, payday);
  const cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, payday);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const totalDays = Math.round((cycleEnd - cycleStart) / DAY);
  const daysElapsed = Math.max(1, Math.ceil((now - cycleStart) / DAY));
  const daysRemaining = Math.max(1, Math.round((cycleEnd - startOfToday) / DAY)); // termasuk hari ini

  const income = Number(profile.monthlyIncome) || 0;
  const fixedTotal = profile.fixedCosts.reduce((a, c) => a + (Number(c.amount) || 0), 0);
  const savingsMonthly = profile.savingsPots.reduce((a, p) => a + (Number(p.monthly) || 0), 0);
  const disposable = income - fixedTotal - savingsMonthly;

  const cycleTx = transactions.filter((t) => {
    const d = new Date(t.createdAt);
    return d >= cycleStart && d < cycleEnd;
  });
  const spent = cycleTx.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const todaySpent = cycleTx
    .filter((t) => new Date(t.createdAt) >= startOfToday)
    .reduce((a, t) => a + (Number(t.amount) || 0), 0);

  const remaining = disposable - spent;
  // Jatah harian dihitung dari sisa uang di awal hari ini agar angkanya stabil sepanjang hari.
  const dailyBudget = Math.max(0, Math.round((remaining + todaySpent) / daysRemaining));
  const todayLeft = dailyBudget - todaySpent;
  const avgDaily = Math.round(spent / daysElapsed);

  const byCategory = {};
  let wantsTotal = 0;
  for (const t of cycleTx) {
    const amt = Number(t.amount) || 0;
    byCategory[t.category || "Lainnya"] = (byCategory[t.category || "Lainnya"] || 0) + amt;
    if (t.intent !== "NEED") wantsTotal += amt;
  }
  const categories = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, spent: amount, percent: spent > 0 ? Math.round((amount / spent) * 100) : 0 }))
    .sort((a, b) => b.spent - a.spent);

  let status = "AMAN";
  let message = "Siap Tuan, keuangan masih aman. Pertahankan.";
  if (remaining < 0) {
    status = "BAHAYA";
    message = `Maaf Tuan, kalau begini Tuan tidak bisa hidup layak. Uang bebas bulan ini sudah minus ${formatRp(-remaining)}.`;
  } else if (todayLeft < 0) {
    status = "HATI_HATI";
    message = `Maaf Tuan, jatah hari ini sudah lewat ${formatRp(-todayLeft)}. Mohon tahan dulu belanjanya.`;
  } else if (spent > 0 && avgDaily * daysRemaining > remaining) {
    status = "HATI_HATI";
    message = `Siap Tuan, tapi rata-rata belanja ${formatRp(avgDaily)}/hari terlalu kencang. Uang bisa habis sebelum gajian.`;
  }

  const wantsPct = spent > 0 ? Math.round((wantsTotal / spent) * 100) : 0;
  const needsPct = 100 - wantsPct;

  return {
    cycle: { start: cycleStart.toISOString(), end: cycleEnd.toISOString(), totalDays, daysElapsed, daysRemaining },
    budget: {
      income,
      fixedTotal,
      savingsMonthly,
      disposable,
      spent,
      remaining,
      remainingBudget: remaining,
      dailyBudget,
      safeDailySpend: dailyBudget,
      todaySpent,
      todayLeft,
      todayRemaining: todayLeft,
      avgDaily,
      cycleBudget: disposable,
      cycleSpent: spent,
    },
    status,
    message,
    categories,
    wantsTotal,
    wantsPercent: wantsPct,
    needsPercent: needsPct,
    leakDetector: {
      needsPercent: needsPct,
      wantsPercent: wantsPct,
      wantsTotal,
    },
    projection: {
      isDanger: remaining < 0 || (avgDaily > 0 && avgDaily * daysRemaining > remaining),
      daysUntilBroke: avgDaily > 0 ? Math.max(0, Math.floor(remaining / avgDaily)) : 99,
    },
    pots: profile.savingsPots.map((p) => potStatus(p, now)),
  };
}

function formatRp(n) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

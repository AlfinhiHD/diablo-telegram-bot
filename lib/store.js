import crypto from "node:crypto";
import fs from "fs/promises";
import path from "path";
import { getDb } from "./firebase-admin.js";
import { getConfig } from "./bundled-config.js";
import { toWibParts, fromWib, startOfWibDay } from "./format.js";
import { cleanItemName } from "./diablo-ai.js";
import {
  getCycleBounds,
  getPreviousPeriodKey,
  listAvailablePeriods,
  computePeriodReport,
  buildPeriodCsv,
  buildPeriodTelegramReport,
} from "./period-report.js";

export {
  getCycleBounds,
  getPreviousPeriodKey,
  listAvailablePeriods,
  computePeriodReport,
  buildPeriodCsv,
  buildPeriodTelegramReport,
};

function loginTokenHmac(value) {
  const secret = getConfig("SESSION_SECRET") || "e5cbdaa0493d7cf856711e7a5d62f0189e59915275dbabd22c38bd59cd0436c6";
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export const DEFAULT_PROFILE = {
  ownerName: "",
  telegramName: "",
  telegramUsername: "",
  monthlyIncome: 0,
  paydayDate: 25,
  fixedCosts: [], // [{ id, name, amount, dueDay, cycleMonths, nextDueDate, lastPaidAt, isSinkingFund, activeFrom, note }]
  savingsPots: [], // [{ id, name, monthly, target, deadline: "YYYY-MM", saved, walletId }]
  wallets: [], // [{ id, name, balance, role: "daily"|"saving"|"credit"|"emergency", locked: boolean }]
  debts: [], // [{ id, type: "utang"|"piutang", person, amount: number|null, note, status: "open"|"paid", targetWalletId, snoozedUntil, lastRemindedAt, createdAt, paidAt }]
  wishlists: [], // [{ id, name, price, saved, url, priority: "high"|"medium"|"low", status: "planned"|"bought", note, createdAt, boughtAt }]
  telegramChannels: { groupChatId: "", advisorThreadId: "", loggerThreadId: "" },
  pendingPastExpense: null,
  pendingWalletSelection: null,
  pendingAuditAdjustment: null,
  lastReminderDate: "", // YYYY-MM-DD WIB
  lastCycleReportPeriod: "", // YYYY-MM (periode terakhir yang laporan otomatisnya sudah terkirim)
  setupDone: false,
};

const USERS = "diablo_users";
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
const toSignedBalance = (n) => Math.max(-1e12, Math.min(1e12, Math.round(Number(n) || 0)));
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;

function sanitizeWallets(wallets) {
  if (!Array.isArray(wallets)) return [];
  const validRoles = ["daily", "saving", "credit", "emergency"];
  return wallets.slice(0, 20).map((w) => ({
    id: String(w.id || newId("wal")).trim().slice(0, 40),
    name: String(w.name || "Dompet").trim().slice(0, 60) || "Dompet",
    balance: toSignedBalance(w.balance),
    role: validRoles.includes(w.role) ? w.role : "daily",
    locked: Boolean(w.locked),
  }));
}

function sanitizeFixedCosts(fixedCosts) {
  if (!Array.isArray(fixedCosts)) return [];
  return fixedCosts.slice(0, 30).map((c) => {
    const dueDayRaw = Number(c.dueDay);
    const dueDay = dueDayRaw >= 1 && dueDayRaw <= 31 ? Math.round(dueDayRaw) : null;
    const cycleRaw = Number(c.cycleMonths);
    const cycleMonths = cycleRaw >= 1 && cycleRaw <= 12 ? Math.round(cycleRaw) : 1;
    const nextDueDate = /^\d{4}-\d{2}-\d{2}$/.test(c.nextDueDate || "") ? c.nextDueDate : "";
    const activeFrom = /^\d{4}-\d{2}-\d{2}$/.test(c.activeFrom || "") ? c.activeFrom : "";
    return {
      id: c.id || newId("fc"),
      name: String(c.name || "").trim().slice(0, 80) || "Tagihan",
      amount: toAmount(c.amount),
      dueDay,
      cycleMonths,
      nextDueDate,
      lastPaidAt: c.lastPaidAt ? new Date(c.lastPaidAt).toISOString() : null,
      isSinkingFund: Boolean(c.isSinkingFund),
      activeFrom,
      note: String(c.note || "").trim().slice(0, 120),
    };
  });
}

function sanitizeDebts(debts) {
  if (!Array.isArray(debts)) return [];
  return debts.slice(0, 100).map((d) => ({
    id: String(d.id || newId("debt")).trim().slice(0, 50),
    type: String(d.type || "utang").toLowerCase() === "piutang" ? "piutang" : "utang",
    person: String(d.person || "Anonim").trim().slice(0, 60) || "Anonim",
    amount: d.amount === null || d.amount === undefined || d.amount === "" ? null : toAmount(d.amount),
    note: String(d.note || "").trim().slice(0, 300),
    status: String(d.status || "open").toLowerCase() === "paid" ? "paid" : "open",
    targetWalletId: String(d.targetWalletId || "").trim().slice(0, 40),
    snoozedUntil: d.snoozedUntil ? new Date(d.snoozedUntil).toISOString() : null,
    lastRemindedAt: d.lastRemindedAt ? new Date(d.lastRemindedAt).toISOString() : null,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
    paidAt: d.paidAt ? new Date(d.paidAt).toISOString() : null,
  }));
}

function sanitizeWishlists(list) {
  if (!Array.isArray(list)) return [];
  const validPrio = ["high", "medium", "low"];
  return list.slice(0, 60).map((w) => ({
    id: String(w.id || newId("wish")).trim().slice(0, 50),
    name: String(w.name || "Barang Wishlist").trim().slice(0, 80) || "Barang Wishlist",
    price: toAmount(w.price),
    saved: toAmount(w.saved),
    url: String(w.url || "").trim().slice(0, 300),
    priority: validPrio.includes(String(w.priority || "").toLowerCase()) ? String(w.priority).toLowerCase() : "medium",
    status: String(w.status || "planned").toLowerCase() === "bought" ? "bought" : "planned",
    note: String(w.note || "").trim().slice(0, 200),
    createdAt: w.createdAt ? new Date(w.createdAt).toISOString() : new Date().toISOString(),
    boughtAt: w.boughtAt ? new Date(w.boughtAt).toISOString() : null,
  }));
}

function sanitizeTelegramChannels(ch) {
  return {
    groupChatId: String(ch?.groupChatId || "").trim().slice(0, 40),
    advisorThreadId: String(ch?.advisorThreadId || "").trim().slice(0, 40),
    loggerThreadId: String(ch?.loggerThreadId || "").trim().slice(0, 40),
  };
}

function normalizeProfile(p) {
  const norm = {
    ...DEFAULT_PROFILE,
    ...(p || {}),
    fixedCosts: sanitizeFixedCosts(p?.fixedCosts),
    savingsPots: Array.isArray(p?.savingsPots) ? p.savingsPots : [],
    wallets: Array.isArray(p?.wallets) ? sanitizeWallets(p.wallets) : [],
    debts: Array.isArray(p?.debts) ? sanitizeDebts(p.debts) : [],
    wishlists: Array.isArray(p?.wishlists) ? sanitizeWishlists(p.wishlists) : [],
    telegramChannels: sanitizeTelegramChannels(p?.telegramChannels),
    pendingPastExpense: p?.pendingPastExpense || null,
    pendingWalletSelection: p?.pendingWalletSelection || null,
    pendingAuditAdjustment: p?.pendingAuditAdjustment || null,
    lastReminderDate: String(p?.lastReminderDate || ""),
    lastCycleReportPeriod: String(p?.lastCycleReportPeriod || ""),
  };
  if (!norm.ownerName && p?.telegramName) norm.ownerName = p.telegramName;
  return norm;
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

/** Daftar semua user ID yang terdaftar (dipakai cron reminder). */
export async function listAllUserIds() {
  const db = getDb();
  if (db) {
    try {
      const snap = await db.collection(USERS).listDocuments();
      const ids = snap.map((d) => d.id).filter(Boolean);
      if (ids.length > 0) return ids;
    } catch {
      // fallback below
    }
  }
  const raw = getConfig("TELEGRAM_ALLOWED_USER_IDS") || getConfig("ALLOWED_TELEGRAM_USER_IDS") || "";
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.length > 0 ? allowed : ["1128526190"];
}

/** Cari wallet berdasarkan id, nama, atau alias umum (BNI/Wondr, Cash, ShopeePay, SPayLater, Bank Saqu, Saqu Booster, Gotrade). */
export function resolveWallet(profile, query) {
  const wallets = profile?.wallets || [];
  if (!query || wallets.length === 0) return null;
  const q = String(query).toLowerCase().trim();
  if (!q) return null;

  // 1. Exact id or exact name
  const exact = wallets.find((w) => w.id.toLowerCase() === q || w.name.toLowerCase() === q);
  if (exact) return exact;

  // 2. Specific aliases (urutan penting: spaylater sebelum shopeepay, booster sebelum saqu!)
  if (/\b(?:spaylater|shopee\s*paylater|shoppepay\s*later|paylater|spl|bnpl)\b/.test(q)) {
    return wallets.find((w) => w.id === "spaylater" || w.role === "credit" || w.name.toLowerCase().includes("paylater")) || null;
  }
  if (/\b(?:shopeepay|shoppepay|shopee\s*pay|spay)\b/.test(q)) {
    return wallets.find((w) => w.id === "shopeepay" || (w.name.toLowerCase().includes("shopeepay") && w.role !== "credit")) || null;
  }
  if (/\b(?:booster|saqu\s*booster)\b/.test(q)) {
    return wallets.find((w) => w.id.includes("booster") || w.name.toLowerCase().includes("booster")) || null;
  }
  if (/\b(?:gotrade|darurat|invest|saham)\b/.test(q)) {
    return wallets.find((w) => w.id.includes("gotrade") || w.name.toLowerCase().includes("gotrade") || w.role === "emergency") || null;
  }
  if (/\b(?:saqu|bank\s*saqu|saku\s*utama|saku)\b/.test(q)) {
    return wallets.find((w) => w.id === "saqu" || (w.name.toLowerCase().includes("saqu") && !w.name.toLowerCase().includes("booster"))) || null;
  }
  if (/\b(?:bni|wondr|wonder)\b/.test(q)) {
    return wallets.find((w) => w.id === "bni" || w.name.toLowerCase().includes("bni") || w.name.toLowerCase().includes("wondr")) || null;
  }
  if (/\b(?:cash|tunai|dompet|uang\s*fisik)\b/.test(q)) {
    return wallets.find((w) => w.id === "cash" || w.name.toLowerCase().includes("cash") || w.name.toLowerCase().includes("tunai")) || null;
  }

  // 3. Substring match on wallet name
  return wallets.find((w) => w.name.toLowerCase().includes(q) || q.includes(w.name.toLowerCase())) || null;
}

function syncPotsWithWallets(wallets, savingsPots) {
  if (!Array.isArray(wallets) || !Array.isArray(savingsPots) || savingsPots.length === 0) return savingsPots;
  return savingsPots.map((pot) => {
    const potLow = String(pot.name || "").toLowerCase();
    const matched = wallets.find((w) => {
      const wLow = w.name.toLowerCase();
      if (pot.walletId && pot.walletId === w.id) return true;
      if (w.id === "saqu_booster" && potLow.includes("booster")) return true;
      if (w.id === "saqu" && potLow.includes("saqu") && !potLow.includes("booster")) return true;
      if (w.id === "gotrade" && (potLow.includes("gotrade") || potLow.includes("darurat"))) return true;
      return wLow === potLow;
    });
    if (!matched) return pot;
    return { ...pot, saved: Math.max(0, matched.balance), walletId: matched.id };
  });
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

/** Simpan dari halaman Atur / bot. Menandai setup selesai. */
export async function saveUserProfile(uid, input = {}) {
  const existing = await getUserProfile(uid);
  const nextWallets = input.wallets !== undefined ? sanitizeWallets(input.wallets) : (existing?.wallets || []);
  let nextPots = Array.isArray(input.savingsPots)
    ? input.savingsPots.slice(0, 30).map((p) => ({
        id: p.id || newId("pot"),
        name: String(p.name || "").trim().slice(0, 60) || "Tabungan",
        monthly: toAmount(p.monthly ?? p.monthlyAllocation),
        target: toAmount(p.target),
        deadline: /^\d{4}-\d{2}$/.test(p.deadline || "") ? p.deadline : "",
        saved: toAmount(p.saved),
        ...(p.walletId ? { walletId: String(p.walletId) } : {}),
      }))
    : (existing?.savingsPots || []);

  if (input.wallets !== undefined && input.savingsPots === undefined) {
    nextPots = syncPotsWithWallets(nextWallets, nextPots);
  }

  const clean = {
    ownerName: String(input.ownerName !== undefined ? input.ownerName : (existing?.ownerName || "")).trim().slice(0, 40),
    telegramName: String(input.telegramName !== undefined ? input.telegramName : (existing?.telegramName || "")).trim().slice(0, 50),
    telegramUsername: String(input.telegramUsername !== undefined ? input.telegramUsername : (existing?.telegramUsername || "")).trim().slice(0, 50),
    monthlyIncome: input.monthlyIncome !== undefined ? toAmount(input.monthlyIncome) : (existing?.monthlyIncome || 0),
    paydayDate: input.paydayDate !== undefined ? Math.min(28, Math.max(1, Math.round(Number(input.paydayDate) || 25))) : (existing?.paydayDate || 25),
    fixedCosts: input.fixedCosts !== undefined ? sanitizeFixedCosts(input.fixedCosts) : (existing?.fixedCosts || []),
    savingsPots: nextPots,
    wallets: nextWallets,
    debts: input.debts !== undefined ? sanitizeDebts(input.debts) : (existing?.debts || []),
    wishlists: input.wishlists !== undefined ? sanitizeWishlists(input.wishlists) : (existing?.wishlists || []),
    telegramChannels:
      input.telegramChannels !== undefined
        ? sanitizeTelegramChannels(input.telegramChannels)
        : sanitizeTelegramChannels(existing?.telegramChannels),
    pendingPastExpense:
      input.pendingPastExpense !== undefined
        ? input.pendingPastExpense
        : (existing?.pendingPastExpense || null),
    pendingWalletSelection:
      input.pendingWalletSelection !== undefined
        ? input.pendingWalletSelection
        : (existing?.pendingWalletSelection || null),
    pendingAuditAdjustment:
      input.pendingAuditAdjustment !== undefined
        ? input.pendingAuditAdjustment
        : (existing?.pendingAuditAdjustment || null),
    lastReminderDate:
      input.lastReminderDate !== undefined
        ? String(input.lastReminderDate || "")
        : (existing?.lastReminderDate || ""),
    lastCycleReportPeriod:
      input.lastCycleReportPeriod !== undefined
        ? String(input.lastCycleReportPeriod || "")
        : (existing?.lastCycleReportPeriod || ""),
    setupDone: true,
  };
  return writeProfile(uid, clean);
}

/** Ubah saldo wallet & sinkronkan pos tabungan terkait. */
export async function adjustWalletBalance(uid, walletIdOrName, delta) {
  if (!walletIdOrName || !delta) return null;
  const profile = await getUserProfile(uid);
  const wallet = resolveWallet(profile, walletIdOrName);
  if (!wallet) return null;

  const updatedWallets = profile.wallets.map((w) =>
    w.id === wallet.id ? { ...w, balance: toSignedBalance(w.balance + Math.round(delta)) } : w
  );
  const savedProfile = await saveUserProfile(uid, { wallets: updatedWallets });
  return {
    wallet: savedProfile.wallets.find((w) => w.id === wallet.id),
    profile: savedProfile,
  };
}

/** Bandingkan saldo real (dari HP) vs saldo catatan Diablo (Surplus / Gap / Klop). */
export function computeAuditDiff(profile, reportedList = []) {
  const items = [];
  for (const r of reportedList) {
    const w = resolveWallet(profile, r.walletId || r.name);
    if (!w) continue;
    const actual = toSignedBalance(r.actualBalance);
    const recorded = Number(w.balance) || 0;
    const diff = actual - recorded; // >0 = surplus, <0 = gap/kurang
    items.push({
      walletId: w.id,
      walletName: w.name,
      role: w.role,
      recorded,
      actual,
      diff,
      status: diff === 0 ? "KLOP" : diff > 0 ? "SURPLUS" : "MINUS",
    });
  }
  const totalDiff = items.reduce((a, x) => a + x.diff, 0);
  return { items, totalDiff };
}

/** Terapkan penyesuaian saldo hasil audit ke semua dompet yang dilaporkan. */
export async function applyAuditBalances(uid, auditItems = []) {
  const profile = await getUserProfile(uid);
  const map = new Map(auditItems.map((it) => [it.walletId, toSignedBalance(it.actual)]));
  const updatedWallets = (profile.wallets || []).map((w) =>
    map.has(w.id) ? { ...w, balance: map.get(w.id) } : w
  );
  const saved = await saveUserProfile(uid, { wallets: updatedWallets, pendingAuditAdjustment: null });
  return saved;
}

/** Pindahkan dana antar dompet (termasuk pelunasan SPayLater: BNI -> SPayLater) tanpa double-count. */
export async function transferBetweenWallets(uid, fromQuery, toQuery, amount) {
  const cleanAmt = toAmount(amount);
  if (cleanAmt <= 0) return { error: "Nominal transfer harus lebih dari 0." };

  const profile = await getUserProfile(uid);
  const fromW = resolveWallet(profile, fromQuery);
  const toW = resolveWallet(profile, toQuery);
  if (!fromW) return { error: `Dompet asal "${fromQuery}" tidak ditemukan.` };
  if (!toW) return { error: `Dompet tujuan "${toQuery}" tidak ditemukan.` };
  if (fromW.id === toW.id) return { error: "Dompet asal dan tujuan sama." };

  const updatedWallets = profile.wallets.map((w) => {
    if (w.id === fromW.id) return { ...w, balance: toSignedBalance(w.balance - cleanAmt) };
    if (w.id === toW.id) return { ...w, balance: toSignedBalance(w.balance + cleanAmt) };
    return w;
  });

  const savedProfile = await saveUserProfile(uid, { wallets: updatedWallets });
  return {
    fromWallet: savedProfile.wallets.find((w) => w.id === fromW.id),
    toWallet: savedProfile.wallets.find((w) => w.id === toW.id),
    amount: cleanAmt,
    profile: savedProfile,
  };
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
  if (pot.walletId && Array.isArray(profile.wallets)) {
    const w = profile.wallets.find((x) => x.id === pot.walletId);
    if (w) w.balance = toSignedBalance(w.balance + amount);
  }
  await writeProfile(uid, profile);
  return { pot, pots: profile.savingsPots };
}

// ---------- Tagihan Tetap (Recurring Bills) ----------
function advanceDateStr(yyyyMmDd, cycleMonths = 1, fallbackDueDay = null) {
  const nowWib = toWibParts(new Date());
  let y = nowWib.year;
  let m = nowWib.month; // 0-indexed
  let d = fallbackDueDay || nowWib.date;

  if (/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd || "")) {
    const parts = yyyyMmDd.split("-").map(Number);
    y = parts[0];
    m = parts[1] - 1;
    d = parts[2];
  }
  const next = new Date(Date.UTC(y, m + Math.max(1, cycleMonths), Math.min(28, d)));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(next.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export function findFixedCost(profile, query) {
  const list = profile?.fixedCosts || [];
  if (!query || list.length === 0) return null;
  const q = String(query).toLowerCase().trim();
  return (
    list.find((c) => c.id === query) ||
    list.find((c) => c.name.toLowerCase() === q) ||
    list.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase().split(" ")[0])) ||
    null
  );
}

/** Tandai tagihan tetap sudah dibayar: majukan jadwal jatuh tempo & opsional potong dompet + catat transaksi. */
export async function markFixedCostPaid(uid, fixedCostIdOrName, { walletId = "", amount = null, logTx = true } = {}) {
  const profile = await getUserProfile(uid);
  const fc = findFixedCost(profile, fixedCostIdOrName);
  if (!fc) return null;

  const payAmount = amount !== null && Number(amount) > 0
    ? toAmount(amount)
    : fc.isSinkingFund && fc.cycleMonths > 1
      ? toAmount(fc.amount * fc.cycleMonths)
      : toAmount(fc.amount);

  const nextDueDate = advanceDateStr(fc.nextDueDate, fc.cycleMonths || 1, fc.dueDay);
  const nextFixedCosts = (profile.fixedCosts || []).map((c) =>
    c.id === fc.id ? { ...c, nextDueDate, lastPaidAt: new Date().toISOString() } : c
  );
  await saveUserProfile(uid, { fixedCosts: nextFixedCosts });

  let transaction = null;
  if (logTx && payAmount > 0 && walletId) {
    const w = resolveWallet(profile, walletId);
    if (w) {
      transaction = await addTransaction(uid, {
        type: "expense",
        amount: payAmount,
        item: `Bayar ${fc.name.split("(")[0].trim()}`,
        category: "Tagihan",
        intent: "NEED",
        walletId: w.id,
        walletName: w.name,
        paymentMethod: w.name,
        source: "bill-pay",
      });
    }
  }

  const updatedProfile = await getUserProfile(uid);
  return {
    bill: updatedProfile.fixedCosts.find((c) => c.id === fc.id),
    payAmount,
    transaction,
    profile: updatedProfile,
  };
}

// ---------- Utang & Piutang ----------
export async function addDebt(uid, { type = "utang", person, amount = null, note = "", targetWalletId = "" }) {
  const profile = await getUserProfile(uid);
  const entry = {
    id: newId("debt"),
    type: String(type).toLowerCase() === "piutang" ? "piutang" : "utang",
    person: String(person || "Anonim").trim().slice(0, 60) || "Anonim",
    amount: amount === null || amount === undefined || amount === "" || Number(amount) <= 0 ? null : toAmount(amount),
    note: String(note || "").trim().slice(0, 300),
    status: "open",
    targetWalletId: String(targetWalletId || "").trim().slice(0, 40),
    snoozedUntil: null,
    lastRemindedAt: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
  };
  const updated = await saveUserProfile(uid, { debts: [entry, ...(profile.debts || [])] });
  return { debt: entry, profile: updated };
}

export function findOpenDebt(profile, personQuery, preferredType = null, { strictType = false } = {}) {
  const debts = (profile?.debts || []).filter((d) => d.status !== "paid");
  if (!personQuery || debts.length === 0) return null;
  const q = String(personQuery).toLowerCase().trim();
  const candidates = preferredType ? debts.filter((d) => d.type === preferredType) : debts;
  const pool = strictType && preferredType ? candidates : (candidates.length > 0 ? candidates : debts);

  return (
    pool.find((d) => d.id === personQuery) ||
    pool.find((d) => d.person.toLowerCase() === q) ||
    pool.find((d) => d.person.toLowerCase().includes(q) || q.includes(d.person.toLowerCase())) ||
    pool.find((d) => `${d.person} ${d.note}`.toLowerCase().includes(q)) ||
    null
  );
}

export async function updateDebt(uid, debtId, patch = {}) {
  const profile = await getUserProfile(uid);
  let target = null;
  const nextDebts = (profile.debts || []).map((d) => {
    if (d.id !== debtId) return d;
    target = {
      ...d,
      ...(patch.person !== undefined ? { person: String(patch.person).trim().slice(0, 60) || d.person } : {}),
      ...(patch.note !== undefined ? { note: String(patch.note).trim().slice(0, 300) } : {}),
      ...(patch.type !== undefined ? { type: patch.type === "piutang" ? "piutang" : "utang" } : {}),
      ...(patch.targetWalletId !== undefined ? { targetWalletId: String(patch.targetWalletId || "").trim().slice(0, 40) } : {}),
      ...(patch.snoozedUntil !== undefined ? { snoozedUntil: patch.snoozedUntil } : {}),
      ...(patch.lastRemindedAt !== undefined ? { lastRemindedAt: patch.lastRemindedAt } : {}),
      ...(patch.amount !== undefined
        ? { amount: patch.amount === null || patch.amount === "" ? null : toAmount(patch.amount) }
        : {}),
      ...(patch.status !== undefined
        ? {
            status: patch.status === "paid" ? "paid" : "open",
            paidAt: patch.status === "paid" ? new Date().toISOString() : null,
          }
        : {}),
    };
    return target;
  });
  if (!target) return null;
  const updated = await saveUserProfile(uid, { debts: nextDebts });
  return { debt: target, profile: updated };
}

export async function snoozeDebt(uid, debtId, days = 3) {
  const until = new Date(Date.now() + Math.max(1, Number(days) || 3) * 86_400_000).toISOString();
  return updateDebt(uid, debtId, { snoozedUntil: until });
}

/** Tambah atau update utang/piutang berdasarkan nama orang (additive=true menjumlahkan ke saldo terbuka untuk orang+tipe yang sama). */
export async function upsertDebt(uid, { type = "utang", person, amount = null, note = "", targetWalletId = "", additive = false }) {
  const profile = await getUserProfile(uid);
  const existing = findOpenDebt(profile, person, type, { strictType: true });
  if (existing) {
    const prevAmount = existing.amount;
    const cleanAmt = amount === null || amount === undefined || amount === "" || Number(amount) <= 0 ? null : toAmount(amount);
    if (additive && cleanAmt !== null) {
      const nextAmount = (Number(existing.amount) || 0) + cleanAmt;
      const mergedNote =
        existing.note && note && !existing.note.toLowerCase().includes(note.toLowerCase())
          ? `${existing.note}; ${note}`
          : (note || existing.note);
      const res = await updateDebt(uid, existing.id, {
        amount: nextAmount,
        ...(mergedNote ? { note: mergedNote } : {}),
        ...(targetWalletId ? { targetWalletId } : {}),
      });
      return { mode: "added_amount", prevAmount, addedAmount: cleanAmt, ...res };
    }
    const nextAmount = cleanAmt === null ? existing.amount : cleanAmt;
    const res = await updateDebt(uid, existing.id, {
      amount: nextAmount,
      ...(note ? { note } : {}),
      ...(targetWalletId ? { targetWalletId } : {}),
    });
    return { mode: prevAmount === nextAmount ? "unchanged" : "updated", prevAmount, ...res };
  }
  const added = await addDebt(uid, { type, person, amount, note, targetWalletId });
  return { mode: "added", prevAmount: null, ...added };
}

export async function deleteDebt(uid, debtId) {
  const profile = await getUserProfile(uid);
  const nextDebts = (profile.debts || []).filter((d) => d.id !== debtId);
  return saveUserProfile(uid, { debts: nextDebts });
}

// ---------- Wishlist Belanja ----------
export async function addWishlist(uid, { name, price = 0, saved = 0, url = "", priority = "medium", note = "" }) {
  const profile = await getUserProfile(uid);
  const validPrio = ["high", "medium", "low"];
  const entry = {
    id: newId("wish"),
    name: String(name || "Barang Wishlist").trim().slice(0, 80) || "Barang Wishlist",
    price: toAmount(price),
    saved: toAmount(saved),
    url: String(url || "").trim().slice(0, 300),
    priority: validPrio.includes(String(priority || "").toLowerCase()) ? String(priority).toLowerCase() : "medium",
    status: "planned",
    note: String(note || "").trim().slice(0, 200),
    createdAt: new Date().toISOString(),
    boughtAt: null,
  };
  const updated = await saveUserProfile(uid, { wishlists: [entry, ...(profile.wishlists || [])] });
  return { item: entry, profile: updated };
}

export function findOpenWishlist(profile, query) {
  const list = (profile?.wishlists || []).filter((w) => w.status !== "bought");
  if (!query || list.length === 0) return null;
  const q = String(query).toLowerCase().trim();
  const byExact = list.find((w) => w.id === query) || list.find((w) => w.name.toLowerCase() === q);
  if (byExact) return byExact;
  const bySub = list.find((w) => w.name.toLowerCase().includes(q) || q.includes(w.name.toLowerCase()));
  if (bySub) return bySub;
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length > 0) {
    return (
      list.find((w) => words.every((wd) => w.name.toLowerCase().includes(wd))) ||
      list.find((w) => words.some((wd) => wd.length >= 3 && w.name.toLowerCase().includes(wd))) ||
      null
    );
  }
  return null;
}

export async function updateWishlist(uid, wishlistId, patch = {}) {
  const profile = await getUserProfile(uid);
  let target = null;
  const validPrio = ["high", "medium", "low"];
  const nextList = (profile.wishlists || []).map((w) => {
    if (w.id !== wishlistId) return w;
    const nextStatus =
      patch.status !== undefined
        ? String(patch.status).toLowerCase() === "bought"
          ? "bought"
          : "planned"
        : w.status;
    target = {
      ...w,
      ...(patch.name !== undefined ? { name: String(patch.name).trim().slice(0, 80) || w.name } : {}),
      ...(patch.price !== undefined ? { price: toAmount(patch.price) } : {}),
      ...(patch.saved !== undefined ? { saved: toAmount(patch.saved) } : {}),
      ...(patch.url !== undefined ? { url: String(patch.url || "").trim().slice(0, 300) } : {}),
      ...(patch.priority !== undefined && validPrio.includes(String(patch.priority).toLowerCase())
        ? { priority: String(patch.priority).toLowerCase() }
        : {}),
      ...(patch.note !== undefined ? { note: String(patch.note || "").trim().slice(0, 200) } : {}),
      status: nextStatus,
      boughtAt: nextStatus === "bought" ? w.boughtAt || new Date().toISOString() : null,
    };
    return target;
  });
  if (!target) return null;
  const updated = await saveUserProfile(uid, { wishlists: nextList });
  return { item: target, profile: updated };
}

export async function buyWishlist(uid, wishlistId, { walletId = "", amount = null, logTx = true } = {}) {
  const profile = await getUserProfile(uid);
  const item = (profile.wishlists || []).find((w) => w.id === wishlistId);
  if (!item) return null;

  const payAmount = amount !== null && Number(amount) > 0 ? toAmount(amount) : toAmount(item.price);
  const res = await updateWishlist(uid, item.id, { status: "bought" });

  let transaction = null;
  if (logTx && payAmount > 0 && walletId) {
    const w = resolveWallet(profile, walletId);
    if (w) {
      transaction = await addTransaction(uid, {
        type: "expense",
        amount: payAmount,
        item: item.name,
        category: "Belanja & Barang",
        intent: "WANT",
        walletId: w.id,
        walletName: w.name,
        paymentMethod: w.name,
        notes: item.url ? `Wishlist (${item.url})` : "Wishlist",
        source: "wishlist-buy",
      });
    }
  }

  const updatedProfile = await getUserProfile(uid);
  return {
    item: res?.item || { ...item, status: "bought" },
    payAmount,
    transaction,
    profile: updatedProfile,
  };
}

export async function deleteWishlist(uid, wishlistId) {
  const profile = await getUserProfile(uid);
  const nextList = (profile.wishlists || []).filter((w) => w.id !== wishlistId);
  return saveUserProfile(uid, { wishlists: nextList });
}

/** Kurangi atau tambah nominal utang/piutang terbuka dengan jejak perhitungan di catatan. */
export async function adjustDebtAmount(uid, debtId, { delta, reason = "" }) {
  const profile = await getUserProfile(uid);
  const debt = (profile.debts || []).find((d) => d.id === debtId && d.status !== "paid");
  if (!debt) return null;

  const cleanDelta = Math.round(Number(delta) || 0);
  if (cleanDelta === 0) return { debt, profile, mode: "unchanged" };

  const prevAmount = Number(debt.amount) || 0;
  const nextSigned = prevAmount + cleanDelta;
  const sign = cleanDelta < 0 ? "−" : "+";
  const cleanReason = String(reason || "").trim();
  const reasonPart = cleanReason ? ` (${cleanReason})` : "";
  const stepText = `${sign} ${formatRp(Math.abs(cleanDelta))}${reasonPart}`;
  const baseNote = debt.note ? `${debt.note} ${stepText}` : `${formatRp(prevAmount)} ${stepText}`;

  if (nextSigned === 0) {
    const res = await updateDebt(uid, debt.id, { status: "paid", note: `${baseNote} = Impas (Rp 0)` });
    return { mode: "settled", prevAmount, ...res };
  }
  if (nextSigned > 0) {
    const res = await updateDebt(uid, debt.id, { amount: nextSigned, note: baseNote });
    return { mode: "adjusted", prevAmount, ...res };
  }

  const nextType = debt.type === "piutang" ? "utang" : "piutang";
  const prevLabel = debt.type === "piutang" ? "Piutang" : "Utang";
  const nextLabel = nextType === "piutang" ? "Piutang" : "Utang";
  const nextNote = `${prevLabel} ${formatRp(prevAmount)}${debt.note ? ` (${debt.note})` : ""} ${stepText} → Sisa ${nextLabel} ${formatRp(Math.abs(nextSigned))}`;
  const res = await updateDebt(uid, debt.id, {
    type: nextType,
    amount: Math.abs(nextSigned),
    note: nextNote,
  });
  return { mode: "flipped", prevAmount, ...res };
}

/** Sederhanakan (impas/netting) utang & piutang terbuka untuk orang yang sama dengan catatan perhitungan jelas. */
export async function simplifyDebts(uid) {
  const profile = await getUserProfile(uid);
  const allDebts = profile.debts || [];
  const groups = new Map();

  allDebts.forEach((d, idx) => {
    if (d.status === "paid" || d.amount === null || Number(d.amount) <= 0) return;
    const key = String(d.person || "").toLowerCase().trim();
    if (!key) return;
    const arr = groups.get(key) || [];
    arr.push(idx);
    groups.set(key, arr);
  });

  const nextDebts = allDebts.map((d) => ({ ...d }));
  const simplified = [];
  const nowIso = new Date().toISOString();

  const fmtSide = (label, total, list) => {
    const notes = list.map((d) => d.note).filter(Boolean).join("; ");
    return `${label} ${formatRp(total)}${notes ? ` (${notes})` : ""}`;
  };
  const fmtMerge = (list) =>
    list.map((d) => `${formatRp(d.amount)}${d.note ? ` (${d.note})` : ""}`).join(" + ");

  for (const indices of groups.values()) {
    const items = indices.map((i) => nextDebts[i]);
    const piutangIdx = indices.filter((i) => nextDebts[i].type === "piutang");
    const utangIdx = indices.filter((i) => nextDebts[i].type === "utang");
    const hasBothSides = piutangIdx.length > 0 && utangIdx.length > 0;
    if (!hasBothSides && indices.length <= 1) continue;

    const piutangs = piutangIdx.map((i) => nextDebts[i]);
    const utangs = utangIdx.map((i) => nextDebts[i]);
    const totalPiutang = piutangs.reduce((a, d) => a + Number(d.amount), 0);
    const totalUtang = utangs.reduce((a, d) => a + Number(d.amount), 0);
    const net = totalPiutang - totalUtang;

    if (net > 0) {
      const keepIdx = piutangIdx[0];
      const primary = nextDebts[keepIdx];
      primary.amount = net;
      primary.note = hasBothSides
        ? `${fmtSide("Piutang", totalPiutang, piutangs)} − ${fmtSide("Utang", totalUtang, utangs)}`
        : fmtMerge(piutangs);
      for (const i of indices) {
        if (i === keepIdx) continue;
        nextDebts[i].status = "paid";
        nextDebts[i].paidAt = nowIso;
        nextDebts[i].note = hasBothSides
          ? `Impas ke Piutang ${primary.person} (${formatRp(totalPiutang)} − ${formatRp(totalUtang)} = Sisa Piutang ${formatRp(net)})`
          : `Digabung ke Piutang ${primary.person} (${formatRp(totalPiutang)})`;
      }
    } else if (net < 0) {
      const keepIdx = utangIdx[0];
      const primary = nextDebts[keepIdx];
      const absNet = Math.abs(net);
      primary.amount = absNet;
      primary.note = hasBothSides
        ? `${fmtSide("Utang", totalUtang, utangs)} − ${fmtSide("Piutang", totalPiutang, piutangs)}`
        : fmtMerge(utangs);
      for (const i of indices) {
        if (i === keepIdx) continue;
        nextDebts[i].status = "paid";
        nextDebts[i].paidAt = nowIso;
        nextDebts[i].note = hasBothSides
          ? `Impas ke Utang ${primary.person} (${formatRp(totalUtang)} − ${formatRp(totalPiutang)} = Sisa Utang ${formatRp(absNet)})`
          : `Digabung ke Utang ${primary.person} (${formatRp(totalUtang)})`;
      }
    } else {
      for (const i of indices) {
        nextDebts[i].status = "paid";
        nextDebts[i].paidAt = nowIso;
        nextDebts[i].note = `Impas (${formatRp(totalPiutang)} − ${formatRp(totalUtang)} = Rp 0)`;
      }
    }

    simplified.push({
      person: items[0].person,
      prevPiutang: totalPiutang,
      prevUtang: totalUtang,
      net,
      resultType: net > 0 ? "piutang" : net < 0 ? "utang" : "impas",
      resultAmount: Math.abs(net),
    });
  }

  if (simplified.length === 0) return { simplified: [], profile };
  const updated = await saveUserProfile(uid, { debts: nextDebts });
  return { simplified, profile: updated };
}

// ---------- Reminder Engine (Tagihan Tetap, SPayLater, Utang/Piutang Macet, Gajian/Surplus) ----------
function wibDateKey(date = new Date()) {
  const p = toWibParts(date);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.date).padStart(2, "0")}`;
}

function diffDaysWib(targetYyyyMmDd, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetYyyyMmDd || "")) return null;
  const [y, m, d] = targetYyyyMmDd.split("-").map(Number);
  const targetMs = fromWib(y, m - 1, d, 0, 0).getTime();
  const todayMs = startOfWibDay(now).getTime();
  return Math.round((targetMs - todayMs) / 86_400_000);
}

const REMINDER_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/**
 * Hitung semua reminder aktif (dipakai Web Dashboard, `/reminder` Telegram, dan Vercel Cron `/api/cron/reminders`).
 */
export function computeReminders(profile, analytics, now = new Date()) {
  const wib = toWibParts(now);
  const todayKey = wibDateKey(now);
  const payday = Math.min(28, Math.max(1, Number(profile?.paydayDate) || 25));
  const cycleStartMonth = wib.date < payday ? wib.month - 1 : wib.month;
  const currentCycleStart = fromWib(wib.year, cycleStartMonth, payday, 0, 0);

  // 1. Tagihan Tetap (hitung H-berapa untuk semua tagihan yang punya jadwal)
  const upcomingBills = [];
  for (const fc of profile?.fixedCosts || []) {
    const paidDate = fc.lastPaidAt ? new Date(fc.lastPaidAt) : null;
    const paidInCurrentCycle = Boolean(paidDate && !isNaN(paidDate.getTime()) && paidDate >= currentCycleStart);
    const paidP = paidDate && !isNaN(paidDate.getTime()) ? toWibParts(paidDate) : null;
    const lastPaidLabel = paidP ? `${paidP.date} ${REMINDER_MONTHS[paidP.month]}` : "";

    if (fc.activeFrom && todayKey < fc.activeFrom) {
      const daysUntilActive = diffDaysWib(fc.activeFrom, now);
      upcomingBills.push({
        ...fc,
        daysUntil: daysUntilActive,
        dueAmount: fc.amount,
        urgency: "INACTIVE",
        dueLabel: `Aktif ${fc.activeFrom}`,
        paidInCurrentCycle,
        lastPaidLabel,
      });
      continue;
    }

    let dueDateStr = fc.nextDueDate;
    if (!dueDateStr && fc.dueDay) {
      let y = wib.year;
      let m = wib.month; // 0-indexed
      if (wib.date > fc.dueDay) m += 1;
      const dObj = new Date(Date.UTC(y, m, Math.min(28, fc.dueDay)));
      dueDateStr = `${dObj.getUTCFullYear()}-${String(dObj.getUTCMonth() + 1).padStart(2, "0")}-${String(dObj.getUTCDate()).padStart(2, "0")}`;
    }

    const daysUntil = diffDaysWib(dueDateStr, now);
    const dueAmount = fc.isSinkingFund && (fc.cycleMonths || 1) > 1
      ? fc.amount * fc.cycleMonths
      : fc.amount;

    let urgency = "UPCOMING";
    if (daysUntil !== null && daysUntil < 0) urgency = "OVERDUE";
    else if (daysUntil === 0) urgency = "TODAY";
    else if (daysUntil !== null && daysUntil <= 3) urgency = "SOON";

    upcomingBills.push({
      ...fc,
      nextDueDate: dueDateStr || "",
      daysUntil,
      dueAmount,
      urgency,
      paidInCurrentCycle,
      lastPaidLabel,
      dueLabel:
        daysUntil === null
          ? "-"
          : daysUntil < 0
            ? `Lewat ${Math.abs(daysUntil)} hari`
            : daysUntil === 0
              ? "Hari ini!"
              : `H-${daysUntil}`,
    });
  }
  upcomingBills.sort((a, b) => (a.daysUntil ?? 999) - (b.daysUntil ?? 999));

  // 2. SPayLater / Credit Wallet Unpaid
  const creditWallets = (profile?.wallets || []).filter((w) => w.role === "credit" && w.balance < 0);
  const spayReminders = creditWallets.map((w) => ({
    walletId: w.id,
    name: w.name,
    unpaid: Math.abs(w.balance),
  }));

  // 3. Utang & Piutang Terbuka (cek umur & snooze)
  const openDebts = (profile?.debts || [])
    .filter((d) => d.status !== "paid")
    .map((d) => {
      const ageDays = Math.max(0, Math.floor((now.getTime() - new Date(d.createdAt || now).getTime()) / 86_400_000));
      const isSnoozed = Boolean(d.snoozedUntil && new Date(d.snoozedUntil).getTime() > now.getTime());
      const needsNag = !isSnoozed && ageDays >= 3;
      return { ...d, ageDays, isSnoozed, needsNag };
    });

  // 4. Event Hari Ini (Gajian tgl 25 / H-1 Gajian Cek Surplus tgl 24)
  const isPayday = wib.date === payday;
  const isPrePaydaySurplusCheck = wib.date === (payday > 1 ? payday - 1 : 28);
  const monthlyFixedNeeded = (profile?.fixedCosts || [])
    .filter((fc) => !fc.activeFrom || todayKey >= fc.activeFrom)
    .reduce((a, fc) => a + (Number(fc.amount) || 0), 0);

  const urgentBills = upcomingBills.filter((b) => ["OVERDUE", "TODAY", "SOON"].includes(b.urgency));
  const overdueDebts = openDebts.filter((d) => d.needsNag);

  const hasUrgentCronAction =
    isPayday ||
    isPrePaydaySurplusCheck ||
    urgentBills.length > 0 ||
    overdueDebts.length > 0 ||
    (spayReminders.length > 0 && (wib.date >= 25 || wib.date <= 1));

  return {
    todayKey,
    isPayday,
    isPrePaydaySurplusCheck,
    monthlyFixedNeeded,
    upcomingBills,
    urgentBills,
    spayReminders,
    openDebts,
    overdueDebts,
    surplusDailyNow: analytics?.budget?.remainingBudget ?? 0,
    hasUrgentCronAction,
  };
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

export async function getTransactionById(uid, txId) {
  const db = getDb();
  if (db) {
    const snap = await userDoc(db, uid).collection("transactions").doc(String(txId)).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }
  const store = await readLocalUser(uid);
  return (store.transactions || []).find((t) => t.id === txId) || null;
}

export async function addTransaction(uid, tx, options = {}) {
  const { adjustWallet = true, docId = null } = options;
  const txType = String(tx.type || "expense").toLowerCase() === "income" ? "income" : "expense";
  const rawIntent = String(tx.intent || (txType === "income" ? "INCOME" : "WANT")).toUpperCase();
  const validIntents = ["NEED", "WANT", "GIFT", "ASSET", "INCOME"];
  const intent = txType === "income" ? "INCOME" : validIntents.includes(rawIntent) && rawIntent !== "INCOME" ? rawIntent : "WANT";

  const amount = toAmount(tx.amount);
  const walletId = tx.walletId ? String(tx.walletId).trim().slice(0, 40) : "";
  let walletName = tx.walletName ? String(tx.walletName).trim().slice(0, 60) : "";

  if (walletId && !walletName) {
    const profile = await getUserProfile(uid);
    const w = resolveWallet(profile, walletId);
    if (w) walletName = w.name;
  }

  const entry = {
    type: txType,
    amount,
    item: cleanItemName(tx.item).slice(0, 80),
    category: String(tx.category || (txType === "income" ? "Pemasukan" : "Lainnya")).trim().slice(0, 40),
    intent,
    walletId,
    walletName,
    paymentMethod: String(tx.paymentMethod || walletName || "QRIS").trim().slice(0, 30),
    notes: String(tx.notes || "").trim().slice(0, 200),
    source: String(tx.source || "telegram"),
    timeKnown: tx.timeKnown !== false,
    createdAt: tx.createdAt ? new Date(tx.createdAt).toISOString() : new Date().toISOString(),
  };

  let created;
  const db = getDb();
  if (db) {
    if (docId) {
      await userDoc(db, uid).collection("transactions").doc(String(docId)).set(entry);
      created = { id: String(docId), ...entry };
    } else {
      const ref = await userDoc(db, uid).collection("transactions").add(entry);
      created = { id: ref.id, ...entry };
    }
  } else {
    const store = await readLocalUser(uid);
    created = { id: docId || newId("tx"), ...entry };
    store.transactions = [created, ...(store.transactions || []).filter((t) => t.id !== created.id)];
    await writeLocal(localKey(uid), store);
  }

  if (adjustWallet && walletId && amount > 0) {
    const delta = txType === "income" ? amount : -amount;
    await adjustWalletBalance(uid, walletId, delta);
  }

  return created;
}

export async function toggleTransactionIntent(uid, txId) {
  const ORDER = ["NEED", "WANT", "GIFT", "ASSET"];
  const nextIntent = (curr) => {
    const idx = ORDER.indexOf(String(curr || "NEED").toUpperCase());
    return ORDER[(idx + 1) % ORDER.length];
  };

  const db = getDb();
  if (db) {
    const ref = userDoc(db, uid).collection("transactions").doc(String(txId));
    const snap = await ref.get();
    if (!snap.exists) return null;
    if ((snap.data().type || "expense") === "income") {
      return { id: txId, ...snap.data() };
    }
    const intent = nextIntent(snap.data().intent);
    await ref.update({ intent });
    return { id: txId, ...snap.data(), intent };
  }
  const store = await readLocalUser(uid);
  const tx = (store.transactions || []).find((t) => t.id === txId);
  if (!tx) return null;
  if ((tx.type || "expense") === "income") return tx;
  tx.intent = nextIntent(tx.intent);
  await writeLocal(localKey(uid), store);
  return tx;
}

export async function updateTransaction(uid, txId, patch = {}) {
  const db = getDb();
  if (db) {
    const ref = userDoc(db, uid).collection("transactions").doc(String(txId));
    const snap = await ref.get();
    if (!snap.exists) return null;
    await ref.update(patch);
    return { id: txId, ...snap.data(), ...patch };
  }
  const store = await readLocalUser(uid);
  const tx = (store.transactions || []).find((t) => t.id === txId);
  if (!tx) return null;
  Object.assign(tx, patch);
  await writeLocal(localKey(uid), store);
  return tx;
}

/** Cari transaksi terbaru berdasarkan ID atau potongan nama item (misal "ikan bakar"). */
export function findTransaction(transactions = [], query = "") {
  if (!query || !Array.isArray(transactions) || transactions.length === 0) return null;
  const q = String(query).toLowerCase().trim();
  if (!q) return null;
  const byId = transactions.find((t) => t.id === query || t.id.startsWith(query));
  if (byId) return byId;
  const exact = transactions.find((t) => String(t.item || "").toLowerCase() === q);
  if (exact) return exact;
  const substr = transactions.find((t) => String(t.item || "").toLowerCase().includes(q));
  if (substr) return substr;
  const words = q.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length > 0) {
    return transactions.find((t) => {
      const low = String(t.item || "").toLowerCase();
      return words.every((w) => low.includes(w));
    }) || transactions.find((t) => {
      const low = String(t.item || "").toLowerCase();
      return words.some((w) => low.includes(w));
    }) || null;
  }
  return null;
}

/**
 * Ubah nominal (dan opsional nama/catatan) transaksi yang sudah ada.
 * Jika adjustWallet=true (koreksi typo), selisih nominal otomatis disesuaikan ke dompet transaksi.
 * Jika adjustWallet=false (split-bill / bagi dua), dompet dibiarkan dulu agar user bisa pilih apakah teman sudah bayar / jadi piutang.
 */
export async function editTransactionAmount(uid, txId, newAmount, { item = null, notes = null, adjustWallet = true } = {}) {
  const existing = await getTransactionById(uid, txId);
  if (!existing) return null;

  const oldAmount = toAmount(existing.amount);
  const cleanNew = toAmount(newAmount);
  const diff = oldAmount - cleanNew; // positif = pengeluaran berkurang (refund), negatif = bertambah

  const patch = {
    amount: cleanNew,
    ...(item ? { item: String(item).trim().slice(0, 80) } : {}),
    ...(notes !== null ? { notes: String(notes).trim().slice(0, 200) } : {}),
  };

  const updated = await updateTransaction(uid, txId, patch);
  if (adjustWallet && existing.walletId && diff !== 0) {
    const isIncome = (existing.type || "expense") === "income";
    const walletDelta = isIncome ? -diff : diff;
    await adjustWalletBalance(uid, existing.walletId, walletDelta);
  }

  return { transaction: updated, oldAmount, newAmount: cleanNew, diff };
}

/** Pindahkan transaksi ke sumber dana lain + sesuaikan saldo kedua dompet secara otomatis. */
export async function changeTransactionWallet(uid, txId, newWalletIdOrName) {
  const tx = await getTransactionById(uid, txId);
  if (!tx) return null;

  const profile = await getUserProfile(uid);
  const targetWallet = resolveWallet(profile, newWalletIdOrName);
  if (!targetWallet) return null;
  if (tx.walletId === targetWallet.id) return { transaction: tx, wallet: targetWallet, profile };

  const amount = toAmount(tx.amount);
  const isIncome = (tx.type || "expense") === "income";

  const updatedWallets = (profile.wallets || []).map((w) => {
    let bal = w.balance;
    if (tx.walletId && w.id === tx.walletId) {
      bal = toSignedBalance(bal + (isIncome ? -amount : amount));
    }
    if (w.id === targetWallet.id) {
      bal = toSignedBalance(bal + (isIncome ? amount : -amount));
    }
    return { ...w, balance: bal };
  });

  const updatedProfile = await saveUserProfile(uid, { wallets: updatedWallets });
  const updatedTx = await updateTransaction(uid, txId, {
    walletId: targetWallet.id,
    walletName: targetWallet.name,
    paymentMethod: targetWallet.name,
  });

  return {
    transaction: updatedTx,
    wallet: updatedProfile.wallets.find((w) => w.id === targetWallet.id),
    profile: updatedProfile,
  };
}

export async function deleteTransaction(uid, txId, { revertWallet = true } = {}) {
  const existing = revertWallet ? await getTransactionById(uid, txId) : null;

  const db = getDb();
  if (db) {
    await userDoc(db, uid).collection("transactions").doc(String(txId)).delete();
  } else {
    const store = await readLocalUser(uid);
    store.transactions = (store.transactions || []).filter((t) => t.id !== txId);
    await writeLocal(localKey(uid), store);
  }

  if (revertWallet && existing?.walletId && Number(existing.amount) > 0) {
    const isIncome = (existing.type || "expense") === "income";
    const reverseDelta = isIncome ? -toAmount(existing.amount) : toAmount(existing.amount);
    await adjustWalletBalance(uid, existing.walletId, reverseDelta);
  }

  return true;
}

export async function undoLastTransaction(uid) {
  const [last] = await getTransactions(uid, 1);
  if (!last) return null;
  await deleteTransaction(uid, last.id, { revertWallet: true });
  return last;
}

export async function clearUserData(uid) {
  const db = getDb();
  if (db) {
    const txRef = userDoc(db, uid).collection("transactions");
    const txSnap = await txRef.get();
    const batch = db.batch();
    txSnap.docs.forEach((doc) => batch.delete(doc.ref));

    const advRef = userDoc(db, uid).collection("advisor_history");
    const advSnap = await advRef.get();
    advSnap.docs.forEach((doc) => batch.delete(doc.ref));

    const emptyProfile = { ...DEFAULT_PROFILE };
    batch.set(userDoc(db, uid).collection("config").doc("profile"), emptyProfile);
    await batch.commit();
    return true;
  }
  const store = await readLocalUser(uid);
  store.transactions = [];
  store.advisorHistory = [];
  store.profile = { ...DEFAULT_PROFILE };
  await writeLocal(localKey(uid), store);
  return true;
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

// ---------- Login token cryptographic HMAC ----------
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

// ---------- Analitik ----------
function monthsUntil(deadline, now) {
  const [y, m] = deadline.split("-").map(Number);
  const wib = toWibParts(now);
  return Math.max(1, y * 12 + (m - 1) - (wib.year * 12 + wib.month));
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
 * Rata-rata pengeluaran variabel rutin (Kuota/Pulsa, Listrik, Bensin, Laundry) lintas siklus gajian.
 */
export function computeVariableAverages(transactions = [], paydayDate = 25, now = new Date()) {
  const buckets = [
    { key: "kuota", label: "Kuota & Pulsa", re: /\b(?:kuota|pulsa|paket\s*data|happy\s*\d+gb)\b/i },
    { key: "listrik", label: "Listrik / PLN", re: /\b(?:listrik|token|pln)\b/i },
    { key: "bensin", label: "Bensin", re: /\b(?:bensin|pertamax|pertalite|shell|pertamina)\b/i },
    { key: "laundry", label: "Laundry", re: /\b(?:laundry|londri)\b/i },
  ];

  const payday = Math.min(28, Math.max(1, Number(paydayDate) || 25));
  const currentBounds = getCycleBounds(now, payday);
  const daysElapsed = Math.max(1, Math.ceil((now - currentBounds.start) / 86_400_000));
  const currentCycle = currentBounds.key;

  const expenses = transactions.filter((t) => (t.type || "expense") !== "income");
  const pastCycles = new Set(
    expenses
      .map((t) => getCycleBounds(t.createdAt || now, payday).key)
      .filter((k) => k < currentCycle)
  );
  const baseCycles = Math.max(1, pastCycles.size + (pastCycles.size === 0 || daysElapsed >= 15 ? 1 : 0));

  return buckets.map((b) => {
    const matched = expenses.filter((t) => b.re.test(`${t.item || ""} ${t.notes || ""}`));
    const total = matched.reduce((a, t) => a + (Number(t.amount) || 0), 0);

    const periodMap = new Map();
    for (const t of matched) {
      const cb = getCycleBounds(t.createdAt || now, payday);
      if (!periodMap.has(cb.key)) {
        periodMap.set(cb.key, { key: cb.key, shortLabel: cb.shortLabel, total: 0, count: 0 });
      }
      const entry = periodMap.get(cb.key);
      entry.total += Number(t.amount) || 0;
      entry.count += 1;
    }

    const byPeriod = Array.from(periodMap.values())
      .sort((a, z) => z.key.localeCompare(a.key))
      .slice(0, 4);
    const monthsObserved = Math.max(baseCycles, periodMap.size);

    return {
      key: b.key,
      label: b.label,
      total,
      count: matched.length,
      avgPerTx: matched.length > 0 ? Math.round(total / matched.length) : 0,
      avgMonthly: Math.round(total / monthsObserved),
      monthsObserved,
      byPeriod,
    };
  });
}

/**
 * Inti Diablo: hitung sisa dana harian bersih (anti-ilusi BNPL: otomatis dikurangi tagihan credit/SPayLater),
 * jatah hari ini, surplus proyeksi, ringkasan per dompet, utang/piutang, & reminder.
 */
export function computeAnalytics(profile, transactions = []) {
  const now = new Date();
  const wib = toWibParts(now);
  const payday = Math.min(28, Math.max(1, Number(profile.paydayDate) || 25));
  const DAY = 86_400_000;

  const startMonth = wib.date < payday ? wib.month - 1 : wib.month;
  const cycleStart = fromWib(wib.year, startMonth, payday, 0, 0);
  const cycleEnd = fromWib(wib.year, startMonth + 1, payday, 0, 0);
  const startOfToday = startOfWibDay(now);

  const totalDays = Math.round((cycleEnd - cycleStart) / DAY);
  const daysElapsed = Math.max(1, Math.ceil((now - cycleStart) / DAY));
  const daysRemaining = Math.max(1, Math.round((cycleEnd - startOfToday) / DAY)); // termasuk hari ini

  const income = Number(profile.monthlyIncome) || 0;
  const fixedTotal = (profile.fixedCosts || []).reduce((a, c) => a + (Number(c.amount) || 0), 0);
  const savingsMonthly = (profile.savingsPots || []).reduce((a, p) => a + (Number(p.monthly) || 0), 0);

  const wallets = Array.isArray(profile.wallets) ? profile.wallets : [];
  const dailyWallets = wallets.filter((w) => w.role === "daily");
  const creditWallets = wallets.filter((w) => w.role === "credit");
  const hasDailyWallets = dailyWallets.length > 0;
  const dailyWalletIds = new Set([...dailyWallets.map((w) => w.id), ...creditWallets.map((w) => w.id)]);

  const cycleTx = transactions.filter((t) => {
    const d = new Date(t.createdAt);
    return d >= cycleStart && d < cycleEnd;
  });

  const cycleExpenses = cycleTx.filter((t) => (t.type || "expense") !== "income");
  const cycleIncomes = cycleTx.filter((t) => t.type === "income");

  const dailyCycleExpenses = hasDailyWallets
    ? cycleExpenses.filter((t) => !t.walletId || dailyWalletIds.has(t.walletId))
    : cycleExpenses;

  const spent = dailyCycleExpenses.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalAllExpenses = cycleExpenses.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalIncomeCycle = cycleIncomes.reduce((a, t) => a + (Number(t.amount) || 0), 0);

  const todaySpent = dailyCycleExpenses
    .filter((t) => new Date(t.createdAt) >= startOfToday)
    .reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const todayIncome = cycleIncomes
    .filter((t) => new Date(t.createdAt) >= startOfToday)
    .reduce((a, t) => a + (Number(t.amount) || 0), 0);

  const dailyGross = dailyWallets.reduce((a, w) => a + (Number(w.balance) || 0), 0);
  const creditDebtTotal = creditWallets.reduce((a, w) => a + Math.abs(Math.min(0, Number(w.balance) || 0)), 0);

  let disposable;
  let remaining;
  if (hasDailyWallets) {
    // Anti-ilusi BNPL: sisa dana harian bersih = saldo harian - tagihan berjalan SPayLater!
    remaining = dailyGross - creditDebtTotal;
    disposable = remaining + spent;
  } else {
    disposable = income - fixedTotal - savingsMonthly + totalIncomeCycle;
    remaining = disposable - spent;
  }

  const dailyBudget = Math.max(0, Math.round((remaining + todaySpent) / daysRemaining));
  const todayLeft = dailyBudget - todaySpent;
  const avgDaily = Math.round(spent / daysElapsed);

  const byCategory = {};
  let wantsTotal = 0;
  let giftsTotal = 0;
  let assetsTotal = 0;
  let needsTotal = 0;
  for (const t of dailyCycleExpenses) {
    const amt = Number(t.amount) || 0;
    byCategory[t.category || "Lainnya"] = (byCategory[t.category || "Lainnya"] || 0) + amt;
    const intentUpper = String(t.intent || "WANT").toUpperCase();
    if (intentUpper === "NEED") needsTotal += amt;
    else if (intentUpper === "GIFT") giftsTotal += amt;
    else if (intentUpper === "ASSET") assetsTotal += amt;
    else wantsTotal += amt;
  }
  const categories = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, spent: amount, percent: spent > 0 ? Math.round((amount / spent) * 100) : 0 }))
    .sort((a, b) => b.spent - a.spent);

  let status = "AMAN";
  let message = "Siap Tuan, keuangan masih aman. Pertahankan.";
  if (remaining < 0) {
    status = "BAHAYA";
    message = `Maaf Tuan, dana harian bersih minus ${formatRp(-remaining)} (cek tagihan PayLater/belanja).`;
  } else if (todayLeft < 0) {
    status = "HATI_HATI";
    message = `Maaf Tuan, jatah hari ini sudah lewat ${formatRp(-todayLeft)}. Mohon tahan dulu belanjanya.`;
  } else if (spent > 0 && avgDaily * daysRemaining > remaining) {
    status = "HATI_HATI";
    message = `Siap Tuan, rata-rata belanja ${formatRp(avgDaily)}/hari agak kencang dibanding sisa dana harian.`;
  }

  const wantsPct = spent > 0 ? Math.round((wantsTotal / spent) * 100) : 0;
  const giftsPct = spent > 0 ? Math.round((giftsTotal / spent) * 100) : 0;
  const assetsPct = spent > 0 ? Math.round((assetsTotal / spent) * 100) : 0;
  const needsPct = spent > 0 ? Math.max(0, 100 - wantsPct - giftsPct - assetsPct) : 100;

  const hourlySlots = [
    { key: "diniHari", label: "Dini Hari", hours: "00:00 - 05:00", spent: 0, count: 0, percent: 0 },
    { key: "pagi", label: "Pagi", hours: "05:00 - 11:00", spent: 0, count: 0, percent: 0 },
    { key: "siang", label: "Siang", hours: "11:00 - 15:00", spent: 0, count: 0, percent: 0 },
    { key: "sore", label: "Sore", hours: "15:00 - 18:00", spent: 0, count: 0, percent: 0 },
    { key: "malam", label: "Malam", hours: "18:00 - 24:00", spent: 0, count: 0, percent: 0 },
  ];

  let timedSpent = 0;
  let untimedSpent = 0;
  let untimedCount = 0;

  for (const t of dailyCycleExpenses) {
    const amt = Number(t.amount) || 0;
    if (t.timeKnown === false) {
      untimedSpent += amt;
      untimedCount++;
      continue;
    }

    timedSpent += amt;
    const hour = toWibParts(t.createdAt).hour;
    if (hour >= 0 && hour < 5) {
      hourlySlots[0].spent += amt;
      hourlySlots[0].count++;
    } else if (hour >= 5 && hour < 11) {
      hourlySlots[1].spent += amt;
      hourlySlots[1].count++;
    } else if (hour >= 11 && hour < 15) {
      hourlySlots[2].spent += amt;
      hourlySlots[2].count++;
    } else if (hour >= 15 && hour < 18) {
      hourlySlots[3].spent += amt;
      hourlySlots[3].count++;
    } else {
      hourlySlots[4].spent += amt;
      hourlySlots[4].count++;
    }
  }

  for (const s of hourlySlots) {
    s.percent = timedSpent > 0 ? Math.round((s.spent / timedSpent) * 100) : 0;
  }

  const sortedSlots = [...hourlySlots].sort((a, b) => b.spent - a.spent);
  const peakSlot = sortedSlots[0]?.spent > 0 ? sortedSlots[0] : null;

  const byWallet = wallets.map((w) => {
    const wTx = transactions.filter((t) => t.walletId === w.id);
    const expenseTotal = wTx
      .filter((t) => (t.type || "expense") !== "income")
      .reduce((a, t) => a + (Number(t.amount) || 0), 0);
    const incomeTotal = wTx
      .filter((t) => t.type === "income")
      .reduce((a, t) => a + (Number(t.amount) || 0), 0);
    return {
      ...w,
      expenseTotal,
      incomeTotal,
      txCount: wTx.length,
    };
  });

  const savingTotal = wallets
    .filter((w) => w.role === "saving")
    .reduce((a, w) => a + (Number(w.balance) || 0), 0);
  const liquidGross = dailyGross + savingTotal;
  const liquidTotal = liquidGross - creditDebtTotal; // Likuid bersih setelah potong tagihan PayLater
  const emergencyTotal = wallets
    .filter((w) => w.locked || w.role === "emergency")
    .reduce((a, w) => a + (Number(w.balance) || 0), 0);
  const netWorthTotal = liquidTotal + emergencyTotal;

  const openDebts = (profile.debts || []).filter((d) => d.status !== "paid");
  const openUtang = openDebts.filter((d) => d.type === "utang");
  const openPiutang = openDebts.filter((d) => d.type === "piutang");
  const openUtangTotal = openUtang.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const openPiutangTotal = openPiutang.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const netDebtPosition = openPiutangTotal - openUtangTotal;

  const debtsSummary = {
    openUtangCount: openUtang.length,
    openUtangTotal,
    openUtangUnknownCount: openUtang.filter((d) => d.amount === null).length,
    openPiutangCount: openPiutang.length,
    openPiutangTotal,
    openPiutangUnknownCount: openPiutang.filter((d) => d.amount === null).length,
    netDebtPosition,
    items: openDebts,
  };

  // Proyeksi Surplus akhir siklus (sisa dana harian - estimasi belanja sisa hari)
  const remainingFullDays = Math.max(0, daysRemaining - 1);
  const projectedEndCycleSurplus = Math.round(remaining - avgDaily * remainingFullDays);
  const surplusSummary = {
    dailyNetNow: remaining,
    dailyNetAfterDebts: remaining + netDebtPosition,
    projectedEndCycleSurplus,
    liquidNetAfterDebts: liquidTotal + netDebtPosition,
    creditDebtTotal,
  };

  const currentPeriod = getCycleBounds(now, payday);
  const previousPeriod = getCycleBounds(getPreviousPeriodKey(currentPeriod.key), payday);
  const periods = listAvailablePeriods(transactions, payday, now);

  const baseAnalytics = {
    cycle: {
      key: currentPeriod.key,
      label: currentPeriod.label,
      shortLabel: currentPeriod.shortLabel,
      rangeLabel: currentPeriod.rangeLabel,
      start: cycleStart.toISOString(),
      end: cycleEnd.toISOString(),
      totalDays,
      daysElapsed,
      daysRemaining,
    },
    currentPeriod: {
      key: currentPeriod.key,
      label: currentPeriod.label,
      shortLabel: currentPeriod.shortLabel,
      rangeLabel: currentPeriod.rangeLabel,
    },
    previousPeriod: {
      key: previousPeriod.key,
      label: previousPeriod.label,
      shortLabel: previousPeriod.shortLabel,
      rangeLabel: previousPeriod.rangeLabel,
    },
    periods,
    budget: {
      income,
      fixedTotal,
      savingsMonthly,
      disposable,
      spent,
      totalAllExpenses,
      totalIncomeCycle,
      todayIncome,
      remaining,
      remainingBudget: remaining,
      dailyGross,
      creditDebtTotal,
      dailyBudget,
      safeDailySpend: dailyBudget,
      todaySpent,
      todayLeft,
      todayRemaining: todayLeft,
      avgDaily,
      cycleBudget: disposable,
      cycleSpent: spent,
    },
    walletSummary: {
      hasWallets: wallets.length > 0,
      dailyGross,
      dailyTotal: remaining,
      savingTotal,
      creditDebtTotal,
      liquidGross,
      liquidTotal,
      emergencyTotal,
      netWorthTotal,
      wallets: byWallet,
    },
    surplusSummary,
    debtsSummary,
    variableAverages: computeVariableAverages(transactions, payday, now),
    status,
    message,
    categories,
    wantsTotal,
    giftsTotal,
    assetsTotal,
    needsTotal,
    wantsPercent: wantsPct,
    giftsPercent: giftsPct,
    assetsPercent: assetsPct,
    needsPercent: needsPct,
    leakDetector: {
      needsPercent: needsPct,
      wantsPercent: wantsPct,
      giftsPercent: giftsPct,
      assetsPercent: assetsPct,
      wantsTotal,
      giftsTotal,
      assetsTotal,
      needsTotal,
    },
    hourlyStats: {
      slots: hourlySlots,
      peakSlot: peakSlot || { label: "Belum terdeteksi", hours: "-", spent: 0, percent: 0, count: 0 },
      untimedSpent,
      untimedCount,
    },
    projection: {
      isDanger: remaining < 0 || (avgDaily > 0 && avgDaily * daysRemaining > remaining),
      daysUntilBroke: avgDaily > 0 ? Math.max(0, Math.floor(remaining / avgDaily)) : 99,
    },
    pots: (profile.savingsPots || []).map((p) => potStatus(p, now)),
  };

  baseAnalytics.reminders = computeReminders(profile, baseAnalytics, now);
  return baseAnalytics;
}

function formatRp(n) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

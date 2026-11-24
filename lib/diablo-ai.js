import { GoogleGenAI, Type } from "@google/genai";
import { getConfig } from "./bundled-config.js";
import { classifyExpense, hasGiftContext, buildSkillsPrompt } from "./skills.js";
import { toWibParts, fromWib, parseAmount } from "./format.js";

const SMART_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview"];
const PARSER_MODELS = SMART_MODELS;

function getGeminiClient() {
  const apiKey = getConfig("GEMINI_API_KEY");
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

const EXPENSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    required: ["amount", "item", "category", "intent", "paymentMethod"],
    properties: {
      type: { type: Type.STRING, enum: ["expense", "income", "transfer"] },
      amount: { type: Type.INTEGER },
      item: { type: Type.STRING },
      category: {
        type: Type.STRING,
        enum: [
          "Makan Pokok",
          "Jajan & Kopi",
          "Transport",
          "Belanja & Barang",
          "Hiburan & Game",
          "Tagihan",
          "Investasi",
          "Pemasukan",
          "Lainnya",
        ],
      },
      intent: { type: Type.STRING, enum: ["NEED", "WANT", "GIFT", "ASSET", "INCOME"] },
      walletId: { type: Type.STRING },
      toWalletId: { type: Type.STRING },
      paymentMethod: { type: Type.STRING },
      timeHint: { type: Type.STRING },
      notes: { type: Type.STRING },
    },
  },
};

export function cleanPunctuation(str) {
  return String(str || "")
    .replace(/^[\s,.:;•\-_/+&]+|[\s,.:;•\-_/+&]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanDateFromItem(itemText) {
  return String(itemText || "")
    .replace(/(?:pada\s+)?(?:tanggal|tgl)\s*\d{1,2}(?:\s*(?:bulan\s+)?(?:kemarin|kemaren|lalu))?/gi, " ")
    .replace(/(?:kemarin\s+lusa|kemaren\s+lusa|\d+\s*hari\s*(?:yang\s*)?lalu)/gi, " ")
    .replace(/(?:(?:kemarin|kemaren|pada)\s+)?(?:hari\s+)?(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(?:\s+(?:kemarin|kemaren|lalu|malem|malam|siang|pagi|sore))?/gi, " ")
    .replace(/(?:pada\s+)?(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?(?:\s*(?:pagi|siang|sore|malem|malam|subuh|wib))?/gi, " ")
    .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*(?:pagi|siang|sore|malem|malam|subuh|wib|wita|wit))?\b/gi, " ")
    .replace(/\b(?:[01]?\d|2[0-3])\.(?:[0-5]\d)\s*(?:wib|wita|wit)\b/gi, " ")
    .replace(/\b(?:kemarin\s+malem|kemaren\s+malem|tadi\s+malem|tadi\s+malam|kemarin\s+siang|kemaren\s+siang|kemarin\s+pagi|kemaren\s+pagi|kemarin\s+sore|kemaren\s+sore|semalam|semalem|kemarin|kemaren|hari\s+ini|tadi\s+pagi|tadi\s+siang|tadi\s+sore)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanItemName(str) {
  const rawClean = cleanPunctuation(str);
  if (/^(?:tadi\s+)?(?:makan\s+)?(?:siang|maksi)$/i.test(rawClean)) return "makan siang";
  if (/^(?:tadi\s+)?(?:makan\s+)?(?:malem|malam)$/i.test(rawClean)) return "makan malam";
  if (/^(?:tadi\s+)?(?:makan\s+)?(?:pagi|sarapan)$/i.test(rawClean)) return "makan pagi";
  if (/^(?:tadi\s+)?(?:makan\s+)?(?:sore)$/i.test(rawClean)) return "makan sore";

  let s = cleanDateFromItem(str)
    .replace(/^[\s,.:;•\-_/+&]+|[\s,.:;•\-_/+&]+$/g, "")
    .trim();

  s = s.replace(/\b(?:buat\s+makan|buat\s+ngemil|buat\s+jajan|buat\s+sarapan)\b/gi, " ");
  s = s.replace(/\b(?:pake|pakai|via|dari\s+rekening|dari\s+saldo|masuk(?:\s+ke)?|ke)\s+(?:bank\s+saqu|saqu\s+booster|saqu|booster|bni|wondr|cash|tunai|gotrade|shopeepay|shoppepay|spaylater|paylater)\b/gi, " ");

  s = s.replace(/^(?:(?:hadiah|kado)\s+)?(?:buat|untuk)\s+(?:(?:ultah|ulang\s+tahun|anniv|anniversary)\s+)?(?:cewe|cewek|pacar|doi|istri|suami|ortu|ibu|mama|ayah|bapak)(?:\s+(?:aku|ku|gua|gue))?(?:\s+ada)?\s+(?=\S)/i, "");
  s = s.replace(/^.*?\bada\s+(?=\S)/i, "");

  if (/^(?:makan\s+)?(?:siang|maksi)$/i.test(s)) return "makan siang";
  if (/^(?:makan\s+)?(?:malem|malam)$/i.test(s)) return "makan malam";
  if (/^(?:makan\s+)?(?:pagi|sarapan)$/i.test(s)) return "makan pagi";
  if (/^(?:makan\s+)?(?:sore)$/i.test(s)) return "makan sore";

  const stripRegex = /^(?:oiya|o\s*iya|oya|eh|tuh|nih|trs|terus|juga|dan|sama|ama|plus|tambah|lalu|tadi|barusan|baru\s+aja|aku|gue|gua|saya|kita|kami|beliin|beli|belanja|bayar|pesen|pesan|order|ngopi|jajan|dapet|dapat|terima|dikasih|dapatin|duit|uang|pemasukan|dari|kurangin|potong|jam|pukul)\s+/i;
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.trim().replace(stripRegex, "").trim();
  }

  const mealPrefixMatch = s.match(/^makan(?:\s+(?:siang|malem|malam|pagi|sore))?\s+(\S+.*)$/i);
  if (mealPrefixMatch) {
    s = mealPrefixMatch[1].trim();
  } else if (/^makan\s*$/i.test(s)) {
    return "makan";
  }

  s = s.replace(/\s+(?:pagi|siang|sore|malem|malam|subuh|tadi|barusan(?:\s+beli)?|baru\s+aja(?:\s+beli)?)$/gi, "");
  s = s.replace(/\s+(?:aja|itu|dong|nih|deh|ya|tuh|pake|pakai|dari|via|masuk|ke)$/gi, "");
  s = cleanPunctuation(s);

  if (/^(?:siang|maksi)$/i.test(s)) return "makan siang";
  if (/^(?:malem|malam)$/i.test(s)) return "makan malam";
  if (/^(?:pagi|sarapan)$/i.test(s)) return "makan pagi";
  if (/^(?:sore)$/i.test(s)) return "makan sore";

  return s || "Transaksi";
}

export function hasTimeHint(text) {
  const lower = String(text || "").toLowerCase();
  return (
    /(?:jam|pukul)\s*\d{1,2}/i.test(lower) ||
    /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(lower) ||
    /\b(?:[01]?\d|2[0-3])\.(?:[0-5]\d)\s*(?:wib|wita|wit)?\b/i.test(lower) ||
    /\b(?:malem|malam|semalam|semalem|sore|siang|pagi|sarapan|subuh)\b/i.test(lower)
  );
}

export function resolveTimeWib(text, defaultHour, defaultMinute) {
  const lower = String(text || "").toLowerCase();
  const timeMatch =
    lower.match(/(?:jam|pukul)\s*(\d{1,2})(?:[.:](\d{2}))?(?:\s*(pagi|siang|sore|malem|malam|subuh))?/i) ||
    lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(pagi|siang|sore|malem|malam|subuh|wib|wita|wit))?\b/i) ||
    lower.match(/\b([01]?\d|2[0-3])\.([0-5]\d)\s*(?:wib|wita|wit)?\b/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const period = (timeMatch[3] || "").toLowerCase();
    if ((period === "malem" || period === "malam") && hour < 12) hour += 12;
    else if (period === "sore" && hour < 12) hour += 12;
    else if (period === "siang" && hour < 11) hour += 12;
    else if (period === "pagi" && hour === 12) hour = 0;
    else if (!period && hour < 12) {
      if (/\b(?:malem|malam|semalam|semalem)\b/i.test(lower) && hour >= 1) hour += 12;
      else if (/\bsore\b/i.test(lower) && hour <= 7) hour += 12;
      else if (/\bsiang\b/i.test(lower) && hour <= 5) hour += 12;
    }
    return { hour: hour % 24, minute };
  }

  if (/\b(?:barusan|baru\s+(?:aja|saja)|sekarang)\b/i.test(lower)) {
    return { hour: defaultHour, minute: defaultMinute };
  }

  if (/\b(?:malem|malam|semalam|semalem)\b/i.test(lower)) return { hour: 20, minute: 30 };
  if (/\b(?:sore)\b/i.test(lower)) return { hour: 16, minute: 30 };
  if (/\b(?:siang)\b/i.test(lower)) return { hour: 12, minute: 30 };
  if (/\b(?:pagi|sarapan)\b/i.test(lower)) return { hour: 8, minute: 30 };
  if (/\b(?:subuh)\b/i.test(lower)) return { hour: 4, minute: 30 };

  return { hour: defaultHour, minute: defaultMinute };
}

function resolveGlobalTimeHint(text) {
  const raw = String(text || "");
  if (/\b(?:semalam|semalem|tadi\s+malem|tadi\s+malam)\b/i.test(raw)) {
    return resolveTimeWib(raw, 20, 30);
  }

  const cleanMealWords = raw.replace(/\b(?:makan|mam)\s+(?:pagi|siang|sore|malem|malam)\b/gi, "makan");

  const directDatePair = cleanMealWords.match(
    /(?:(?:kemarin|kemaren|lusa|hari\s+\w+|senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad|(?:tanggal|tgl)\s*\d{1,2})\s+(?:tadi\s+)?(?:pagi|siang|sore|malem|malam|subuh|(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?(?:\s*(?:pagi|siang|sore|malem|malam|subuh))?)|(?:pagi|siang|sore|malem|malam|subuh)\s+(?:kemarin|kemaren|lalu))/i
  );
  if (directDatePair) {
    return resolveTimeWib(directDatePair[0], 12, 0);
  }

  const hasNumericClock = /(?:jam|pukul)\s*\d{1,2}|\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\b(?:[01]?\d|2[0-3])\.[0-5]\d\s*(?:wib|wita|wit)?\b/i.test(raw);
  if (!hasNumericClock && /\b(?:barusan|baru\s+(?:aja|saja)|sekarang)\b/i.test(raw)) {
    return null;
  }

  const masked = cleanMealWords
    .replace(/(?:tanggal|tgl)\s*\d{1,2}/gi, (m) => " ".repeat(m.length))
    .replace(/(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?/gi, (m) => " ".repeat(m.length))
    .replace(/\b\d+\s*hari\s*(?:yang\s*)?lalu/gi, (m) => " ".repeat(m.length))
    .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, (m) => " ".repeat(m.length))
    .replace(/\b(?:[01]?\d|2[0-3])\.(?:[0-5]\d)\s*(?:wib|wita|wit)?\b/gi, (m) => " ".repeat(m.length));

  const amountRegex = /(?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(?:k|rb|ribu|jt|juta)\b|(?:rp\.?\s*)\d+|\b\d{1,3}(?:[.,]\d{3})+\b|\b\d{4,9}\b/gi;
  const matches = [...masked.matchAll(amountRegex)];
  if (matches.length <= 1) {
    return hasTimeHint(raw) ? resolveTimeWib(raw, 12, 0) : null;
  }

  const firstIdx = matches[0].index;
  const lastMatch = matches[matches.length - 1];
  const lastEnd = lastMatch.index + lastMatch[0].length;

  const beforeFirstAmount = cleanMealWords.slice(0, firstIdx);
  const afterLastAmount = cleanMealWords.slice(lastEnd);
  const firstSplit = beforeFirstAmount.split(/[\n,;•*-]/);
  const headerPart = firstSplit.length > 1 ? firstSplit[0] : beforeFirstAmount;

  if (hasTimeHint(headerPart)) return resolveTimeWib(headerPart, 12, 0);
  if (hasTimeHint(afterLastAmount)) return resolveTimeWib(afterLastAmount, 12, 0);
  return null;
}

export function applyTimeReplyToPendingItems(items = [], replyText = "") {
  const raw = String(replyText || "").trim();
  const clauses = raw.split(/[\n,;]+|\b(?:terus|trs|lalu|kemudian)\b/i).map((c) => c.trim()).filter(Boolean);

  const matchesItem = (clause, itemName) => {
    const cLow = clause.toLowerCase();
    const full = String(itemName || "").toLowerCase().trim();
    if (!full) return false;
    if (cLow.includes(full)) return true;
    const words = full.split(/\s+/).filter((w) => w.length >= 3);
    return words.some((w) => cLow.includes(w));
  };

  let defaultTime = null;
  const fallbackClause = clauses.find(
    (c) =>
      hasTimeHint(c) &&
      (/\b(?:sisanya|lainnya|semua|semuanya)\b/i.test(c) || !items.some((it) => matchesItem(c, it.item)))
  );
  if (fallbackClause) {
    defaultTime = resolveTimeWib(fallbackClause, 12, 0);
  } else if (clauses.length === 1 && hasTimeHint(raw)) {
    defaultTime = resolveTimeWib(raw, 12, 0);
  }

  return items.map((it) => {
    const specificClause = clauses.find((c) => matchesItem(c, it.item) && hasTimeHint(c));
    const resolved = specificClause
      ? resolveTimeWib(specificClause, 12, 0)
      : it.timeKnown !== false
        ? null
        : defaultTime;

    if (!resolved) return it;
    const wib = toWibParts(it.createdAt);
    return {
      ...it,
      createdAt: fromWib(wib.year, wib.month, wib.date, resolved.hour, resolved.minute).toISOString(),
      timeKnown: true,
    };
  });
}

export function parseNaturalDate(text, ref = new Date()) {
  const lower = text.toLowerCase();
  const refWib = toWibParts(ref);
  let { year, month, date } = refWib;
  let matchedText = null;

  const dateMatch = lower.match(/(?:tanggal|tgl)\s*(\d{1,2})(?:\s*(?:bulan\s+)?(?:kemarin|kemaren|lalu))?/i);
  if (dateMatch) {
    const targetDateNum = parseInt(dateMatch[1], 10);
    if (targetDateNum >= 1 && targetDateNum <= 31) {
      if (targetDateNum > date || /bulan\s+(?:kemarin|kemaren|lalu)/i.test(dateMatch[0])) {
        month -= 1;
      }
      date = targetDateNum;
      matchedText = dateMatch[0].trim();
    }
  } else if (
    lower.includes("kemarin lusa") ||
    lower.includes("kemaren lusa") ||
    lower.includes("2 hari lalu") ||
    lower.includes("2 hari yang lalu")
  ) {
    date -= 2;
    matchedText = "kemarin lusa";
  } else if (/(\d+)\s*hari\s*(?:yang\s*)?lalu/i.test(lower)) {
    const nDaysMatch = lower.match(/(\d+)\s*hari\s*(?:yang\s*)?lalu/i);
    date -= parseInt(nDaysMatch[1], 10);
    matchedText = nDaysMatch[0];
  } else if (/(?:(?:kemarin|kemaren|pada)\s+)?(?:hari\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(?:\s+(?:kemarin|kemaren|lalu))?/i.test(lower)) {
    const dayMap = { minggu: 0, ahad: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6 };
    const dayMatch = lower.match(/(?:(?:kemarin|kemaren|pada)\s+)?(?:hari\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(?:\s+(?:kemarin|kemaren|lalu))?/i);
    const targetDay = dayMap[dayMatch[1].toLowerCase()];
    let diff = refWib.day - targetDay;
    if (diff <= 0) diff += 7;
    date -= diff;
    matchedText = dayMatch[0].trim();
  } else if (/\b(?:kemarin|kemaren|semalam|semalem|tadi\s+malem|tadi\s+malam)\b/i.test(lower)) {
    const isTadiMalam = /\btadi\s+(?:malem|malam)\b/i.test(lower) && !/\b(?:kemarin|kemaren)\b/i.test(lower);
    if (!isTadiMalam || refWib.hour < 18) {
      date -= 1;
    }
    matchedText = "kemarin";
  }

  const targetWib = toWibParts(fromWib(year, month, date, 12, 0));
  const isDifferentDay = Boolean(matchedText) && (
    targetWib.year !== refWib.year || targetWib.month !== refWib.month || targetWib.date !== refWib.date
  );
  const globalTime = resolveGlobalTimeHint(text);
  const timeKnown = !isDifferentDay || Boolean(globalTime);
  const { hour, minute } = isDifferentDay
    ? (globalTime || { hour: 12, minute: 0 })
    : (globalTime || { hour: refWib.hour, minute: refWib.minute });

  return { date: fromWib(year, month, date, hour, minute), matchedText, timeKnown };
}

function findClauseHint(text, item) {
  const name = String(item || "").toLowerCase().trim();
  if (!name) return "";
  const clauses = String(text || "").split(/[\n,;]+|\b(?:terus|trs|lalu|kemudian)\b/i);
  return clauses.find((c) => c.toLowerCase().includes(name)) || "";
}

const WALLET_ALIAS_RULES = [
  {
    match: (w) => w.id === "spaylater" || w.role === "credit" || w.name.toLowerCase().includes("paylater"),
    re: /\b(?:spaylater|shopee\s*paylater|shoppepay\s*later|paylater|spl|bnpl)\b/gi,
  },
  {
    match: (w) => w.id === "shopeepay" || (w.name.toLowerCase().includes("shopeepay") && w.role !== "credit"),
    re: /\b(?:shopeepay|shoppepay|shopee\s*pay|spay)\b/gi,
  },
  {
    match: (w) => w.id.includes("booster") || w.name.toLowerCase().includes("booster"),
    re: /\b(?:saqu\s*booster|saku\s*booster|booster)\b/gi,
  },
  {
    match: (w) => w.id === "saqu" || (w.name.toLowerCase().includes("saqu") && !w.name.toLowerCase().includes("booster")),
    re: /\b(?:bank\s*saqu|saqu|saku\s*utama)\b/gi,
  },
  {
    match: (w) => w.id === "bni" || w.name.toLowerCase().includes("bni") || w.name.toLowerCase().includes("wondr"),
    re: /\b(?:bni|wondr|wonder)\b/gi,
  },
  {
    match: (w) => w.id === "cash" || w.name.toLowerCase().includes("cash") || w.name.toLowerCase().includes("tunai"),
    re: /\b(?:cash|tunai)\b/gi,
  },
  {
    match: (w) => w.id.includes("gotrade") || w.name.toLowerCase().includes("gotrade"),
    re: /\b(?:gotrade)\b/gi,
  },
];

const DEST_WALLET_PHRASE_RE =
  /\b(?:masuk\s+)?ke\s+(?:rekening\s+|dompet\s+|saldo\s+)?(?:spaylater|shopee\s*paylater|shoppepay\s*later|paylater|spl|bnpl|shopeepay|shoppepay|shopee\s*pay|spay|saqu\s*booster|saku\s*booster|booster|bank\s*saqu|saqu|saku\s*utama|bni|wondr|wonder|cash|tunai|gotrade)\b/gi;

const SOURCE_PREP_WALLET_PHRASE_RE =
  /\b(?:dari|pake|pakai|via)\s+(?:rekening\s+|dompet\s+|saldo\s+)?(?:spaylater|shopee\s*paylater|shoppepay\s*later|paylater|spl|bnpl|shopeepay|shoppepay|shopee\s*pay|spay|saqu\s*booster|saku\s*booster|booster|bank\s*saqu|saqu|saku\s*utama|bni|wondr|wonder|cash|tunai|gotrade)\b/gi;

function stripWalletMentionsByPrefix(text, wallets = [], baseRe, prefixPattern) {
  let out = String(text || "").replace(baseRe, (m) => " ".repeat(m.length));
  const customNames = (wallets || [])
    .map((w) => String(w.name || "").trim())
    .filter((n) => n.length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const name of customNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`${prefixPattern}${escaped}\\b`, "gi"), (m) => " ".repeat(m.length));
  }
  return out;
}

export function stripDestinationWalletMentions(text, wallets = []) {
  return stripWalletMentionsByPrefix(
    text,
    wallets,
    DEST_WALLET_PHRASE_RE,
    "\\b(?:masuk\\s+)?ke\\s+(?:rekening\\s+|dompet\\s+|saldo\\s+)?"
  );
}

function stripSourcePrepWalletMentions(text, wallets = []) {
  return stripWalletMentionsByPrefix(
    text,
    wallets,
    SOURCE_PREP_WALLET_PHRASE_RE,
    "\\b(?:dari|pake|pakai|via)\\s+(?:rekening\\s+|dompet\\s+|saldo\\s+)?"
  );
}

/** Deteksi seluruh walletId yang disebut eksplisit (role: "any" | "source"). Masking berurutan mencegah overlap (mis. "saqu booster" vs "saqu"). */
export function detectAllExplicitWalletIds(text, wallets = [], { role = "any" } = {}) {
  if (!text || !Array.isArray(wallets) || wallets.length === 0) return [];
  let work = (role === "source" ? stripDestinationWalletMentions(text, wallets) : String(text)).toLowerCase();
  const found = [];

  for (const rule of WALLET_ALIAS_RULES) {
    let matched = false;
    work = work.replace(rule.re, (m) => {
      matched = true;
      return " ".repeat(m.length);
    });
    if (matched) {
      const w = wallets.find(rule.match);
      if (w && !found.includes(w.id)) found.push(w.id);
    }
  }

  const customWallets = [...wallets]
    .filter((w) => String(w.name || "").trim().length >= 3)
    .sort((a, b) => b.name.length - a.name.length);
  for (const w of customWallets) {
    const escaped = w.name.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "gi");
    let matched = false;
    work = work.replace(re, (m) => {
      matched = true;
      return " ".repeat(m.length);
    });
    if (matched && !found.includes(w.id)) found.push(w.id);
  }

  return found;
}

/** Deteksi wallet HANYA jika disebut eksplisit oleh user di pesan. Mengembalikan walletId atau "". */
export function detectExplicitWalletId(text, wallets = [], options = {}) {
  return detectAllExplicitWalletIds(text, wallets, options)[0] || "";
}

function detectPaymentMethod(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(?:spaylater|shopee\s*paylater|shoppepay\s*later|paylater|spl|kartu kredit|cc)\b/.test(lower)) return "SPayLater";
  if (/\b(?:shopeepay|shoppepay|shopee\s*pay|spay)\b/.test(lower)) return "ShopeePay";
  if (/\b(?:saqu\s*booster|booster)\b/.test(lower)) return "Saqu Booster";
  if (/\b(?:bank\s*saqu|saqu)\b/.test(lower)) return "Bank Saqu";
  if (/\b(?:bni|wondr)\b/.test(lower)) return "BNI";
  if (/\b(?:cash|tunai)\b/.test(lower)) return "Cash";
  if (/\b(?:transfer|tf|bca|mandiri|bri)\b/.test(lower)) return "Transfer";
  return "QRIS";
}

function isLikelyIncomeText(text) {
  const lower = String(text || "").toLowerCase();
  return /\b(?:dapet|dapat|dapatin|pemasukan|income|gajian|cuan|bonus|dikasih|dpt|terima\s+(?:uang|duit|transfer)|transferan\s+masuk|duit\s+masuk|uang\s+masuk|cashback|refund|dividen|ngamen|freelance|honor|fee\s+project|nemui?\s+duit|jual(?:an)?\s+laku|rejeki|rezeki)\b/i.test(lower);
}

function parseSingleTransaction(chunk, amount, baseDate = new Date(), contextHint = {}) {
  let itemDate = baseDate;
  let timeKnown = contextHint.timeKnown !== false;
  if (hasTimeHint(chunk)) {
    const baseWib = toWibParts(baseDate);
    const { hour, minute } = resolveTimeWib(chunk, baseWib.hour, baseWib.minute);
    itemDate = fromWib(baseWib.year, baseWib.month, baseWib.date, hour, minute);
    timeKnown = true;
  }

  const isIncome = contextHint.forceIncome || isLikelyIncomeText(chunk);
  const chunkNoAmount = chunk
    .replace(/(?:rp\.?\s*)?\b\d{1,3}(?:[.,]\d{3})+\b/gi, "")
    .replace(/(?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(k|rb|ribu|jt|juta)?/gi, "")
    .replace(/[-*•]/g, " ")
    .replace(/\b(aku|hari|ini|udah|itu|aja|lagi|dan|lalu|terus|sama|juga)\b/gi, "")
    .replace(/\b(qris|gopay|ovo|shopeepay|shoppepay|dana|bca|mandiri|bni|wondr|bank\s*saqu|saqu\s*booster|saqu|booster|gotrade|transfer|cash|tunai|spaylater|paylater)\b/gi, "");

  let item = cleanItemName(chunkNoAmount);
  if (!item || item === "Transaksi") item = isIncome ? "Pemasukan" : "Pengeluaran";

  const walletRole = isIncome ? "any" : "source";
  const walletId = detectExplicitWalletId(chunk, contextHint.wallets, { role: walletRole }) || contextHint.walletId || "";
  const ownPayment = detectPaymentMethod(chunk);
  const paymentMethod = ownPayment !== "QRIS" ? ownPayment : contextHint.payment || "QRIS";

  if (isIncome) {
    return {
      type: "income",
      amount,
      item,
      category: "Pemasukan",
      intent: "INCOME",
      walletId,
      paymentMethod,
      createdAt: itemDate.toISOString(),
      timeKnown,
      notes: chunk.trim(),
    };
  }

  const { category, intent } = classifyExpense(item, { isGift: contextHint.isGift });
  return {
    type: "expense",
    amount,
    item,
    category,
    intent,
    walletId,
    paymentMethod,
    createdAt: itemDate.toISOString(),
    timeKnown,
    notes: chunk.trim(),
  };
}

function fallbackExpenseParser(text, referenceDate = new Date(), wallets = []) {
  const { date: targetDate, timeKnown: baseTimeKnown } = parseNaturalDate(text, referenceDate);
  const maskedText = text
    .replace(/(?:^|\n)\s*\d{1,2}[.)]\s+/g, (m) => " ".repeat(m.length))
    .replace(/(?:tanggal|tgl)\s*\d{1,2}/gi, (m) => " ".repeat(m.length))
    .replace(/(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?/gi, (m) => " ".repeat(m.length))
    .replace(/\b\d+\s*hari\s*(?:yang\s*)?lalu/gi, (m) => " ".repeat(m.length))
    .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, (m) => " ".repeat(m.length))
    .replace(/\b(?:[01]?\d|2[0-3])\.(?:[0-5]\d)\s*(?:wib|wita|wit)?\b/gi, (m) => " ".repeat(m.length));

  const isGift = hasGiftContext(text);
  const payment = detectPaymentMethod(text);
  const forceIncome = isLikelyIncomeText(text);
  const globalWalletId = detectExplicitWalletId(text, wallets, { role: forceIncome ? "any" : "source" });

  const regex = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)\b|(?:rp\.?\s*)(\d{1,3}(?:[.,]\d{3})+|\d{3,})|\b(\d{1,3}(?:\.\d{3})+)\b|\b(\d{4,9})\b/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(maskedText)) !== null) {
    const rawVal = m[1] || m[3] || m[4] || m[5];
    if (rawVal) {
      let amount = 0;
      const unit = (m[2] || "").toLowerCase();
      if (m[4]) {
        amount = Math.round(parseFloat(m[4].replace(/\./g, "").replace(",", ".")));
      } else if (unit === "k" || unit === "rb" || unit === "ribu") {
        amount = Math.round(parseFloat(rawVal.replace(",", ".")) * 1000);
      } else if (unit === "jt" || unit === "juta") {
        amount = Math.round(parseFloat(rawVal.replace(",", ".")) * 1000000);
      } else {
        amount = Math.round(parseFloat(rawVal.replace(/\./g, "").replace(",", ".")));
      }
      if (amount > 0) matches.push({ start: m.index, end: regex.lastIndex, amount });
    }
  }

  if (matches.length === 0) return [];

  if (matches.length === 1) {
    return [
      parseSingleTransaction(text, matches[0].amount, targetDate, {
        isGift,
        payment,
        walletId: globalWalletId,
        wallets,
        timeKnown: baseTimeKnown,
        forceIncome,
      }),
    ];
  }

  const results = [];
  let prevEnd = 0;
  for (let i = 0; i < matches.length; i++) {
    const nextStart = matches[i + 1] ? matches[i + 1].start : text.length;
    const afterSlice = text.slice(matches[i].end, nextStart);
    const trailingMod = afterSlice.match(
      /^\s*(?:(?:qris|gopay|ovo|dana|shopeepay|shoppepay|cash|tunai|transfer|tf|bca|mandiri|bni|wondr|bank\s*saqu|saqu\s*booster|saqu|booster|bri|spaylater|paylater|pagi|siang|sore|malem|malam|subuh|(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?(?:\s*(?:pagi|siang|sore|malem|malam|subuh))?|\b(?:[01]?\d|2[0-3])[.:][0-5]\d(?:\s*(?:wib|wita|wit))?)\b[\s,;.•*-]*)+/i
    );
    const chunkEnd = matches[i].end + (trailingMod ? trailingMod[0].length : 0);
    const chunk = text.slice(prevEnd, chunkEnd);
    prevEnd = chunkEnd;
    results.push(
      parseSingleTransaction(chunk, matches[i].amount, targetDate, {
        isGift,
        payment,
        walletId: globalWalletId,
        wallets,
        timeKnown: baseTimeKnown,
        forceIncome,
      })
    );
  }

  return results;
}

function withTimeout(promise, ms = 5500) {
  let timeoutId;
  const timer = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("AI_TIMEOUT")), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeoutId));
}

function extractJsonObject(rawText) {
  const s = String(rawText || "").trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {}
    }
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(s.slice(first, last + 1));
      } catch {}
    }
    return null;
  }
}

export function normalizeParsedTransactions(items, text, targetDate, baseTimeKnown, wallets = [], referenceDate = new Date()) {
  const isGift = hasGiftContext(text);
  const globalSourceWalletId = detectExplicitWalletId(text, wallets, { role: "source" });
  const globalAnyWalletId = detectExplicitWalletId(text, wallets);
  const validWalletIds = new Set((wallets || []).map((w) => w.id));

  return (items || [])
    .filter((it) => Number(it.amount) > 0)
    .map((it) => {
      const txType = String(it.type || "expense").toLowerCase() === "income" ? "income" : "expense";
      const item = cleanItemName(it.item) || (txType === "income" ? "Pemasukan" : "Pengeluaran");
      const clause = findClauseHint(text, item);

      const clauseDateInfo = clause ? parseNaturalDate(clause, referenceDate) : null;
      let itemDate = clauseDateInfo?.matchedText ? clauseDateInfo.date : targetDate;
      let timeKnown = clauseDateInfo?.matchedText ? clauseDateInfo.timeKnown : baseTimeKnown;
      const rawHint = [it.timeHint, it.item, it.notes, clause].filter(Boolean).join(" ");
      const hasExplicitClockInHint = /(?:jam|pukul)\s*\d{1,2}|\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\b(?:[01]?\d|2[0-3])\.[0-5]\d\s*(?:wib|wita|wit)?\b/i.test(rawHint);
      const isJustNow = /\b(?:barusan|baru\s+(?:aja|saja)|sekarang)\b/i.test(clause || text);
      if (hasTimeHint(rawHint) && (hasExplicitClockInHint || !isJustNow)) {
        const baseWib = toWibParts(itemDate);
        const { hour, minute } = resolveTimeWib(rawHint, baseWib.hour, baseWib.minute);
        itemDate = fromWib(baseWib.year, baseWib.month, baseWib.date, hour, minute);
        timeKnown = true;
      }

      const walletRole = txType === "expense" ? "source" : "any";
      const explicitClauseWallet = detectExplicitWalletId(clause, wallets, { role: walletRole });
      const globalForType = txType === "expense" ? globalSourceWalletId : globalAnyWalletId;
      const aiWallet = it.walletId && validWalletIds.has(it.walletId) ? it.walletId : "";
      const allowedSourceIds = new Set(detectAllExplicitWalletIds(text, wallets, { role: walletRole }));
      const verifiedAiWallet = aiWallet && allowedSourceIds.has(aiWallet) ? aiWallet : "";
      const walletId = explicitClauseWallet || verifiedAiWallet || globalForType || "";

      const walletObj = wallets.find((w) => w.id === walletId);
      const paymentMethod = walletObj?.name || detectPaymentMethod(clause || text);

      if (txType === "income") {
        return {
          type: "income",
          amount: Math.round(Number(it.amount) || 0),
          item,
          category: "Pemasukan",
          intent: "INCOME",
          walletId,
          walletName: walletObj?.name || "",
          paymentMethod,
          createdAt: itemDate.toISOString(),
          timeKnown,
          notes: it.notes || "",
        };
      }

      const known = classifyExpense(item, { isGift });
      const giftFallback = !known.matched && isGift && it.intent === "WANT";
      return {
        type: "expense",
        amount: Math.round(Number(it.amount) || 0),
        item,
        category: known.matched ? known.category : giftFallback ? "Belanja & Barang" : (it.category || "Lainnya"),
        intent: known.matched ? known.intent : giftFallback ? "GIFT" : (it.intent || "WANT"),
        walletId,
        walletName: walletObj?.name || "",
        paymentMethod,
        createdAt: itemDate.toISOString(),
        timeKnown,
        notes: it.notes || "",
      };
    });
}

/** Deterministic multi-line fallback for debt lists (utang/piutang) + split-bill/tx edits if AI ever fails */
function parseLocalDebtListAndEdits(text, transactions = []) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const debtUpdates = [];
  const txEdits = [];
  let currentDebtType = null;

  for (const line of lines) {
    const low = line.toLowerCase();
    if (/^(?:daftar\s+)?piutang\s*:?$/i.test(low)) {
      currentDebtType = "piutang";
      continue;
    }
    if (/^(?:daftar\s+)?(?:utang|hutang)\s*:?$/i.test(low)) {
      currentDebtType = "utang";
      continue;
    }

    // Split / edit existing tx: "terus yang ikan bakar aku bagi dua jadi per orang 68.5k"
    if (/\b(?:bagi\s+dua|dibagi\s+2|bagi\s+2|patungan|ubah|ganti|revisi|koreksi)\b/i.test(low)) {
      const amt = parseAmount(line);
      const matchedTx = (transactions || []).find((t) => {
        const itemWords = String(t.item || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
        return itemWords.length > 0 && itemWords.some((w) => low.includes(w));
      });
      if (matchedTx && amt > 0) {
        txEdits.push({
          op: /\b(?:bagi\s+dua|dibagi\s+2|bagi\s+2|patungan)\b/i.test(low) ? "split" : "edit",
          txId: matchedTx.id,
          itemQuery: matchedTx.item,
          newAmount: amt,
          note: line.slice(0, 120),
        });
        continue;
      }
    }

    // Bullet item under utang/piutang: "1. andani 86k" or "- ganis 9.7k"
    if (currentDebtType) {
      const m = line.match(/^(?:\d+[.)]\s*|[-*•]\s*)?([a-zA-Z][a-zA-Z\s]{1,35}?)\s+([\d.,]+)\s*(jt|juta|rb|ribu|k)?\b/i);
      if (m) {
        const amt = parseAmount(`${m[2]}${m[3] || ""}`);
        if (amt > 0) {
          debtUpdates.push({
            op: "upsert",
            type: currentDebtType,
            person: m[1].trim(),
            amount: amt,
            amountUnknown: false,
            note: "",
            walletId: "",
          });
        }
      }
    }
  }

  return { debtUpdates, txEdits };
}

export function normalizeParsedTransfers(transfers, text, wallets = []) {
  const validWalletIds = new Set((wallets || []).map((w) => w.id));
  const explicitSourceIds = new Set(detectAllExplicitWalletIds(text, wallets, { role: "source" }));
  const explicitAllIds = new Set(detectAllExplicitWalletIds(text, wallets));
  const resolveId = (val) => {
    const s = String(val || "").trim();
    if (!s) return "";
    if (validWalletIds.has(s)) return s;
    return detectExplicitWalletId(s, wallets);
  };

  return (transfers || [])
    .filter((tr) => Math.round(Number(tr?.amount) || 0) > 0)
    .map((tr) => {
      const resolvedTo = resolveId(tr.toWalletId);
      const toWalletId = resolvedTo && explicitAllIds.has(resolvedTo) ? resolvedTo : "";
      const rawFrom = resolveId(tr.fromWalletId);
      const fromWalletId =
        rawFrom && rawFrom !== toWalletId && explicitSourceIds.has(rawFrom) ? rawFrom : "";
      return {
        fromWalletId,
        toWalletId,
        amount: Math.round(Number(tr.amount)),
        note: String(tr.note || "").trim().slice(0, 120),
      };
    })
    .filter((tr) => tr.fromWalletId || tr.toWalletId);
}

export function parseLocalTransfersAndRemaining(text, wallets = []) {
  const clauses = String(text || "")
    .split(/[\n,;]+|\b(?:terus|trs|lalu|kemudian)\b/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const transfers = [];
  const remainingClauses = [];
  let inTransferContext = false;
  let inheritedFromWalletId = "";

  for (const clause of clauses) {
    const explicitFromClause = clause.match(/\bdari\s+(?:rekening\s+|dompet\s+|saldo\s+)?(.+?)(?=\s+\b(?:ke|buat|untuk)\b|$)/i);
    if (explicitFromClause) {
      const detectedFrom = detectExplicitWalletId(explicitFromClause[1], wallets);
      if (detectedFrom) inheritedFromWalletId = detectedFrom;
    }

    const destMatch = clause.match(/\b(?:masuk\s+)?ke\s+(?:rekening\s+|dompet\s+|saldo\s+)?(.+?)(?=\s+\b(?:buat|untuk)\b|$)/i);
    const toWalletId = destMatch ? detectExplicitWalletId(destMatch[1], wallets) : "";

    const hasTransferVerb = /\b(?:ngirim|kirim|transfer|tf|pindah(?:in)?|top\s*up|topup|isi(?:\s+saldo)?|setor|tarik)\b/i.test(clause);
    const isTopupOrSetor = /\b(?:top\s*up|topup|isi(?:\s+saldo)?|setor)\b/i.test(clause);
    const isPaylaterPayoff = /\b(?:bayar|lunas(?:in)?|cicil)(?:\s+tagihan)?\s+(?:spaylater|shopee\s*paylater|shoppepay\s*later|paylater|spl|bnpl)\b/i.test(clause);
    const anyWalletInClause = detectExplicitWalletId(clause, wallets);

    const hasTransferIntent =
      (hasTransferVerb && Boolean(toWalletId || explicitFromClause || anyWalletInClause)) ||
      isPaylaterPayoff ||
      (inTransferContext && Boolean(toWalletId));

    const amount = hasTransferIntent ? parseAmount(clause) : 0;
    if (hasTransferIntent && amount > 0) {
      inTransferContext = true;
      const nonSourceTarget = detectExplicitWalletId(stripSourcePrepWalletMentions(clause, wallets), wallets);
      const toW =
        toWalletId ||
        (isPaylaterPayoff || isTopupOrSetor ? nonSourceTarget || anyWalletInClause : "");

      const sourceOnlyClause = stripDestinationWalletMentions(clause, wallets);
      const sourceCandidates = detectAllExplicitWalletIds(sourceOnlyClause, wallets);
      const fromW =
        sourceCandidates.find((id) => id !== toW) ||
        (inheritedFromWalletId && inheritedFromWalletId !== toW ? inheritedFromWalletId : "");

      const noteMatch = clause.match(/\b((?:buat|untuk)\s+[^,;]+)$/i);
      const note = noteMatch
        ? noteMatch[1]
            .replace(/\s+(?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(?:k|rb|ribu|jt|juta)?\s*$/i, "")
            .trim()
            .slice(0, 120)
        : "";

      if (fromW || toW) {
        transfers.push({ fromWalletId: fromW, toWalletId: toW, amount, note });
        continue;
      }
    }

    inTransferContext = false;
    remainingClauses.push(clause);
  }

  return { transfers, remainingText: remainingClauses.join(", ") };
}

function fallbackAnalyzeMessage(text, profile = {}, transactions = [], referenceDate = new Date()) {
  const lower = String(text || "").toLowerCase();
  const wallets = profile?.wallets || [];

  // 1. Cek list utang/piutang atau edit/split transaksi lokal
  const { debtUpdates, txEdits } = parseLocalDebtListAndEdits(text, transactions);
  if (debtUpdates.length > 0 || txEdits.length > 0) {
    return { action: "EXECUTE_OPS", debtUpdates, txEdits, transactions: [] };
  }

  // 1b. Cek transfer / kirim / topup antar dompet sendiri
  const { transfers, remainingText } = parseLocalTransfersAndRemaining(text, wallets);
  if (transfers.length > 0) {
    const remTxs = remainingText && /\d/.test(remainingText)
      ? fallbackExpenseParser(remainingText, referenceDate, wallets)
      : [];
    return { action: "EXECUTE_OPS", transfers, transactions: remTxs, debtUpdates: [], txEdits: [] };
  }

  // 2. Cek query reminder / tagihan / surplus
  if (/\b(?:reminder|pengingat|tagihan\s+bulan|tagihan\s+tetap|cek\s+tagihan|cek\s+surplus)\b/.test(lower) && !/\d/.test(lower)) {
    return { action: "BILL_QUERY" };
  }

  // 3. Cek bayar tagihan rutin yang cocok dengan fixedCosts
  if (/\b(?:bayar|lunas(?:in)?|dibayar)\b/.test(lower) && Array.isArray(profile?.fixedCosts)) {
    const matchedBill = profile.fixedCosts.find((fc) => {
      const key = String(fc.name || "").split("(")[0].trim().toLowerCase();
      return key.length >= 3 && lower.includes(key);
    });
    if (matchedBill) {
      return {
        action: "BILL_PAID",
        billPayment: {
          billName: matchedBill.name,
          amount: parseAmount(text) || matchedBill.amount,
          walletId: detectExplicitWalletId(text, wallets),
        },
      };
    }
  }

  // 4. Cek query utang/piutang
  if (/\b(?:utang|hutang|piutang)\b/.test(lower) && (/\b(?:cek|daftar|list|siapa|apa\s+aja|berapa|lihat|liat)\b/.test(lower) || lower.includes("?"))) {
    return { action: "DEBT_QUERY" };
  }

  // 5. Cek query saldo / history dompet
  const explicitW = detectExplicitWalletId(text, wallets);
  if (explicitW && /\b(?:riwayat|history|histori|mutasi|transaksi|keluar(?:an)?|pengeluaran|pemasukan|saldo|sisa)\b/.test(lower) && !/\d/.test(lower)) {
    return {
      action: "WALLET_QUERY",
      walletQuery: {
        walletId: explicitW,
        wantHistory: /\b(?:riwayat|history|histori|mutasi|transaksi|keluar(?:an)?|pengeluaran|pemasukan)\b/.test(lower),
      },
    };
  }

  // 6. Cek pertanyaan / saran
  if (
    lower.includes("?") ||
    /\b(?:aman\s+ga|oke\s+ga|boleh\s+beli|boros|gimana|layak|mending|saran|rekomendasi|kenapa|apakah|bisa\s+ga)\b/.test(lower)
  ) {
    return { action: "ADVISOR" };
  }

  const items = fallbackExpenseParser(text, referenceDate, wallets);
  if (items.length > 0) {
    return { action: "LOG_TRANSACTIONS", transactions: items };
  }
  return { action: "ADVISOR" };
}

/**
 * SMART MULTI-OP NLU ENGINE (gemini-3.5-flash-lite -> gemini-3.1-flash-lite -> gemini-3-flash-preview):
 * Melihat dompet, tagihan tetap, utang/piutang, DAN 15 transaksi terakhir sekaligus!
 * Bisa mengeksekusi BANYAK operasi sekaligus dalam 1 pesan natural (misal update list piutang + bagi dua transaksi lama).
 */
export async function analyzeUserMessage(text, profile = {}, transactions = [], referenceDate = new Date()) {
  const ai = getGeminiClient();
  const wallets = Array.isArray(profile?.wallets) ? profile.wallets : [];
  const openDebts = (profile?.debts || []).filter((d) => d.status !== "paid");
  const recentTxs = Array.isArray(transactions) ? transactions.slice(0, 15) : [];
  const { date: targetDate, timeKnown: baseTimeKnown } = parseNaturalDate(text, referenceDate);

  if (!ai) {
    return fallbackAnalyzeMessage(text, profile, recentTxs, referenceDate);
  }

  const walletListStr = wallets.length
    ? wallets.map((w) => `- id="${w.id}" | nama="${w.name}" | saldo=Rp${w.balance} | role=${w.role}`).join("\n")
    : "(kosong)";

  const debtsListStr = openDebts.length
    ? openDebts.map((d) => `- id="${d.id}" | ${d.type} | orang="${d.person}" | Rp${d.amount ?? "?"} | note="${d.note || ""}"`).join("\n")
    : "(kosong)";

  const fixedBillsStr = (profile?.fixedCosts || []).length
    ? profile.fixedCosts.map((f) => `- "${f.name}" Rp${f.amount} (next=${f.nextDueDate || "-"})`).join("\n")
    : "(kosong)";

  const recentTxStr = recentTxs.length
    ? recentTxs
        .map((t) => {
          const p = toWibParts(t.createdAt);
          return `- id="${t.id}" | ${p.date}/${p.month + 1} | ${t.type === "income" ? "+" : "-"}Rp${t.amount} | "${t.item}" | dompet=${t.walletId || "-"}`;
        })
        .join("\n")
    : "(kosong)";

  const systemInstruction = `Kamu adalah Diablo Financial Agent NLU yang SANGAT PINTAR memahami bahasa santai/campuran Indonesia.
Tugasmu membaca pesan user bersama konteks Dompet, Utang/Piutang, Tagihan, dan 15 Transaksi Terakhir, lalu mengembalikan 1 JSON terstruktur (TANPA markdown fence).

FORMAT JSON OUTPUT:
{
  "action": "EXECUTE_OPS" | "TRANSFER" | "AUDIT_BALANCE" | "BILL_PAID" | "BILL_QUERY" | "DEBT_QUERY" | "WALLET_QUERY" | "ADVISOR",
  "transactions": [ { "type": "expense"|"income", "amount": 50000, "item": "kopi", "category": "Makan Pokok"|"Jajan & Kopi"|"Transport"|"Belanja & Barang"|"Hiburan & Game"|"Tagihan"|"Investasi"|"Pemasukan"|"Lainnya", "intent": "NEED"|"WANT"|"GIFT"|"ASSET"|"INCOME", "walletId": "", "timeHint": "", "notes": "" } ],
  "transfers": [ { "fromWalletId": "", "toWalletId": "shopeepay", "amount": 21500, "note": "buat makan siang" } ],
  "debtUpdates": [ { "op": "add"|"set"|"settle"|"delete", "type": "utang"|"piutang", "person": "Andani", "amount": 100000, "amountUnknown": false, "note": "", "walletId": "" } ],
  "txEdits": [ { "op": "edit"|"split"|"delete"|"change_wallet", "txId": "ID_DARI_TRANSAKSI_TERAKHIR", "itemQuery": "ikan bakar", "newAmount": 68500, "newWalletId": "", "newItem": "", "note": "dibagi dua" } ],
  "transfer": { "fromWalletId": "", "toWalletId": "", "amount": 0, "note": "" },
  "auditBalances": [ { "walletId": "bni", "actualBalance": 35000 } ],
  "billPayment": { "billName": "", "amount": 0, "walletId": "" },
  "walletQuery": { "walletId": "", "wantHistory": false }
}

ATURAN WAJIB:
1. Gunakan action="EXECUTE_OPS" kapan pun user:
   - Melaporkan transaksi baru (keluar/masuk) -> isi "transactions"
   - Mengirim / transfer / top up / pindah dana / setor / nabung ke dompet sendiri (1 atau banyak sekaligus, misal "ngirim 21.500 ke spay buat makan siang, terus 28.5k ke saqu booster", "topup spay 50k", "bayar spaylater 200k") -> WAJIB isi "transfers" (BUKAN "transactions" expense!). Jika user menyebut tujuan penggunaan seperti "buat makan siang" saat kirim/topup ke dompet sendiri, simpan di "note", JANGAN catat sebagai expense yang memotong dompet tujuan.
   - Menambah/mengubah/melunasi 1 ATAU BANYAK utang/piutang sekaligus -> isi "debtUpdates":
     * op="add": untuk kejadian utang/pinjam BARU atau tambahan ("minjemin ke andani 100k", "utang andani 79k buat gyurih", "talangin ganis 20k"). Jika sudah ada catatan terbuka untuk orang & tipe yang sama, nominal akan DITAMBAHKAN (86k + 100k = 186k), BUKAN menimpa!
     * op="set": HANYA untuk rekap daftar total ("daftar piutang:\n1. andani 86k\n2. ganis 9.7k") atau ralat nominal total ("piutang andani harusnya 186k").
     * op="settle" jika sudah dibayar/lunas, op="delete" jika dihapus.
     * Catatan: type="utang" dan type="piutang" untuk orang yang sama adalah 2 catatan terpisah (utang tidak boleh menimpa piutang).
   - Merevisi, membagi dua (split bill), memindah sumber dana, atau menghapus transaksi yang SUDAH ADA di daftar 15 Transaksi Terakhir -> isi "txEdits" dengan txId yang cocok dari daftar Transaksi Terakhir!
     * op="change_wallet" + newWalletId jika user meminta mengganti dompet 1 atau beberapa transaksi lama ("ganti dananya ke cash semuanya", "yang burjo sama laundry pindah ke cash"). Buat 1 entry txEdits per transaksi yang diganti.
   - Satu pesan BISA menggabungkan transfers + debtUpdates + txEdits + transactions sekaligus dalam action="EXECUTE_OPS"!
2. Gunakan op="split" di txEdits jika user bilang "bagi dua", "dibagi 2", "patungan jadi per orang X", "porsiku cuma X". Gunakan op="edit" jika koreksi typo nominal ("salah catat", "harusnya").
3. SANGAT PENTING untuk walletId di "transactions": isi walletId HANYA jika user menyebut eksplisit nama dompet sumber/pembayaran (bni/wondr, cash/tunai, shopeepay, spaylater, saqu, booster, gotrade). Jika TIDAK disebut, WAJIB isi "" agar bot memunculkan tombol pilih dana! JANGAN pakai dompet setelah kata "ke <dompet>" sebagai walletId pengeluaran.
4. SANGAT PENTING untuk "transfers": isi fromWalletId dan toWalletId HANYA jika disebut eksplisit oleh user. Jika dompet asal tidak disebut (misal cuma "ngirim 21.5k ke spay"), WAJIB isi fromWalletId="" agar bot memunculkan tombol pilih dompet asal! JANGAN menebak dompet asal.
5. TRANSFER (single legacy): pindah dana antar dompet sendiri ATAU bayar tagihan SPayLater dari dompet lain (fromWalletId="bni", toWalletId="spaylater").
6. AUDIT_BALANCE: user kirim saldo real HP untuk cek surplus/gap ("audit bni 35k cash 273k").
7. BILL_PAID: user bayar tagihan rutin (Spotify, Gemini, Kos, WiFi).
8. BILL_QUERY / DEBT_QUERY / WALLET_QUERY: user hanya bertanya/cek daftar tanpa mengubah data.
9. ADVISOR: HANYA jika user bertanya saran/konsultasi ("beli X aman ga?", "gimana keuanganku?") tanpa perintah mencatat/mengubah data.
Angka: k/rb = x1000 (86k=86000, 9.7k=9700, 68.5k=68500), jt = x1000000. Nomor urut list ("1.", "2.") BUKAN nominal uang!`;

  const prompt =
    `Dompet:\n${walletListStr}\n\n` +
    `Utang/Piutang Terbuka:\n${debtsListStr}\n\n` +
    `Tagihan Tetap:\n${fixedBillsStr}\n\n` +
    `15 Transaksi Terakhir:\n${recentTxStr}\n\n` +
    `${buildSkillsPrompt(text)}\n\n` +
    `Pesan User:\n"""\n${text}\n"""`;

  for (const model of SMART_MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            maxOutputTokens: 1500,
            temperature: 0.1,
          },
        }),
        5500
      );

      const parsed = extractJsonObject(response.text);
      if (!parsed || !parsed.action) continue;

      // Normalize legacy TRANSFER -> EXECUTE_OPS.transfers
      if (parsed.action === "TRANSFER" && parsed.transfer?.amount > 0) {
        parsed.transfers = [parsed.transfer];
        parsed.action = "EXECUTE_OPS";
      }

      if (Array.isArray(parsed.transfers) && parsed.transfers.length > 0) {
        parsed.transfers = normalizeParsedTransfers(parsed.transfers, text, wallets);
      } else {
        parsed.transfers = [];
      }

      // Normalize transactions if present
      if (Array.isArray(parsed.transactions) && parsed.transactions.length > 0) {
        parsed.transactions = normalizeParsedTransactions(
          parsed.transactions,
          text,
          targetDate,
          baseTimeKnown,
          wallets,
          referenceDate
        );
      } else {
        parsed.transactions = [];
      }

      // Promote incremental debt ops ("minjemin", "talangin", "nambah", etc.) to op="add"
      if (Array.isArray(parsed.debtUpdates) && parsed.debtUpdates.length > 0) {
        const hasIncrementalDebtCue =
          /\b(?:minjemin|pinjemin|pinjamin|minjamin|talangin|nalangin|nambah|tambah(?:in)?|utang\s+lagi|pinjem\s+lagi)\b/i.test(text);
        const isListOrCorrection =
          /\b(?:total(?:nya)?|harusnya|seharusnya|revisi|ralat|koreksi|daftar\s+(?:utang|piutang))\b/i.test(text) ||
          /^\s*(?:daftar\s+)?(?:utang|hutang|piutang)\s*:?\s*$/im.test(text);
        parsed.debtUpdates = parsed.debtUpdates.map((d) => {
          const op = String(d?.op || "upsert").toLowerCase();
          if ((op === "upsert" || op === "set") && hasIncrementalDebtCue && !isListOrCorrection) {
            return { ...d, op: "add" };
          }
          return d;
        });
      }

      // Normalize legacy single debt -> debtUpdates array
      if (parsed.debt && (!Array.isArray(parsed.debtUpdates) || parsed.debtUpdates.length === 0)) {
        const op = parsed.action === "DEBT_SETTLE" ? "settle" : "upsert";
        parsed.debtUpdates = [{ op, ...parsed.debt }];
        parsed.action = "EXECUTE_OPS";
      }

      if (parsed.action === "LOG_TRANSACTIONS" && parsed.transactions.length > 0) {
        parsed.action = "EXECUTE_OPS";
      }

      // Guard: if action is EXECUTE_OPS but everything is empty, fallback cleanly
      if (
        parsed.action === "EXECUTE_OPS" &&
        !(parsed.transactions?.length || parsed.transfers?.length || parsed.debtUpdates?.length || parsed.txEdits?.length)
      ) {
        return fallbackAnalyzeMessage(text, profile, recentTxs, referenceDate);
      }

      return parsed;
    } catch (err) {
      console.warn(`[Diablo AI] Unified analyzer ${model} gagal (${err.message})`);
    }
  }

  return fallbackAnalyzeMessage(text, profile, recentTxs, referenceDate);
}

const PARSER_SYSTEM_PROMPT =
  "Kamu adalah Diablo Transaction Parser. Ekstrak seluruh pengeluaran, pemasukan, atau transfer antar kantong (seperti 'Transfer ke Saku Booster' / 'Tabungmatik') ke JSON. k/rb = ribuan, jt = jutaan. " +
  "Jika transfer internal antar rekening sendiri (misal 'Transfer ke Saku Booster' / 'Tabungmatik'): type='transfer', walletId='saqu', toWalletId='saqu_booster'. " +
  "Jika pemasukan: type='income', category='Pemasukan', intent='INCOME'. " +
  "Jika pengeluaran: type='expense', intent=NEED/WANT/GIFT/ASSET.";

export async function parseExpenseMessage(text, referenceDate = new Date(), wallets = []) {
  const { date: targetDate, timeKnown: baseTimeKnown } = parseNaturalDate(text, referenceDate);
  const ai = getGeminiClient();
  if (!ai) return fallbackExpenseParser(text, referenceDate, wallets);

  const contents =
    `${buildSkillsPrompt(text)}\n\nEkstrak seluruh item pengeluaran atau pemasukan dari pesan berikut menjadi array JSON:\n"""\n${text}\n"""`;

  for (const model of PARSER_MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: PARSER_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: EXPENSE_SCHEMA,
            maxOutputTokens: 1500,
            temperature: 0.1,
          },
        }),
        5500
      );

      const parsed = JSON.parse(response.text.trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return normalizeParsedTransactions(items, text, targetDate, baseTimeKnown, wallets, referenceDate);
    } catch (err) {
      console.warn(`[Diablo AI] Parser ${model} gagal (${err.message})`);
    }
  }
  return fallbackExpenseParser(text, referenceDate, wallets);
}

/**
 * Multimodal Vision: Ekstrak Foto Struk / Bukti Transfer / Screenshot Mutasi Bank Saqu / QRIS
 * Pintar membedakan "Transfer ke Saku Booster" / Tabungmatik sebagai transfer internal (bukan pengeluaran!).
 */
export async function parseReceiptImage(base64Data, mimeType = "image/jpeg", caption = "", wallets = []) {
  const ai = getGeminiClient();
  const { date: targetDate, timeKnown } = parseNaturalDate(caption || "");
  const isGift = hasGiftContext(caption || "");
  const explicitWallet = detectExplicitWalletId(caption || "", wallets);

  if (!ai) {
    if (caption) return fallbackExpenseParser(caption, new Date(), wallets);
    throw new Error("GEMINI_API_KEY wajib diisi untuk membaca foto struk/QRIS.");
  }

  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  for (const model of PARSER_MODELS) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [
            { inlineData: { data: cleanBase64, mimeType } },
            {
              text:
                `${buildSkillsPrompt(caption || "")}\nBaca gambar struk/bukti QRIS/mutasi bank ini. ${caption ? `Catatan Tuan: "${caption}".` : ""} ` +
                `Ekstrak item transaksi ke array JSON. PENTING: jika ada mutasi 'Transfer ke Saku Booster' atau 'Tabungmatik' di Bank Saqu, set type='transfer', walletId='saqu', toWalletId='saqu_booster' agar tidak salah dihitung sebagai pengeluaran!`,
            },
          ],
          config: {
            systemInstruction: PARSER_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseSchema: EXPENSE_SCHEMA,
            maxOutputTokens: 1500,
            temperature: 0.1,
          },
        }),
        7000
      );

      const parsed = JSON.parse(response.text.trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items.map((it) => {
        const rawType = String(it.type || "expense").toLowerCase();
        const item = cleanItemName(it.item) || (rawType === "income" ? "Pemasukan" : "Pengeluaran");
        const isBoosterTransfer =
          rawType === "transfer" || /\b(?:saku\s*booster|saqu\s*booster|tabungmatik)\b/i.test(`${it.item || ""} ${it.notes || ""}`);

        if (isBoosterTransfer) {
          return {
            type: "transfer",
            amount: Math.round(Number(it.amount) || 0),
            item,
            fromWalletId: it.walletId || explicitWallet || "saqu",
            toWalletId: it.toWalletId || "saqu_booster",
            createdAt: targetDate.toISOString(),
            timeKnown,
          };
        }

        const txType = rawType === "income" ? "income" : "expense";
        const known = classifyExpense(item, { isGift });
        const giftFallback = !known.matched && isGift && it.intent === "WANT";
        const walletObj = wallets.find((w) => w.id === explicitWallet);
        return {
          ...it,
          type: txType,
          item,
          category: txType === "income" ? "Pemasukan" : (known.matched ? known.category : giftFallback ? "Belanja & Barang" : it.category),
          intent: txType === "income" ? "INCOME" : (known.matched ? known.intent : giftFallback ? "GIFT" : it.intent),
          walletId: explicitWallet,
          walletName: walletObj?.name || "",
          createdAt: targetDate.toISOString(),
          timeKnown,
        };
      });
    } catch (err) {
      console.warn(`[Diablo Receipt] Model ${model} gagal (${err.message})`);
    }
  }
  if (caption) return fallbackExpenseParser(caption, new Date(), wallets);
  throw new Error("Gagal membaca struk saat ini, silakan ketik manual nominalnya Tuan.");
}

/**
 * Chat #2: Diablo Financial Advisor (Sopan, Cerdas, Kontekstual — tidak pernah bilang "Setelah beli Rp 1"!)
 */
export async function askFinancialAdvisor(question, profile, analytics, recentTransactions = []) {
  const ai = getGeminiClient();
  const candidateModels = SMART_MODELS;

  const isPurchaseQuestion = /\b(?:beli|harga|aman\s+ga|boleh\s+beli|oke\s+ga|worth|mending|cukup\s+ga|checkout)\b/i.test(question);
  const extractedPrice = isPurchaseQuestion ? parseAmount(question) : 0;

  const remaining = analytics?.budget?.remainingBudget ?? 0;
  const days = Math.max(1, analytics?.cycle?.daysRemaining ?? 1);
  const currentDaily = analytics?.budget?.safeDailySpend ?? 0;
  const todaySpent = analytics?.budget?.todaySpent ?? 0;
  const todayRemaining = analytics?.budget?.todayRemaining ?? 0;
  const newDaily = Math.max(0, Math.round((remaining - extractedPrice) / days));

  const topCats = (analytics?.categories || []).slice(0, 3).map((c) => `${c.category}: Rp ${(c.spent || 0).toLocaleString("id-ID")} (${c.percent || 0}%)`);

  const buildSmartFallback = () => {
    if (extractedPrice >= 1000) {
      if (extractedPrice > remaining) {
        return {
          verdict: "BAHAYA",
          itemPrice: extractedPrice,
          impactOnDailySpend: newDaily,
          reply: `Tidak aman dari dana harian Tuan. Harga Rp ${extractedPrice.toLocaleString("id-ID")} melebihi sisa dana harian Rp ${remaining.toLocaleString("id-ID")}.`,
        };
      }
      return {
        verdict: extractedPrice > remaining * 0.35 || newDaily < 35000 ? "WASPADA" : "AMAN",
        itemPrice: extractedPrice,
        impactOnDailySpend: newDaily,
        reply: `Aman Tuan. Setelah Rp ${extractedPrice.toLocaleString("id-ID")}, jatah harian Tuan tersisa Rp ${newDaily.toLocaleString("id-ID")}/hari (${days} hari ke gajian).`,
      };
    }
    return {
      verdict: analytics?.status === "BAHAYA" ? "BAHAYA" : analytics?.status === "HATI_HATI" ? "WASPADA" : "AMAN",
      itemPrice: 0,
      impactOnDailySpend: currentDaily,
      reply: `Siap Tuan. Sisa dana harian bersih Rp ${remaining.toLocaleString("id-ID")} (jatah Rp ${currentDaily.toLocaleString("id-ID")}/hari, ${days} hari ke gajian). Jika Tuan ingin mengubah catatan transaksi atau utang/piutang, sebutkan dengan jelas ya Tuan.`,
    };
  };

  if (!ai) return buildSmartFallback();

  const walletsInfo = (profile?.wallets || []).map(
    (w) => `${w.name}: Rp ${(w.balance || 0).toLocaleString("id-ID")} (${w.locked ? "Dana Darurat/Terkunci" : w.role})`
  );
  const openDebts = (profile?.debts || [])
    .filter((d) => d.status !== "paid")
    .map((d) => `${d.type.toUpperCase()} ${d.person}: ${d.amount === null ? "nominal belum jelas" : `Rp ${d.amount.toLocaleString("id-ID")}`}${d.note ? ` (${d.note})` : ""}`);

  const contextData = {
    dompetDanSaldo: walletsInfo.length ? walletsInfo : "Belum diatur",
    sisaDanaHarianBersih: `Rp ${remaining.toLocaleString("id-ID")}`,
    tanggalGajian: profile?.paydayDate || 25,
    sisaHariKeGajian: days,
    jatahHarianSaatIni: `Rp ${currentDaily.toLocaleString("id-ID")}/hari`,
    pengeluaranHariIni: `Rp ${todaySpent.toLocaleString("id-ID")}`,
    pemasukanSiklusIni: `Rp ${(analytics?.budget?.totalIncomeCycle || 0).toLocaleString("id-ID")}`,
    sisaJatahHariIni: `Rp ${todayRemaining.toLocaleString("id-ID")}`,
    estimasiHargaBarangDitanyakan: extractedPrice >= 1000 ? `Rp ${extractedPrice.toLocaleString("id-ID")}` : "Tidak menanyakan harga barang",
    jatahHarianJikaJadiBeli: extractedPrice >= 1000 ? `Rp ${newDaily.toLocaleString("id-ID")}/hari` : "-",
    rasioNeedsVsWants: `${analytics?.leakDetector?.needsPercent ?? 100}% Needs vs ${analytics?.leakDetector?.wantsPercent ?? 0}% Wants`,
    topKategoriPengeluaran: topCats.length > 0 ? topCats : "Belum ada",
    utangDanPiutangTerbuka: openDebts.length ? openDebts : "Tidak ada",
  };

  try {
    const prompt = `Pertanyaan Tuan: "${question}"
Data Keuangan Tuan: ${JSON.stringify(contextData)}
10 Transaksi Terakhir: ${JSON.stringify(recentTransactions.slice(0, 10).map((t) => `${t.type === "income" ? "[MASUK]" : "[KELUAR]"} ${t.item} Rp${t.amount} (${t.walletName || t.walletId || "-"})`))}

ATURAN WAJIB PERSONA DIABLO:
1. Panggil user "Tuan" (DILARANG kata "Anda"). Sebut dirimu "hamba".
2. Cerdas, sopan, luwes, langsung ke inti (maksimal 2-3 kalimat).
3. Gotrade adalah Dana Darurat terkunci — jangan sarankan disentuh untuk belanja konsumtif.
4. Jawab sesuai konteks pertanyaan Tuan; jangan mengarang angka belanja jika Tuan tidak sedang bertanya soal membeli barang.
Balas JSON: {"verdict":"AMAN"|"WASPADA"|"BAHAYA","reply":"..."}`;

    for (const model of candidateModels) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction:
                "Kamu adalah Diablo, pelayan finansial pribadi Tuan. Sopan, cerdas, luwes, to-the-point (maksimal 2-3 kalimat). Balas JSON valid.",
              responseMimeType: "application/json",
              maxOutputTokens: 350,
              temperature: 0.2,
            },
          }),
          5500
        );

        const resObj = extractJsonObject(response.text);
        if (resObj?.reply) {
          return {
            verdict: resObj.verdict || "AMAN",
            itemPrice: extractedPrice,
            impactOnDailySpend: newDaily,
            reply: resObj.reply,
          };
        }
      } catch (err) {
        console.warn(`[Diablo Advisor] Model ${model} skipped (${err.message})`);
      }
    }

    return buildSmartFallback();
  } catch (err) {
    console.error("[Diablo Advisor] AI error:", err.message);
    return buildSmartFallback();
  }
}

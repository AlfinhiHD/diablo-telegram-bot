import { GoogleGenAI, Type } from "@google/genai";
import { getConfig } from "./bundled-config.js";
import { classifyExpense, hasGiftContext, buildSkillsPrompt } from "./skills.js";
import { toWibParts, fromWib, parseAmount } from "./format.js";

const SMART_MODELS = ["gemini-3.5-flash-lite", "gemini-3-flash-preview"];
const PARSER_MODELS = SMART_MODELS;

function modelExtraConfig() {
  return {};
}

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
      type: { type: Type.STRING, enum: ["expense", "income"] },
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
      paymentMethod: { type: Type.STRING },
      timeHint: { type: Type.STRING },
      notes: { type: Type.STRING },
    },
  },
};

const UNIFIED_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  required: ["action"],
  properties: {
    action: {
      type: Type.STRING,
      enum: [
        "LOG_TRANSACTIONS",
        "TRANSFER",
        "AUDIT_BALANCE",
        "BILL_PAID",
        "BILL_QUERY",
        "DEBT_ADD",
        "DEBT_UPDATE",
        "DEBT_SETTLE",
        "DEBT_QUERY",
        "WALLET_QUERY",
        "ADVISOR",
      ],
    },
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["type", "amount", "item", "category", "intent"],
        properties: {
          type: { type: Type.STRING, enum: ["expense", "income"] },
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
          paymentMethod: { type: Type.STRING },
          timeHint: { type: Type.STRING },
          notes: { type: Type.STRING },
        },
      },
    },
    transfer: {
      type: Type.OBJECT,
      properties: {
        fromWalletId: { type: Type.STRING },
        toWalletId: { type: Type.STRING },
        amount: { type: Type.INTEGER },
        note: { type: Type.STRING },
      },
    },
    auditBalances: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["walletId", "actualBalance"],
        properties: {
          walletId: { type: Type.STRING },
          actualBalance: { type: Type.INTEGER },
        },
      },
    },
    billPayment: {
      type: Type.OBJECT,
      properties: {
        billName: { type: Type.STRING },
        amount: { type: Type.INTEGER },
        walletId: { type: Type.STRING },
      },
    },
    debt: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ["utang", "piutang"] },
        person: { type: Type.STRING },
        amount: { type: Type.INTEGER },
        amountUnknown: { type: Type.BOOLEAN },
        note: { type: Type.STRING },
        walletId: { type: Type.STRING },
      },
    },
    walletQuery: {
      type: Type.OBJECT,
      properties: {
        walletId: { type: Type.STRING },
        wantHistory: { type: Type.BOOLEAN },
      },
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

  // Strip preamble seperti "hadiah buat ultah cewe ada bunga" -> "bunga" jika diikuti nama barang
  s = s.replace(/^(?:(?:hadiah|kado)\s+)?(?:buat|untuk)\s+(?:(?:ultah|ulang\s+tahun|anniv|anniversary)\s+)?(?:cewe|cewek|pacar|doi|istri|suami|ortu|ibu|mama|ayah|bapak)(?:\s+(?:aku|ku|gua|gue))?(?:\s+ada)?\s+(?=\S)/i, "");
  s = s.replace(/^.*?\bada\s+(?=\S)/i, "");

  // Frasa umum waktu makan tanpa lauk spesifik: pertahankan nama makanannya
  if (/^(?:makan\s+)?(?:siang|maksi)$/i.test(s)) return "makan siang";
  if (/^(?:makan\s+)?(?:malem|malam)$/i.test(s)) return "makan malam";
  if (/^(?:makan\s+)?(?:pagi|sarapan)$/i.test(s)) return "makan pagi";
  if (/^(?:makan\s+)?(?:sore)$/i.test(s)) return "makan sore";

  // Strip leading filler words, pronouns, connectors, and transaction verbs iteratively
  const stripRegex = /^(?:oiya|o\s*iya|oya|eh|tuh|nih|trs|terus|juga|dan|sama|ama|plus|tambah|lalu|tadi|barusan|baru\s+aja|aku|gue|gua|saya|kita|kami|beliin|beli|belanja|bayar|pesen|pesan|order|ngopi|jajan|dapet|dapat|terima|dikasih|dapatin|duit|uang|pemasukan|dari|jam|pukul)\s+/i;
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.trim().replace(stripRegex, "").trim();
  }

  // Jika ada lauk/makanan spesifik setelah "makan siang/malem/malam/pagi/sore", buang awalan makannya
  const mealPrefixMatch = s.match(/^makan(?:\s+(?:siang|malem|malam|pagi|sore))?\s+(\S+.*)$/i);
  if (mealPrefixMatch) {
    s = mealPrefixMatch[1].trim();
  } else if (/^makan\s*$/i.test(s)) {
    return "makan";
  }

  // Bersihkan keterangan waktu / filler yang menempel di belakang item
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
  const globalTime = isDifferentDay ? resolveGlobalTimeHint(text) : null;
  const timeKnown = !isDifferentDay || Boolean(globalTime);
  const { hour, minute } = isDifferentDay
    ? (globalTime || { hour: 12, minute: 0 })
    : resolveTimeWib(text, refWib.hour, refWib.minute);

  return { date: fromWib(year, month, date, hour, minute), matchedText, timeKnown };
}

function findClauseHint(text, item) {
  const name = String(item || "").toLowerCase().trim();
  if (!name) return "";
  const clauses = String(text || "").split(/[\n,;]+|\b(?:terus|trs|lalu|kemudian)\b/i);
  return clauses.find((c) => c.toLowerCase().includes(name)) || "";
}

/** Deteksi wallet HANYA jika disebut eksplisit oleh user di pesan. Mengembalikan walletId atau "". */
export function detectExplicitWalletId(text, wallets = []) {
  const lower = String(text || "").toLowerCase();
  if (!lower || !Array.isArray(wallets) || wallets.length === 0) return "";

  const findByIdOrName = (pred) => wallets.find(pred)?.id || "";

  if (/\b(?:spaylater|shopee\s*paylater|shoppepay\s*later|paylater|spl|bnpl)\b/.test(lower)) {
    return findByIdOrName((w) => w.id === "spaylater" || w.role === "credit" || w.name.toLowerCase().includes("paylater"));
  }
  if (/\b(?:shopeepay|shoppepay|shopee\s*pay|spay)\b/.test(lower)) {
    return findByIdOrName((w) => w.id === "shopeepay" || (w.name.toLowerCase().includes("shopeepay") && w.role !== "credit"));
  }
  if (/\b(?:saqu\s*booster|booster)\b/.test(lower)) {
    return findByIdOrName((w) => w.id.includes("booster") || w.name.toLowerCase().includes("booster"));
  }
  if (/\b(?:bank\s*saqu|saqu|saku\s*utama)\b/.test(lower)) {
    return findByIdOrName((w) => w.id === "saqu" || (w.name.toLowerCase().includes("saqu") && !w.name.toLowerCase().includes("booster")));
  }
  if (/\b(?:bni|wondr|wonder)\b/.test(lower)) {
    return findByIdOrName((w) => w.id === "bni" || w.name.toLowerCase().includes("bni") || w.name.toLowerCase().includes("wondr"));
  }
  if (/\b(?:cash|tunai)\b/.test(lower)) {
    return findByIdOrName((w) => w.id === "cash" || w.name.toLowerCase().includes("cash") || w.name.toLowerCase().includes("tunai"));
  }
  if (/\b(?:gotrade)\b/.test(lower)) {
    return findByIdOrName((w) => w.id.includes("gotrade") || w.name.toLowerCase().includes("gotrade"));
  }

  for (const w of wallets) {
    const wLow = w.name.toLowerCase();
    if (wLow.length >= 3 && new RegExp(`\\b${wLow.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) {
      return w.id;
    }
  }
  return "";
}

/** Metode bayar hanya dari yang disebut user di pesan; default QRIS. */
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

  const walletId = detectExplicitWalletId(chunk, contextHint.wallets) || contextHint.walletId || "";
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

/**
 * Fallback regex parser jika GEMINI_API_KEY bermasalah / timeout
 */
function fallbackExpenseParser(text, referenceDate = new Date(), wallets = []) {
  const { date: targetDate, timeKnown: baseTimeKnown } = parseNaturalDate(text, referenceDate);
  const maskedText = text
    .replace(/(?:tanggal|tgl)\s*\d{1,2}/gi, (m) => " ".repeat(m.length))
    .replace(/(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?/gi, (m) => " ".repeat(m.length))
    .replace(/\b\d+\s*hari\s*(?:yang\s*)?lalu/gi, (m) => " ".repeat(m.length))
    .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, (m) => " ".repeat(m.length))
    .replace(/\b(?:[01]?\d|2[0-3])\.(?:[0-5]\d)\s*(?:wib|wita|wit)?\b/gi, (m) => " ".repeat(m.length));

  const isGift = hasGiftContext(text);
  const payment = detectPaymentMethod(text);
  const globalWalletId = detectExplicitWalletId(text, wallets);
  const forceIncome = isLikelyIncomeText(text);

  const regex = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)\b|(?:rp\.?\s*)(\d{1,3}(?:[.,]\d{3})+|\d+)|\b(\d{1,3}(?:[.,]\d{3})+)\b|\b(\d{4,9})\b/gi;
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

      if (amount > 0) {
        matches.push({ start: m.index, end: regex.lastIndex, amount });
      }
    }
  }

  if (matches.length === 0) return [];

  const results = [];
  if (matches.length === 1) {
    results.push(
      parseSingleTransaction(text, matches[0].amount, targetDate, {
        isGift,
        payment,
        walletId: globalWalletId,
        wallets,
        timeKnown: baseTimeKnown,
        forceIncome,
      })
    );
    return results;
  }

  let prevEnd = 0;
  for (let i = 0; i < matches.length; i++) {
    const nextStart = matches[i + 1] ? matches[i + 1].start : text.length;
    const afterSlice = text.slice(matches[i].end, nextStart);
    const trailingMod = afterSlice.match(
      /^\s*(?:(?:qris|gopay|ovo|dana|shopeepay|cash|tunai|transfer|tf|bca|mandiri|bni|wondr|bank\s*saqu|saqu\s*booster|saqu|booster|bri|spaylater|paylater|pagi|siang|sore|malem|malam|subuh|(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?(?:\s*(?:pagi|siang|sore|malem|malam|subuh))?|\b(?:[01]?\d|2[0-3])[.:][0-5]\d(?:\s*(?:wib|wita|wit))?)\b[\s,;.•*-]*)+/i
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

function withTimeout(promise, ms = 6000) {
  let timeoutId;
  const timer = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("AI_TIMEOUT")), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeoutId));
}

function normalizeParsedTransactions(items, text, targetDate, baseTimeKnown, wallets = []) {
  const isGift = hasGiftContext(text);
  const globalWalletId = detectExplicitWalletId(text, wallets);
  const validWalletIds = new Set((wallets || []).map((w) => w.id));

  return (items || [])
    .filter((it) => Number(it.amount) > 0)
    .map((it) => {
      const txType = String(it.type || "expense").toLowerCase() === "income" ? "income" : "expense";
      const item = cleanItemName(it.item) || (txType === "income" ? "Pemasukan" : "Pengeluaran");
      const clause = findClauseHint(text, item);

      let itemDate = targetDate;
      let timeKnown = baseTimeKnown;
      const rawHint = [it.timeHint, it.item, it.notes, clause].filter(Boolean).join(" ");
      if (hasTimeHint(rawHint)) {
        const baseWib = toWibParts(targetDate);
        const { hour, minute } = resolveTimeWib(rawHint, baseWib.hour, baseWib.minute);
        itemDate = fromWib(baseWib.year, baseWib.month, baseWib.date, hour, minute);
        timeKnown = true;
      }

      // Wallet HANYA diisi jika disebut eksplisit oleh user (validasi against actual wallets + text)
      const explicitClauseWallet = detectExplicitWalletId(clause, wallets);
      const aiWallet = it.walletId && validWalletIds.has(it.walletId) ? it.walletId : "";
      const walletId = explicitClauseWallet || (globalWalletId ? (aiWallet || globalWalletId) : "");

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

function fallbackAnalyzeMessage(text, profile = {}, referenceDate = new Date()) {
  const lower = String(text || "").toLowerCase();
  const wallets = profile?.wallets || [];

  // Cek query reminder / tagihan / surplus
  if (/\b(?:reminder|pengingat|tagihan\s+bulan|tagihan\s+tetap|cek\s+tagihan|cek\s+surplus)\b/.test(lower) && !/\d/.test(lower)) {
    return { action: "BILL_QUERY" };
  }

  // Cek bayar tagihan rutin yang cocok dengan fixedCosts
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

  // Cek query utang/piutang
  if (/\b(?:utang|hutang|piutang)\b/.test(lower) && (/\b(?:cek|daftar|list|siapa|apa\s+aja|berapa|lihat|liat)\b/.test(lower) || lower.includes("?"))) {
    return { action: "DEBT_QUERY" };
  }

  // Cek query saldo / history dompet
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

  // Cek pertanyaan / saran
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
 * SMART UNIFIED BRAIN (gemini-3.5-flash primary):
 * Memahami laporan bahasa natural Indonesia: pengeluaran, pemasukan (ngamen/freelance/gajian/etc),
 * transfer antar dompet, catat/update/lunasi utang & piutang, cek riwayat per dompet, atau konsultasi advisor.
 */
export async function analyzeUserMessage(text, profile = {}, referenceDate = new Date()) {
  const ai = getGeminiClient();
  const wallets = Array.isArray(profile?.wallets) ? profile.wallets : [];
  const openDebts = (profile?.debts || []).filter((d) => d.status !== "paid");
  const { date: targetDate, timeKnown: baseTimeKnown } = parseNaturalDate(text, referenceDate);

  if (!ai) {
    return fallbackAnalyzeMessage(text, profile, referenceDate);
  }

  const walletListStr = wallets.length
    ? wallets.map((w) => `- id="${w.id}" | nama="${w.name}" | saldo=Rp${w.balance} | role=${w.role}${w.locked ? " (LOCKED/DANA DARURAT)" : ""}`).join("\n")
    : "(belum ada dompet terpisah)";

  const debtsListStr = openDebts.length
    ? openDebts.map((d) => `- ${d.type.toUpperCase()} | orang="${d.person}" | nominal=${d.amount === null ? "BELUM JELAS (?)" : `Rp${d.amount}`} | catatan="${d.note || "-"}"`).join("\n")
    : "(tidak ada utang/piutang terbuka)";

  const fixedBillsStr = (profile?.fixedCosts || []).length
    ? profile.fixedCosts.map((f) => `- nama="${f.name}" | nominal=Rp${f.amount} | jatuhTempo=${f.nextDueDate || (f.dueDay ? `tgl ${f.dueDay}` : "-")}`).join("\n")
    : "(belum ada tagihan tetap)";

  const systemInstruction =
    "Kamu adalah Diablo Financial NLU Engine yang sangat pintar memahami bahasa santai Indonesia (gaul, typo, singkatan). " +
    "Tugasmu mengklasifikasikan pesan user dan mengekstrak data JSON terstruktur secara akurat.\n\n" +
    "ATURAN AKSI:\n" +
    "1. LOG_TRANSACTIONS: Jika user melaporkan PENGELUARAN (beli, makan, bayar, jajan, habis, topup, checkout, kurangin dana X buat Y) ATAU PEMASUKAN (dapet duit, dapat uang, pemasukan, ngamen, freelance, gajian, bonus, dikasih, jualan, cashback, refund, cuan, transferan masuk).\n" +
    "   - Untuk pemasukan: type='income', category='Pemasukan', intent='INCOME'.\n" +
    "   - Untuk pengeluaran: type='expense', intent=NEED/WANT/GIFT/ASSET sesuai konteks & kamus.\n" +
    "   - SANGAT PENTING untuk walletId: Isi walletId HANYA jika user menyebut eksplisit nama dompet/bank/cash/spaylater di pesan (contoh: 'pake cash', 'dari bank saqu', 'masuk bni', 'pake spaylater', 'shopeepay', 'wondr', 'booster'). Jika user TIDAK menyebut sumber/tujuan dana, WAJIB isi walletId='' (string kosong) agar bot menampilkan tombol pilihan dana!\n" +
    "2. TRANSFER: Jika user memindahkan uang antar dompet miliknya sendiri ATAU MELUNASI TAGIHAN SPAYLATER dari dompet lain (misal: 'pindahin 500k dari bank saqu ke bni', 'tarik tunai 200k dari bni ke cash', 'bayar spaylater 500k dari bni' -> fromWalletId='bni', toWalletId='spaylater').\n" +
    "3. AUDIT_BALANCE: Jika user melaporkan saldo aktual di HP untuk dicocokkan / cari surplus atau gap (misal: 'audit bni 35k cash 273k saqu 1.313jt', 'sekarang bni 50k cash 200k cek gap'). Untuk tagihan spaylater isi angka negatif (misal -500000).\n" +
    "4. BILL_PAID: Jika user bilang sudah membayar salah satu tagihan tetap rutinnya (Spotify, Gemini, Kos, WiFi) misal: 'udah bayar spotify 30k pake bni' atau 'bayar gemini pake bank saqu'.\n" +
    "5. BILL_QUERY: Jika user menanyakan daftar tagihan bulanan, jadwal jatuh tempo, reminder, atau surplus ('cek tagihan', 'tagihan bulan ini apa aja', 'cek reminder', 'cek surplus').\n" +
    "6. DEBT_ADD: Jika user mencatat utang baru (aku utang ke X) atau piutang baru (X ngutang ke aku / aku talangin X). Jika nominal belum pasti, set amount=0 dan amountUnknown=true.\n" +
    "7. DEBT_UPDATE: Jika user memperbarui nominal utang/piutang yang sudah ada (misal: 'utang sup kalduara 57k').\n" +
    "8. DEBT_SETTLE: Jika user bilang utang/piutang sudah dibayar/lunas (misal: 'andani udah bayar 74.33k masuk shopeepay', 'udah bayar utang sup kalduara 57k pake cash').\n" +
    "9. DEBT_QUERY: Jika user menanyakan daftar utang/piutang ('utangku apa aja', 'siapa yang ngutang', 'cek piutang').\n" +
    "10. WALLET_QUERY: Jika user menanyakan saldo dompet atau riwayat transaksi dompet tertentu ('cek saldo', 'uangku dimana aja', 'riwayat bank saqu', 'pengeluaran cash apa aja').\n" +
    "11. ADVISOR: Jika user bertanya saran/kelayakan beli ('beli X 500k aman ga?'), curhat, atau ngobrol umum.\n" +
    "Catatan angka: 'k'/'rb' = x1000 (contoh 74.33k = 74330, 50k = 50000), 'jt' = x1000000, '56.943' = 56943.";

  const prompt =
    `Daftar Dompet User:\n${walletListStr}\n\n` +
    `Daftar Tagihan Tetap User:\n${fixedBillsStr}\n\n` +
    `Daftar Utang & Piutang Terbuka:\n${debtsListStr}\n\n` +
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
            responseSchema: UNIFIED_ANALYSIS_SCHEMA,
            maxOutputTokens: 2000,
            temperature: 0.1,
            ...modelExtraConfig(model),
          },
        }),
        7000
      );

      const parsed = JSON.parse(response.text.trim());
      if (parsed.action === "LOG_TRANSACTIONS") {
        const normalized = normalizeParsedTransactions(
          parsed.transactions,
          text,
          targetDate,
          baseTimeKnown,
          wallets
        );
        if (normalized.length > 0) {
          return { action: "LOG_TRANSACTIONS", transactions: normalized };
        }
      }
      return parsed;
    } catch (err) {
      console.warn(`[Diablo AI] Unified analyzer ${model} gagal (${err.message})`);
    }
  }

  return fallbackAnalyzeMessage(text, profile, referenceDate);
}

const PARSER_SYSTEM_PROMPT =
  "Kamu adalah Diablo Transaction Parser. Ekstrak seluruh pengeluaran atau pemasukan dari pesan ke JSON. k/rb = ribuan, jt = jutaan. " +
  "Jika pemasukan (dapet duit, gajian, ngamen, freelance, bonus, refund, cashback): type='income', category='Pemasukan', intent='INCOME'. " +
  "Jika pengeluaran: type='expense', intent=NEED/WANT/GIFT/ASSET. " +
  "Jika item menyebut waktu/jam spesifik (pagi, siang, sore, malem, subuh, jam 8, 19:30), tulis di timeHint; jika tidak ada biarkan string kosong.";

/**
 * Parsing pesan teks laporan pengeluaran/pemasukan (dipakai Web QuickLogModal & fallback).
 */
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
            maxOutputTokens: 2000,
            temperature: 0.1,
            ...modelExtraConfig(model),
          },
        }),
        7000
      );

      const parsed = JSON.parse(response.text.trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return normalizeParsedTransactions(items, text, targetDate, baseTimeKnown, wallets);
    } catch (err) {
      console.warn(`[Diablo AI] Parser ${model} gagal (${err.message})`);
    }
  }
  return fallbackExpenseParser(text, referenceDate, wallets);
}

/**
 * Multimodal Vision: Ekstrak Foto Struk / Bukti Transfer / Screenshot QRIS
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
              text: `${buildSkillsPrompt(caption || "")}\nBaca gambar struk/bukti pembayaran QRIS/mutasi ini. ${caption ? `Catatan tambahan dari Tuan: "${caption}".` : ""} Ekstrak total transaksi atau item-item utamanya ke dalam array JSON.`,
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
        const txType = String(it.type || "expense").toLowerCase() === "income" ? "income" : "expense";
        const item = cleanItemName(it.item) || (txType === "income" ? "Pemasukan" : "Pengeluaran");
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
 * Chat #2: Diablo Financial Advisor (Sopan, Satir, Singkat, To-The-Point, sadar semua dompet & utang/piutang)
 */
export async function askFinancialAdvisor(question, profile, analytics, recentTransactions = []) {
  const ai = getGeminiClient();
  const candidateModels = SMART_MODELS;

  const extractedPrice = parseAmount(question);

  const remaining = analytics?.budget?.remainingBudget ?? 0;
  const days = Math.max(1, analytics?.cycle?.daysRemaining ?? 1);
  const currentDaily = analytics?.budget?.safeDailySpend ?? 0;
  const todaySpent = analytics?.budget?.todaySpent ?? 0;
  const todayRemaining = analytics?.budget?.todayRemaining ?? 0;
  const newDaily = Math.max(0, Math.round((remaining - extractedPrice) / days));

  const topCats = (analytics?.categories || []).slice(0, 3).map((c) => `${c.category}: Rp ${(c.spent || 0).toLocaleString("id-ID")} (${c.percent || 0}%)`);
  const topCatName = (analytics?.categories || [])[0]?.category || "Belanja";
  const topCatSpent = (analytics?.categories || [])[0]?.spent || 0;

  if (!ai) {
    let verdict = "AMAN";
    let reply = "";

    if (extractedPrice > 0) {
      if (extractedPrice > remaining) {
        verdict = "BAHAYA";
        reply = `Maaf Tuan, kalau begini Tuan tidak bisa hidup layak. Harga barang Rp ${extractedPrice.toLocaleString("id-ID")}, sedangkan sisa dana harian Tuan cuma Rp ${remaining.toLocaleString("id-ID")} untuk ${days} hari ke depan.`;
      } else if (extractedPrice > remaining * 0.35 || newDaily < 35000) {
        verdict = "WASPADA";
        reply = `Siap Tuan, tapi kalau beli Rp ${extractedPrice.toLocaleString("id-ID")} ini, jatah harian Tuan anjlok dari Rp ${currentDaily.toLocaleString("id-ID")} ke Rp ${newDaily.toLocaleString("id-ID")}/hari. Yakin rela hidup prihatin ${days} hari demi barang ini, Tuan?`;
      } else {
        verdict = "AMAN";
        reply = `Siap Tuan, masih sangat terkendali. Setelah beli Rp ${extractedPrice.toLocaleString("id-ID")}, jatah harian Tuan masih aman di Rp ${newDaily.toLocaleString("id-ID")}/hari sampai gajian.`;
      }
    } else {
      verdict = analytics?.status === "BAHAYA" ? "BAHAYA" : analytics?.status === "HATI_HATI" ? "WASPADA" : "AMAN";
      reply = `Siap Tuan. Sisa dana harian Rp ${remaining.toLocaleString("id-ID")} (${days} hari ke gajian, jatah Rp ${currentDaily.toLocaleString("id-ID")}/hari). Hari ini Tuan sudah belanja Rp ${todaySpent.toLocaleString("id-ID")}. Pengeluaran terbesar di ${topCatName} sebesar Rp ${topCatSpent.toLocaleString("id-ID")}.`;
    }

    return {
      verdict,
      itemPrice: extractedPrice,
      impactOnDailySpend: newDaily,
      reply,
    };
  }

  const walletsInfo = (profile?.wallets || []).map(
    (w) => `${w.name}: Rp ${(w.balance || 0).toLocaleString("id-ID")} (${w.locked ? "Dana Darurat/Terkunci" : w.role})`
  );
  const openDebts = (profile?.debts || [])
    .filter((d) => d.status !== "paid")
    .map((d) => `${d.type.toUpperCase()} ${d.person}: ${d.amount === null ? "nominal belum jelas" : `Rp ${d.amount.toLocaleString("id-ID")}`}${d.note ? ` (${d.note})` : ""}`);

  const contextData = {
    dompetDanSaldo: walletsInfo.length ? walletsInfo : "Belum diatur",
    sisaDanaHarian: `Rp ${remaining.toLocaleString("id-ID")}`,
    tanggalGajian: profile?.paydayDate || 25,
    sisaHariKeGajian: days,
    jatahHarianSaatIni: `Rp ${currentDaily.toLocaleString("id-ID")}/hari`,
    pengeluaranHariIni: `Rp ${todaySpent.toLocaleString("id-ID")}`,
    pemasukanSiklusIni: `Rp ${(analytics?.budget?.totalIncomeCycle || 0).toLocaleString("id-ID")}`,
    sisaJatahHariIni: `Rp ${todayRemaining.toLocaleString("id-ID")}`,
    estimasiHargaBarangDitanyakan: extractedPrice > 0 ? `Rp ${extractedPrice.toLocaleString("id-ID")}` : "Tidak disebut spesifik",
    jatahHarianJikaJadiBeliDariDanaHarian: extractedPrice > 0 ? `Rp ${newDaily.toLocaleString("id-ID")}/hari` : "-",
    rasioNeedsVsWants: `${analytics?.leakDetector?.needsPercent ?? 100}% Needs vs ${analytics?.leakDetector?.wantsPercent ?? 0}% Wants`,
    topKategoriPengeluaran: topCats.length > 0 ? topCats : "Belum ada pengeluaran signifikan",
    utangDanPiutangTerbuka: openDebts.length ? openDebts : "Tidak ada",
  };

  try {
    const prompt = `Pertanyaan Tuan: "${question}"
Data Keuangan Tuan: ${JSON.stringify(contextData)}
Transaksi Terakhir: ${JSON.stringify(recentTransactions.slice(0, 6).map((t) => `${t.type === "income" ? "[MASUK]" : "[KELUAR]"} ${t.item} Rp${t.amount} (${t.walletName || t.paymentMethod || "-"})`))}

ATURAN WAJIB PERSONA DIABLO:
1. Panggil user "Tuan" (DILARANG menggunakan kata "Anda"). Sebut dirimu "hamba".
2. Karakter: Pelayan setia yang cerdas, sopan, luwes, dan to-the-point (BUKAN robot kaku).
3. DILARANG BERTELE-TELE! Maksimal 2 sampai 3 kalimat padat dan relevan.
4. DILARANG ceramah puitis/filosofis lebay.
5. Ingat: Gotrade adalah Dana Darurat terkunci — jangan sarankan menyentuh Gotrade untuk belanja konsumtif.
6. Jawab langsung inti pertanyaan Tuan secara kontekstual berdasarkan saldo dompet, utang/piutang, dan jatah harian.`;

    for (const model of candidateModels) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction:
                "Kamu adalah Diablo, pelayan finansial setia Tuan. Sopan, cerdas, luwes, to-the-point (maksimal 2-3 kalimat). Panggil user 'Tuan', sebut dirimu 'hamba'.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                required: ["verdict", "reply"],
                properties: {
                  verdict: { type: Type.STRING, enum: ["AMAN", "WASPADA", "BAHAYA"] },
                  itemPrice: { type: Type.INTEGER },
                  impactOnDailySpend: { type: Type.INTEGER },
                  reply: { type: Type.STRING },
                },
              },
              maxOutputTokens: 350,
              temperature: 0.2,
              ...modelExtraConfig(model),
            },
          }),
          7000
        );

        const resObj = JSON.parse(response.text.trim());
        return {
          verdict: resObj.verdict || "AMAN",
          itemPrice: resObj.itemPrice ?? extractedPrice,
          impactOnDailySpend: resObj.impactOnDailySpend ?? newDaily,
          reply: resObj.reply,
        };
      } catch (err) {
        console.warn(`[Diablo Advisor] Model ${model} skipped (${err.message}), trying next or fallback`);
      }
    }

    let fallbackReply = "";
    if (extractedPrice > 0) {
      if (extractedPrice > remaining) {
        fallbackReply = `Tidak aman dari dana harian Tuan. Harga barang Rp ${extractedPrice.toLocaleString("id-ID")}, melebihi sisa dana harian Rp ${remaining.toLocaleString("id-ID")}.`;
      } else {
        fallbackReply = `Aman Tuan. Setelah beli Rp ${extractedPrice.toLocaleString("id-ID")}, jatah harian Tuan tersisa Rp ${newDaily.toLocaleString("id-ID")}/hari (${days} hari ke gajian).`;
      }
    } else {
      fallbackReply = `Siap Tuan. Sisa dana harian Rp ${remaining.toLocaleString("id-ID")} dengan jatah aman Rp ${currentDaily.toLocaleString("id-ID")}/hari (${days} hari ke gajian).`;
    }

    return {
      verdict: extractedPrice > remaining ? "BAHAYA" : extractedPrice > remaining * 0.35 ? "WASPADA" : "AMAN",
      itemPrice: extractedPrice,
      impactOnDailySpend: newDaily,
      reply: fallbackReply,
    };
  } catch (err) {
    console.error("[Diablo Advisor] AI error:", err.message);
    return {
      verdict: "WASPADA",
      itemPrice: extractedPrice,
      impactOnDailySpend: newDaily,
      reply: `Siap Tuan. Sisa dana harian Tuan Rp ${remaining.toLocaleString("id-ID")} dengan jatah aman Rp ${currentDaily.toLocaleString("id-ID")}/hari.`,
    };
  }
}

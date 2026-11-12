import { GoogleGenAI, Type } from "@google/genai";
import { getConfig } from "./bundled-config.js";
import { classifyExpense, hasGiftContext, buildSkillsPrompt } from "./skills.js";
import { toWibParts, fromWib, parseAmount } from "./format.js";

const MODEL_NAME = (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== "gemini-2.5-flash" ? process.env.GEMINI_MODEL : null) || "gemini-3.5-flash-lite";
const PARSER_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash"];

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
      amount: { type: Type.INTEGER },
      item: { type: Type.STRING },
      category: {
        type: Type.STRING,
        enum: ["Makan Pokok", "Jajan & Kopi", "Transport", "Belanja & Barang", "Hiburan & Game", "Tagihan", "Lainnya"],
      },
      intent: { type: Type.STRING, enum: ["NEED", "WANT", "GIFT", "ASSET"] },
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

  // Strip preamble seperti "hadiah buat ultah cewe ada bunga" -> "bunga" jika diikuti nama barang
  s = s.replace(/^(?:(?:hadiah|kado)\s+)?(?:buat|untuk)\s+(?:(?:ultah|ulang\s+tahun|anniv|anniversary)\s+)?(?:cewe|cewek|pacar|doi|istri|suami|ortu|ibu|mama|ayah|bapak)(?:\s+(?:aku|ku|gua|gue))?(?:\s+ada)?\s+(?=\S)/i, "");
  s = s.replace(/^.*?\bada\s+(?=\S)/i, "");

  // Frasa umum waktu makan tanpa lauk spesifik: pertahankan nama makanannya
  if (/^(?:makan\s+)?(?:siang|maksi)$/i.test(s)) return "makan siang";
  if (/^(?:makan\s+)?(?:malem|malam)$/i.test(s)) return "makan malam";
  if (/^(?:makan\s+)?(?:pagi|sarapan)$/i.test(s)) return "makan pagi";
  if (/^(?:makan\s+)?(?:sore)$/i.test(s)) return "makan sore";

  // Strip leading filler words, pronouns, connectors, and transaction verbs iteratively
  const stripRegex = /^(?:oiya|o\s*iya|oya|eh|tuh|nih|trs|terus|juga|dan|sama|ama|plus|tambah|lalu|tadi|barusan|baru\s+aja|aku|gue|gua|saya|kita|kami|beliin|beli|belanja|bayar|pesen|pesan|order|ngopi|jajan|jam|pukul)\s+/i;
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.trim().replace(stripRegex, "").trim();
  }

  // Jika ada lauk/makanan spesifik setelah "makan siang/malem/malam/pagi/sore", buang awalan makannya
  // Contoh: "makan siang briyani" -> "briyani", "makan nasi padang" -> "nasi padang"
  const mealPrefixMatch = s.match(/^makan(?:\s+(?:siang|malem|malam|pagi|sore))?\s+(\S+.*)$/i);
  if (mealPrefixMatch) {
    s = mealPrefixMatch[1].trim();
  } else if (/^makan\s*$/i.test(s)) {
    return "makan";
  }

  // Bersihkan keterangan waktu / filler yang menempel di belakang item (misal "kopi pagi" -> "kopi", "dimsum barusan beli" -> "dimsum")
  s = s.replace(/\s+(?:pagi|siang|sore|malem|malam|subuh|tadi|barusan(?:\s+beli)?|baru\s+aja(?:\s+beli)?)$/gi, "");
  s = s.replace(/\s+(?:aja|itu|dong|nih|deh|ya|tuh)$/gi, "");

  s = cleanPunctuation(s);

  // Safety net: jika tersisa cuma kata waktu makan, jangan biarkan jadi cuma 'siang'/'malem'
  if (/^(?:siang|maksi)$/i.test(s)) return "makan siang";
  if (/^(?:malem|malam)$/i.test(s)) return "makan malam";
  if (/^(?:pagi|sarapan)$/i.test(s)) return "makan pagi";
  if (/^(?:sore)$/i.test(s)) return "makan sore";

  return s || "Pengeluaran";
}

export function hasTimeHint(text) {
  const lower = String(text || "").toLowerCase();
  return (
    /(?:jam|pukul)\s*\d{1,2}/i.test(lower) ||
    /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(lower) ||
    /\b(?:[01]?\d|2[0-3])\.(?:[0-5]\d)\s*(?:wib|wita|wit)\b/i.test(lower) ||
    /\b(?:malem|malam|semalam|semalem|sore|siang|pagi|sarapan|subuh)\b/i.test(lower)
  );
}

function resolveTimeWib(text, defaultHour, defaultMinute) {
  const lower = text.toLowerCase();
  const timeMatch =
    lower.match(/(?:jam|pukul)\s*(\d{1,2})(?:[.:](\d{2}))?(?:\s*(pagi|siang|sore|malem|malam|subuh))?/i) ||
    lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?:\s*(pagi|siang|sore|malem|malam|subuh|wib|wita|wit))?\b/i) ||
    lower.match(/\b([01]?\d|2[0-3])\.([0-5]\d)\s*(?:wib|wita|wit)\b/i);
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

export function parseNaturalDate(text, ref = new Date()) {
  const lower = text.toLowerCase();
  const refWib = toWibParts(ref);
  let { year, month, date } = refWib;
  let matchedText = null;

  // 1. Tanggal spesifik (misal: "tanggal 11 kemarin", "tgl 1", "tgl 28")
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
    // 2. Kemarin lusa / 2 hari lalu
    date -= 2;
    matchedText = "kemarin lusa";
  } else if (/(\d+)\s*hari\s*(?:yang\s*)?lalu/i.test(lower)) {
    // 3. N hari lalu
    const nDaysMatch = lower.match(/(\d+)\s*hari\s*(?:yang\s*)?lalu/i);
    date -= parseInt(nDaysMatch[1], 10);
    matchedText = nDaysMatch[0];
  } else if (/(?:(?:kemarin|kemaren|pada)\s+)?(?:hari\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(?:\s+(?:kemarin|kemaren|lalu))?/i.test(lower)) {
    // 4. Hari dalam seminggu (misal: "kemarin hari selasa", "hari minggu", "rabu lalu")
    const dayMap = { minggu: 0, ahad: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6 };
    const dayMatch = lower.match(/(?:(?:kemarin|kemaren|pada)\s+)?(?:hari\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(?:\s+(?:kemarin|kemaren|lalu))?/i);
    const targetDay = dayMap[dayMatch[1].toLowerCase()];
    let diff = refWib.day - targetDay;
    if (diff <= 0) diff += 7;
    date -= diff;
    matchedText = dayMatch[0].trim();
  } else if (/\b(?:kemarin|kemaren|semalam|semalem|tadi\s+malem|tadi\s+malam)\b/i.test(lower)) {
    // 5. Kemarin / semalam / tadi malam
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
  const explicitTime = hasTimeHint(text);
  // Untuk tanggal lampau/lain tanpa keterangan jam, jangan copy jam kirim chat hari ini: pakai 12:00 WIB netral + timeKnown=false
  const timeKnown = explicitTime || !isDifferentDay;
  const { hour, minute } = timeKnown
    ? resolveTimeWib(text, refWib.hour, refWib.minute)
    : { hour: 12, minute: 0 };

  return { date: fromWib(year, month, date, hour, minute), matchedText, timeKnown };
}

function findClauseHint(text, item) {
  const name = String(item || "").toLowerCase().trim();
  if (!name) return "";
  const clauses = String(text || "").split(/[\n,;]+|\b(?:terus|trs|lalu|kemudian)\b/i);
  return clauses.find((c) => c.toLowerCase().includes(name)) || "";
}

/** Metode bayar hanya dari yang disebut user di pesan; default QRIS. */
function detectPaymentMethod(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(?:cash|tunai)\b/.test(lower)) return "Cash";
  if (/\b(?:transfer|tf|bca|mandiri|bni|bri)\b/.test(lower)) return "Transfer";
  if (/\b(?:paylater|spaylater|kartu kredit|cc)\b/.test(lower)) return "Paylater/CC";
  return "QRIS";
}

function parseSingleExpense(chunk, amount, baseDate = new Date(), contextHint = {}) {
  let itemDate = baseDate;
  let timeKnown = contextHint.timeKnown !== false;
  if (hasTimeHint(chunk)) {
    const baseWib = toWibParts(baseDate);
    const { hour, minute } = resolveTimeWib(chunk, baseWib.hour, baseWib.minute);
    itemDate = fromWib(baseWib.year, baseWib.month, baseWib.date, hour, minute);
    timeKnown = true;
  }

  const chunkNoAmount = chunk
    .replace(/(?:rp\.?\s*)?\b\d{1,3}(?:[.,]\d{3})+\b/gi, "")
    .replace(/(?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(k|rb|ribu|jt|juta)?/gi, "")
    .replace(/[-*•]/g, " ")
    .replace(/\b(aku|hari|ini|udah|itu|aja|lagi|dan|lalu|terus|sama|juga)\b/gi, "")
    .replace(/\b(qris|gopay|ovo|shopeepay|dana|bca|mandiri|transfer|cash|tunai|spaylater|paylater)\b/gi, "");

  let item = cleanItemName(chunkNoAmount);
  if (!item) item = "Pengeluaran";

  const { category, intent } = classifyExpense(item, { isGift: contextHint.isGift });
  const ownPayment = detectPaymentMethod(chunk);
  const paymentMethod = ownPayment !== "QRIS" ? ownPayment : contextHint.payment || "QRIS";

  return {
    amount,
    item,
    category,
    intent,
    paymentMethod,
    createdAt: itemDate.toISOString(),
    timeKnown,
    notes: chunk.trim(),
  };
}

/**
 * Fallback regex parser jika GEMINI_API_KEY bermasalah
 */
function fallbackExpenseParser(text, referenceDate = new Date()) {
  const { date: targetDate, timeKnown: baseTimeKnown } = parseNaturalDate(text, referenceDate);
  const maskedText = text
    .replace(/(?:tanggal|tgl)\s*\d{1,2}/gi, (m) => " ".repeat(m.length))
    .replace(/(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?/gi, (m) => " ".repeat(m.length))
    .replace(/\b\d+\s*hari\s*(?:yang\s*)?lalu/gi, (m) => " ".repeat(m.length))
    .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, (m) => " ".repeat(m.length))
    .replace(/\b(?:[01]?\d|2[0-3])\.(?:[0-5]\d)\s*(?:wib|wita|wit)\b/gi, (m) => " ".repeat(m.length));

  const isGift = hasGiftContext(text);
  const payment = detectPaymentMethod(text);

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

  if (matches.length === 0) {
    return [];
  }

  const results = [];
  let prevEnd = 0;
  for (let i = 0; i < matches.length; i++) {
    const chunk = text.slice(prevEnd, matches[i].end);
    prevEnd = matches[i].end;
    results.push(parseSingleExpense(chunk, matches[i].amount, targetDate, { isGift, payment, timeKnown: baseTimeKnown }));
  }

  return results;
}

function withTimeout(promise, ms = 4500) {
  let timeoutId;
  const timer = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("AI_TIMEOUT")), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeoutId));
}

const PARSER_SYSTEM_PROMPT =
  "Kamu adalah Diablo Expense Parser. Ekstrak seluruh pengeluaran dari pesan ke JSON. k/rb = ribuan, jt = jutaan. " +
  "Jika item menyebut waktu/jam spesifik (pagi, siang, sore, malem, subuh, jam 8, 19:30), tulis di timeHint; jika tidak ada biarkan string kosong. " +
  "Intent: NEED (makan pokok, transport kerja, tagihan wajib), WANT (kopi, jajan, rokok, nongkrong, belanja impulsif), " +
  "GIFT (hadiah/traktir untuk pasangan atau orang lain), ASSET (barang tahan lama: gadget, alat kerja, pakaian esensial, perabot).";

/**
 * Chat #1: Parsing pesan teks laporan pengeluaran.
 * AI mem-parse dengan referensi dari lib/skills/expense-skills.md; hasilnya lalu dikoreksi
 * lagi oleh kamus supaya kategori/intent konsisten walau AI melenceng.
 */
export async function parseExpenseMessage(text, referenceDate = new Date()) {
  const { date: targetDate, timeKnown: baseTimeKnown } = parseNaturalDate(text, referenceDate);
  const ai = getGeminiClient();
  if (!ai) return fallbackExpenseParser(text, referenceDate);

  const isGift = hasGiftContext(text);
  const paymentMethod = detectPaymentMethod(text);
  const contents =
    `${buildSkillsPrompt(text)}\n\nEkstrak seluruh item pengeluaran dari pesan berikut menjadi array JSON:\n"""\n${text}\n"""`;

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
          },
        }),
        3500
      );

      const parsed = JSON.parse(response.text.trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items.map((it) => {
        const item = cleanItemName(it.item) || "Pengeluaran";
        const known = classifyExpense(item, { isGift });
        const giftFallback = !known.matched && isGift && it.intent === "WANT";

        let itemDate = targetDate;
        let timeKnown = baseTimeKnown;
        const clause = findClauseHint(text, item);
        const rawHint = [it.timeHint, it.item, it.notes, clause].filter(Boolean).join(" ");
        if (hasTimeHint(rawHint)) {
          const baseWib = toWibParts(targetDate);
          const { hour, minute } = resolveTimeWib(rawHint, baseWib.hour, baseWib.minute);
          itemDate = fromWib(baseWib.year, baseWib.month, baseWib.date, hour, minute);
          timeKnown = true;
        }

        return {
          ...it,
          item,
          category: known.matched ? known.category : giftFallback ? "Belanja & Barang" : it.category,
          intent: known.matched ? known.intent : giftFallback ? "GIFT" : it.intent,
          paymentMethod,
          createdAt: itemDate.toISOString(),
          timeKnown,
        };
      });
    } catch (err) {
      console.warn(`[Diablo AI] Parser ${model} gagal (${err.message})`);
    }
  }
  return fallbackExpenseParser(text, referenceDate);
}

/**
 * Multimodal Vision: Ekstrak Foto Struk / Bukti Transfer / Screenshot QRIS
 */
export async function parseReceiptImage(base64Data, mimeType = "image/jpeg", caption = "") {
  const ai = getGeminiClient();
  const { date: targetDate, timeKnown } = parseNaturalDate(caption || "");
  const isGift = hasGiftContext(caption || "");

  if (!ai) {
    if (caption) return fallbackExpenseParser(caption);
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
        6000
      );

      const parsed = JSON.parse(response.text.trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items.map((it) => {
        const item = cleanItemName(it.item) || "Pengeluaran";
        const known = classifyExpense(item, { isGift });
        const giftFallback = !known.matched && isGift && it.intent === "WANT";
        return {
          ...it,
          item,
          category: known.matched ? known.category : giftFallback ? "Belanja & Barang" : it.category,
          intent: known.matched ? known.intent : giftFallback ? "GIFT" : it.intent,
          createdAt: targetDate.toISOString(),
          timeKnown,
        };
      });
    } catch (err) {
      console.warn(`[Diablo Receipt] Model ${model} gagal (${err.message})`);
    }
  }
  if (caption) return fallbackExpenseParser(caption);
  throw new Error("Gagal membaca struk saat ini, silakan ketik manual nominalnya Tuan.");
}

/**
 * Chat #2: Diablo Financial Advisor (Sopan, Satir, Singkat, To-The-Point)
 */
export async function askFinancialAdvisor(question, profile, analytics, recentTransactions = []) {
  const ai = getGeminiClient();
  const candidateModels = PARSER_MODELS;

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
        reply = `Maaf Tuan, kalau begini Tuan tidak bisa hidup layak. Harga barang Rp ${extractedPrice.toLocaleString("id-ID")}, sedangkan sisa uang Tuan cuma Rp ${remaining.toLocaleString("id-ID")} untuk ${days} hari ke depan.`;
      } else if (extractedPrice > remaining * 0.35 || newDaily < 35000) {
        verdict = "WASPADA";
        reply = `Siap Tuan, tapi kalau beli Rp ${extractedPrice.toLocaleString("id-ID")} ini, jatah harian Tuan anjlok dari Rp ${currentDaily.toLocaleString("id-ID")} ke Rp ${newDaily.toLocaleString("id-ID")}/hari. Yakin rela hidup prihatin ${days} hari demi barang ini, Tuan?`;
      } else {
        verdict = "AMAN";
        reply = `Siap Tuan, masih sangat terkendali. Setelah beli Rp ${extractedPrice.toLocaleString("id-ID")}, jatah harian Tuan masih aman di Rp ${newDaily.toLocaleString("id-ID")}/hari sampai gajian.`;
      }
    } else {
      verdict = analytics?.status === "BAHAYA" ? "BAHAYA" : analytics?.status === "HATI_HATI" ? "WASPADA" : "AMAN";
      reply = `Siap Tuan. Sisa budget Rp ${remaining.toLocaleString("id-ID")} (${days} hari ke gajian, jatah Rp ${currentDaily.toLocaleString("id-ID")}/hari). Hari ini Tuan sudah belanja Rp ${todaySpent.toLocaleString("id-ID")}. Pengeluaran terbesar di ${topCatName} sebesar Rp ${topCatSpent.toLocaleString("id-ID")}.`;
    }

    return {
      verdict,
      itemPrice: extractedPrice,
      impactOnDailySpend: newDaily,
      reply,
    };
  }

  const contextData = {
    gajiBulanan: `Rp ${(profile?.monthlyIncome || 0).toLocaleString("id-ID")}`,
    tanggalGajian: profile?.paydayDate || 25,
    biayaTetap: (profile?.fixedCosts || []).map((f) => `${f.name}: Rp ${(f.amount || 0).toLocaleString("id-ID")}`).join(", ") || "Tidak ada",
    sisaHariKeGajian: days,
    sisaBudgetBulanIni: `Rp ${remaining.toLocaleString("id-ID")}`,
    jatahHarianSaatIni: `Rp ${currentDaily.toLocaleString("id-ID")}/hari`,
    pengeluaranHariIni: `Rp ${todaySpent.toLocaleString("id-ID")}`,
    sisaJatahHariIni: `Rp ${todayRemaining.toLocaleString("id-ID")}`,
    estimasiHargaBarangDitanyakan: extractedPrice > 0 ? `Rp ${extractedPrice.toLocaleString("id-ID")}` : "Tidak disebut spesifik",
    jatahHarianJikaJadiBeli: extractedPrice > 0 ? `Rp ${newDaily.toLocaleString("id-ID")}/hari` : "-",
    rasioNeedsVsWants: `${analytics?.leakDetector?.needsPercent ?? 100}% Needs vs ${analytics?.leakDetector?.wantsPercent ?? 0}% Wants`,
    topKategoriPengeluaran: topCats.length > 0 ? topCats : "Belum ada pengeluaran signifikan",
    posTabungan: (profile?.savingsPots || []).map((p) => `${p.name}: terkumpul Rp ${(p.saved || 0).toLocaleString("id-ID")} / Rp ${(p.target || 0).toLocaleString("id-ID")}`),
    modeNada: profile?.advisorTone || "ROAST",
  };

  try {
    const prompt = `Pertanyaan Tuan: "${question}"
Data Keuangan Tuan: ${JSON.stringify(contextData)}
Transaksi Terakhir: ${JSON.stringify(recentTransactions.slice(0, 5).map((t) => `${t.item} Rp${t.amount} (${t.intent || "WANT"})`))}

ATURAN WAJIB PERSONA DIABLO:
1. Panggil user "Tuan" (DILARANG menggunakan kata "Anda"). Sebut dirimu "hamba".
2. Karakter: Pelayan setia yang cerdas, sopan, luwes, dan to-the-point (BUKAN robot kaku).
3. DILARANG BERTELE-TELE! Maksimal 1 sampai 2 kalimat saja.
4. DILARANG ceramah puitis/filosofis lebay (seperti "menghapus jejak masa lalu", "realita tetaplah kejam", dll).
5. Jawab langsung inti pertanyaan Tuan secara kontekstual:
   - Jika tanya kelayakan beli ("aman ga?"): Langsung sebut aman/tidak dan dampaknya ke jatah harian secara ringkas.
   - Jika tanya hal lain: Jawab solutif dan santun tanpa mengulang-ulang angka budget jika tidak ditanyakan.`;

    for (const model of candidateModels) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction:
                "Kamu adalah Diablo, pelayan setia Tuan. Sopan, cerdas, luwes (bukan robot kaku), dan to-the-point (maksimal 1-2 kalimat). Panggil user 'Tuan' (jangan 'Anda'), sebut dirimu 'hamba'. DILARANG ceramah puitis lebay.",
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
              maxOutputTokens: 250,
              temperature: 0.2,
            },
          }),
          3500
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
        fallbackReply = `Tidak aman Tuan. Harga barang Rp ${extractedPrice.toLocaleString("id-ID")}, melebihi sisa budget Rp ${remaining.toLocaleString("id-ID")}.`;
      } else {
        fallbackReply = `Aman Tuan. Setelah beli Rp ${extractedPrice.toLocaleString("id-ID")}, jatah harian Tuan tersisa Rp ${newDaily.toLocaleString("id-ID")}/hari (${days} hari ke gajian).`;
      }
    } else {
      fallbackReply = `Siap Tuan. Sisa budget Rp ${remaining.toLocaleString("id-ID")} dengan jatah aman Rp ${currentDaily.toLocaleString("id-ID")}/hari (${days} hari ke gajian).`;
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
      reply: `Siap Tuan. Sisa budget Tuan Rp ${remaining.toLocaleString("id-ID")} dengan jatah aman Rp ${currentDaily.toLocaleString("id-ID")}/hari.`,
    };
  }
}

import { GoogleGenAI, Type } from "@google/genai";
import { getConfig } from "./bundled-config.js";

const MODEL_NAME = (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== "gemini-2.5-flash" ? process.env.GEMINI_MODEL : null) || "gemini-3.5-flash-lite";

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
      notes: { type: Type.STRING },
    },
  },
};

export function cleanPunctuation(str) {
  return String(str || "")
    .replace(/^[\s,.:;•\-_/]+|[\s,.:;•\-_/]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanItemName(str) {
  let s = String(str || "Pengeluaran")
    .replace(/^[\s,.:;•\-_/]+|[\s,.:;•\-_/]+$/g, "")
    .trim();

  // Strip time references anywhere
  s = s.replace(/\b(?:kemarin\s+malem|kemaren\s+malem|tadi\s+malem|kemarin\s+siang|kemaren\s+siang|kemarin\s+pagi|kemaren\s+pagi|kemarin\s+sore|kemaren\s+sore)\b/gi, " ");
  s = s.replace(/\b(?:kemarin|kemaren|tadi|semalam|semalem|hari\s+ini|malem\s+ini|siang\s+ini|pagi\s+ini|sore\s+ini)\b/gi, " ");
  s = s.replace(/\b(?:buat\s+makan|buat\s+ngemil|buat\s+jajan|buat\s+sarapan)\b/gi, " ");

  // Strip leading filler words, pronouns, and transaction verbs iteratively
  const stripRegex = /^(?:oiya|o\s*iya|oya|eh|trs|terus|juga|dan|lalu|aku|gue|gua|saya|kita|kami|beliin|beli|belanja|bayar|pesen|order|ngopi|jajan|makan|malem|malam|siang|pagi|sore|subuh)\s+/i;
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.trim().replace(stripRegex, "").trim();
  }

  // Clean trailing filler words
  s = s.replace(/\s+(?:aja|itu|dong|nih|deh|ya|tuh)$/gi, "");

  // Clean extra spaces & punctuation again
  s = s.replace(/^[\s,.:;•\-_/]+|[\s,.:;•\-_/]+$/g, "").replace(/\s+/g, " ").trim();
  return s || "Pengeluaran";
}

function applyTimeOfDay(targetDate, text) {
  const lower = text.toLowerCase();
  const d = new Date(targetDate);

  // Check specific time: 'jam 8 malem', 'jam 20', 'jam 14.30'
  const timeMatch = lower.match(/(?:jam|pukul)\s*(\d{1,2})(?:[.:](\d{2}))?(?:\s*(pagi|siang|sore|malem|malam))?/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const period = (timeMatch[3] || "").toLowerCase();
    if ((period === "malem" || period === "malam") && hour < 12) hour += 12;
    if (period === "sore" && hour < 12 && hour < 7) hour += 12;
    if (period === "siang" && hour < 11) hour += 12;
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  // Broad time of day
  if (/\b(?:malem|malam|semalam|semalem)\b/i.test(lower)) {
    d.setHours(20, 30, 0, 0); // 20:30 WIB
  } else if (/\b(?:sore)\b/i.test(lower)) {
    d.setHours(16, 30, 0, 0); // 16:30 WIB
  } else if (/\b(?:siang)\b/i.test(lower)) {
    d.setHours(12, 30, 0, 0); // 12:30 WIB
  } else if (/\b(?:pagi|sarapan)\b/i.test(lower)) {
    d.setHours(8, 30, 0, 0);  // 08:30 WIB
  } else if (/\b(?:subuh)\b/i.test(lower)) {
    d.setHours(4, 30, 0, 0);  // 04:30 WIB
  }
  return d;
}

export function parseNaturalDate(text, ref = new Date()) {
  const lower = text.toLowerCase();
  const date = ref.getDate();

  // 1. Tanggal spesifik (misal: "tanggal 11 kemarin", "tgl 11 kemaren", "tgl 28")
  const dateMatch = lower.match(/(?:tanggal|tgl)\s*(\d{1,2})(?:\s*(?:kemarin|kemaren|lalu))?/i);
  if (dateMatch) {
    const targetDateNum = parseInt(dateMatch[1], 10);
    if (targetDateNum >= 1 && targetDateNum <= 31) {
      const d = new Date(ref);
      const isPastMonth =
        targetDateNum > date ||
        dateMatch[0].includes("kemarin") ||
        dateMatch[0].includes("kemaren") ||
        dateMatch[0].includes("lalu");

      if (isPastMonth) {
        d.setMonth(d.getMonth() - 1);
      }
      d.setDate(targetDateNum);
      return { date: applyTimeOfDay(d, text), matchedText: dateMatch[0].trim() };
    }
  }

  // 2. Kemarin lusa / 2 hari lalu
  if (
    lower.includes("kemarin lusa") ||
    lower.includes("kemaren lusa") ||
    lower.includes("2 hari lalu") ||
    lower.includes("2 hari yang lalu")
  ) {
    const d = new Date(ref);
    d.setDate(d.getDate() - 2);
    return { date: applyTimeOfDay(d, text), matchedText: "kemarin lusa" };
  }

  // 3. N hari lalu
  const nDaysMatch = lower.match(/(\d+)\s*hari\s*(?:yang\s*)?lalu/i);
  if (nDaysMatch) {
    const n = parseInt(nDaysMatch[1], 10);
    const d = new Date(ref);
    d.setDate(d.getDate() - n);
    return { date: applyTimeOfDay(d, text), matchedText: nDaysMatch[0] };
  }

  // 4. Hari dalam seminggu (misal: "kemarin hari selasa", "selasa kemarin", "hari rabu", "rabu lalu")
  const dayMap = {
    minggu: 0,
    ahad: 0,
    senin: 1,
    selasa: 2,
    rabu: 3,
    kamis: 4,
    jumat: 5,
    "jum'at": 5,
    sabtu: 6,
  };

  const dayRegex = /(?:(?:kemarin|kemaren|pada)\s+)?(?:hari\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(?:\s+(?:kemarin|kemaren|lalu))?/i;
  const dayMatch = lower.match(dayRegex);
  if (dayMatch && dayMatch[1]) {
    const targetDay = dayMap[dayMatch[1].toLowerCase()];
    if (targetDay !== undefined) {
      const currentDay = ref.getDay();
      let diff = currentDay - targetDay;
      if (diff <= 0) diff += 7; // Mundur ke hari tersebut di masa lalu
      const d = new Date(ref);
      d.setDate(d.getDate() - diff);
      return { date: applyTimeOfDay(d, text), matchedText: dayMatch[0].trim() };
    }
  }

  // 5. Kemarin / semalam biasa
  if (/\b(?:kemarin|kemaren|semalam)\b/i.test(lower)) {
    const d = new Date(ref);
    d.setDate(d.getDate() - 1);
    return { date: applyTimeOfDay(d, text), matchedText: "kemarin" };
  }

  return { date: applyTimeOfDay(ref, text), matchedText: null };
}

export function cleanDateFromItem(itemText) {
  return itemText
    .replace(/(?:tanggal|tgl)\s*\d{1,2}(?:\s*(?:kemarin|kemaren|lalu))?/gi, "")
    .replace(/(?:kemarin\s+lusa|kemaren\s+lusa|\d+\s*hari\s*(?:yang\s*)?lalu)/gi, "")
    .replace(/(?:(?:kemarin|kemaren|pada)\s+)?(?:hari\s+)?(?:senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(?:\s+(?:kemarin|kemaren|lalu))?/gi, "")
    .replace(/\b(?:kemarin\s+malem|kemaren\s+malem|kemarin\s+siang|kemaren\s+siang|kemarin\s+pagi|kemaren\s+pagi|tadi\s+malem|semalam|semalem|kemarin|kemaren)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSingleExpense(chunk, amount, targetDate = new Date(), contextHint = {}) {
  const withoutDate = cleanDateFromItem(chunk);
  let item = cleanItemName(
    withoutDate
      .replace(/(?:rp\.?\s*)?\b\d{1,3}(?:[.,]\d{3})+\b/gi, "")
      .replace(/(?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(k|rb|ribu|jt|juta)?/gi, "")
      .replace(/[-*•]/g, " ")
      .replace(/\b(aku|hari|ini|udah|itu|aja|tadi|lagi|dan|lalu|terus|sama|juga)\b/gi, "")
      .replace(/\b(qris|gopay|ovo|shopeepay|dana|bca|mandiri|transfer|cash|tunai|spaylater|paylater)\b/gi, "")
  );

  if (!item) item = "Pengeluaran";

  const lower = chunk.toLowerCase();
  let category = "Lainnya";
  let intent = contextHint.isGift ? "GIFT" : "WANT";

  if (
    lower.includes("hadiah") ||
    lower.includes("kado") ||
    lower.includes("cewe") ||
    lower.includes("cewek") ||
    lower.includes("pacar") ||
    lower.includes("ultah") ||
    lower.includes("bunga") ||
    lower.includes("anniv") ||
    lower.includes("hampers") ||
    lower.includes("traktir")
  ) {
    category = "Belanja & Barang";
    intent = "GIFT";
  } else if (
    lower.includes("beli barang") ||
    lower.includes("gadget") ||
    lower.includes("keyboard") ||
    lower.includes("mouse") ||
    lower.includes("laptop") ||
    lower.includes("hp") ||
    lower.includes("monitor") ||
    lower.includes("sepatu") ||
    lower.includes("jaket") ||
    lower.includes("meja") ||
    lower.includes("kursi") ||
    lower.includes("alat")
  ) {
    category = "Belanja & Barang";
    intent = "ASSET";
  } else if (
    lower.includes("kopi") ||
    lower.includes("boba") ||
    lower.includes("snack") ||
    lower.includes("jajan") ||
    lower.includes("starbucks") ||
    lower.includes("mixue") ||
    lower.includes("es ") ||
    lower.includes("rokok")
  ) {
    category = "Jajan & Kopi";
    intent = contextHint.isGift ? "GIFT" : "WANT";
  } else if (
    lower.includes("makan") ||
    lower.includes("nasi") ||
    lower.includes("ayam") ||
    lower.includes("sayur") ||
    lower.includes("warteg") ||
    lower.includes("sarapan") ||
    lower.includes("bakmi") ||
    lower.includes("soto") ||
    lower.includes("penyetan") ||
    lower.includes("briyani") ||
    lower.includes("sushi")
  ) {
    category = "Makan Pokok";
    intent = "NEED";
  } else if (
    lower.includes("bensin") ||
    lower.includes("pertamax") ||
    lower.includes("pertalite") ||
    lower.includes("gojek") ||
    lower.includes("grab") ||
    lower.includes("toll") ||
    lower.includes("parkir") ||
    lower.includes("kereta")
  ) {
    category = "Transport";
    intent = "NEED";
  } else if (
    lower.includes("listrik") ||
    lower.includes("wifi") ||
    lower.includes("kos") ||
    lower.includes("pulsa") ||
    lower.includes("air") ||
    lower.includes("bpjs")
  ) {
    category = "Tagihan";
    intent = "NEED";
  } else if (
    lower.includes("game") ||
    lower.includes("skin") ||
    lower.includes("bioskop") ||
    lower.includes("steam") ||
    lower.includes("roblox") ||
    lower.includes("topup")
  ) {
    category = "Hiburan & Game";
    intent = "WANT";
  } else if (
    lower.includes("baju") ||
    lower.includes("kaos") ||
    lower.includes("tokped") ||
    lower.includes("shopee") ||
    lower.includes("beli")
  ) {
    category = "Belanja & Barang";
    intent = contextHint.isGift ? "GIFT" : "WANT";
  }

  let paymentMethod = "QRIS";
  if (lower.includes("cash") || lower.includes("tunai")) paymentMethod = "Cash";
  else if (lower.includes("transfer") || lower.includes("bca") || lower.includes("mandiri")) paymentMethod = "Transfer";
  else if (lower.includes("paylater") || lower.includes("spaylater") || lower.includes("kartu kredit") || lower.includes("cc")) paymentMethod = "Paylater/CC";

  return {
    amount,
    item,
    category,
    intent,
    paymentMethod,
    createdAt: targetDate.toISOString(),
    notes: chunk.trim(),
  };
}

/**
 * Fallback regex parser jika GEMINI_API_KEY bermasalah
 */
function fallbackExpenseParser(text) {
  const { date: targetDate, matchedText } = parseNaturalDate(text);
  let cleanText = text;
  if (matchedText) {
    cleanText = text.replace(matchedText, " ");
  }

  const overallLower = cleanText.toLowerCase();
  const isGift =
    overallLower.includes("hadiah") ||
    overallLower.includes("kado") ||
    overallLower.includes("cewe") ||
    overallLower.includes("cewek") ||
    overallLower.includes("pacar") ||
    overallLower.includes("ultah");

  const regex = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)\b|(?:rp\.?\s*)(\d{1,3}(?:[.,]\d{3})+|\d+)|\b(\d{1,3}(?:[.,]\d{3})+)\b|\b(\d{4,9})\b/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(cleanText)) !== null) {
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
    const chunk = cleanText.slice(prevEnd, matches[i].end);
    prevEnd = matches[i].end;
    results.push(parseSingleExpense(chunk, matches[i].amount, targetDate, { isGift }));
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

/**
 * Chat #1: Parsing pesan teks laporan pengeluaran
 */
export async function parseExpenseMessage(text, referenceDate = new Date()) {
  const { date: targetDate } = parseNaturalDate(text, referenceDate);
  const ai = getGeminiClient();
  if (!ai) return fallbackExpenseParser(text);

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: `Ekstrak seluruh item pengeluaran dari teks berikut menjadi array JSON:\n"""\n${text}\n"""`,
        config: {
          systemInstruction:
            "Kamu adalah Diablo Expense Parser. Ekstrak pengeluaran ke JSON. k/rb = ribuan, jt = jutaan. Nama item HARUS HANYA nama inti barang/makanan/jasa yang dibeli (contoh: 'rokok', 'kopi', 'sushi', 'penyetan', 'bunga', 'briyani'). DILARANG mencantumkan kata kerja transaksi ('beli', 'beliin', 'belanja', 'bayar', 'pesan'), kata penunjuk waktu ('kemarin', 'malem', 'siang', 'tadi', 'hari ini'), atau kata sapaan/filler ('oiya', 'aku', 'juga', 'buat makan'). Klasifikasikan intent secara akurat: NEED (makan pokok, transport kerja, tagihan wajib), WANT (kopi, jajan santai, nongkrong, belanja impulsif, rokok), GIFT (hadiah, kado, traktir cewek/pasangan, bunga, kue ultah pacar, hampers, sosial), ASSET (beli barang tahan lama, gadget, alat kerja, pakaian esensial, perabot).",
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
    return items.map((it) => ({
      ...it,
      item: cleanItemName(it.item) || "Pengeluaran",
      createdAt: targetDate.toISOString(),
    }));
  } catch (err) {
    console.warn(`[Diablo AI] Fast-falling back to regex parser (${err.message})`);
    return fallbackExpenseParser(text);
  }
}

/**
 * Multimodal Vision: Ekstrak Foto Struk / Bukti Transfer / Screenshot QRIS
 */
export async function parseReceiptImage(base64Data, mimeType = "image/jpeg", caption = "") {
  const ai = getGeminiClient();
  const modelName = MODEL_NAME;

  if (!ai) {
    if (caption) return fallbackExpenseParser(caption);
    throw new Error("GEMINI_API_KEY wajib diisi untuk membaca foto struk/QRIS.");
  }

  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        inlineData: {
          data: cleanBase64,
          mimeType,
        },
      },
      {
        text: `Baca gambar struk/bukti pembayaran QRIS/mutasi ini. ${caption ? `Catatan tambahan dari Tuan: "${caption}".` : ""} Ekstrak total transaksi atau item-item utamanya ke dalam array JSON.`,
      },
    ],
    config: {
      systemInstruction:
        "Kamu adalah Diablo Receipt OCR. Ekstrak nama merchant/item, nominal akhir (amount dalam Rupiah bulat), kategori, intent (NEED vs WANT), dan metode bayar dari gambar struk atau bukti QRIS.",
      responseMimeType: "application/json",
      responseSchema: EXPENSE_SCHEMA,
      maxOutputTokens: 1500,
      temperature: 0.1,
    },
  });

  const parsed = JSON.parse(response.text.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Chat #2: Diablo Financial Advisor (Sopan, Satir, Singkat, To-The-Point)
 */
export async function askFinancialAdvisor(question, profile, analytics, recentTransactions = []) {
  const ai = getGeminiClient();
  const candidateModels = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

  const priceMatch = question.match(/(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?/i);
  let extractedPrice = 0;
  if (priceMatch) {
    const rawNum = parseFloat(priceMatch[1].replace(",", "."));
    const unit = (priceMatch[2] || "").toLowerCase();
    if (unit === "k" || unit === "rb" || unit === "ribu") extractedPrice = Math.round(rawNum * 1000);
    else if (unit === "jt" || unit === "juta") extractedPrice = Math.round(rawNum * 1000000);
    else if (rawNum < 1000) extractedPrice = Math.round(rawNum * 1000);
    else extractedPrice = Math.round(rawNum);
  }

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

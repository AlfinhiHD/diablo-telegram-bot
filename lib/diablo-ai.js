import { GoogleGenAI, Type } from "@google/genai";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
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
      intent: { type: Type.STRING, enum: ["NEED", "WANT"] },
      paymentMethod: { type: Type.STRING },
      notes: { type: Type.STRING },
    },
  },
};

/**
 * Fallback regex parser jika GEMINI_API_KEY belum diisi
 */
function fallbackExpenseParser(text) {
  const lines = text.split(/\r?\n|,|;/).map((l) => l.trim()).filter(Boolean);
  const results = [];

  for (const line of lines) {
    const priceMatch = line.match(/(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?/i);
    let amount = 0;
    if (priceMatch) {
      const rawNum = parseFloat(priceMatch[1].replace(",", "."));
      const unit = (priceMatch[2] || "").toLowerCase();
      if (unit === "k" || unit === "rb" || unit === "ribu") amount = Math.round(rawNum * 1000);
      else if (unit === "jt" || unit === "juta") amount = Math.round(rawNum * 1000000);
      else if (rawNum < 1000) amount = Math.round(rawNum * 1000);
      else amount = Math.round(rawNum);
    }

    if (amount <= 0) continue;

    let item = line
      .replace(/(?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(k|rb|ribu|jt|juta)?/gi, "")
      .replace(/[-*•]/g, "")
      .replace(/\b(qris|gopay|ovo|shopeepay|dana|bca|mandiri|transfer|cash|tunai|spaylater|paylater)\b/gi, "")
      .trim();

    if (!item) item = "Pengeluaran";

    const lower = line.toLowerCase();
    let category = "Lainnya";
    let intent = "WANT";

    if (lower.includes("kopi") || lower.includes("boba") || lower.includes("snack") || lower.includes("jajan") || lower.includes("starbucks") || lower.includes("mixue") || lower.includes("es ")) {
      category = "Jajan & Kopi";
      intent = "WANT";
    } else if (lower.includes("makan") || lower.includes("nasi") || lower.includes("ayam") || lower.includes("sayur") || lower.includes("warteg") || lower.includes("sarapan") || lower.includes("bakmi") || lower.includes("soto")) {
      category = "Makan Pokok";
      intent = "NEED";
    } else if (lower.includes("bensin") || lower.includes("pertamax") || lower.includes("pertalite") || lower.includes("gojek") || lower.includes("grab") || lower.includes("toll") || lower.includes("parkir") || lower.includes("kereta")) {
      category = "Transport";
      intent = "NEED";
    } else if (lower.includes("listrik") || lower.includes("wifi") || lower.includes("kos") || lower.includes("pulsa") || lower.includes("air") || lower.includes("bpjs")) {
      category = "Tagihan";
      intent = "NEED";
    } else if (lower.includes("game") || lower.includes("skin") || lower.includes("bioskop") || lower.includes("steam") || lower.includes("roblox") || lower.includes("topup")) {
      category = "Hiburan & Game";
      intent = "WANT";
    } else if (lower.includes("baju") || lower.includes("kaos") || lower.includes("sepatu") || lower.includes("tokped") || lower.includes("shopee") || lower.includes("beli")) {
      category = "Belanja & Barang";
      intent = "WANT";
    }

    let paymentMethod = "QRIS";
    if (lower.includes("cash") || lower.includes("tunai")) paymentMethod = "Cash";
    else if (lower.includes("transfer") || lower.includes("bca") || lower.includes("mandiri")) paymentMethod = "Transfer";
    else if (lower.includes("paylater") || lower.includes("spaylater") || lower.includes("kartu kredit") || lower.includes("cc")) paymentMethod = "Paylater/CC";

    results.push({
      amount,
      item,
      category,
      intent,
      paymentMethod,
      notes: line,
    });
  }

  return results;
}

/**
 * Chat #1: Parsing pesan teks laporan pengeluaran
 */
export async function parseExpenseMessage(text) {
  const ai = getGeminiClient();
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!ai) return fallbackExpenseParser(text);

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Ekstrak seluruh item pengeluaran dari teks berikut menjadi array JSON:\n"""\n${text}\n"""`,
      config: {
        systemInstruction:
          "Kamu adalah Diablo Expense Parser. Ekstrak pengeluaran ke JSON. k/rb = ribuan, jt = jutaan. Klasifikasikan intent: NEED (makan pokok, transport kerja, tagihan wajib) vs WANT (kopi, jajan, nongkrong, belanja impulsif, game).",
        responseMimeType: "application/json",
        responseSchema: EXPENSE_SCHEMA,
        maxOutputTokens: 2000,
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    console.error("[Diablo AI] Parse error, fallback to regex:", err.message);
    return fallbackExpenseParser(text);
  }
}

/**
 * Multimodal Vision: Ekstrak Foto Struk / Bukti Transfer / Screenshot QRIS
 */
export async function parseReceiptImage(base64Data, mimeType = "image/jpeg", caption = "") {
  const ai = getGeminiClient();
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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

  const remaining = analytics.budget.remainingBudget;
  const days = Math.max(1, analytics.cycle.daysRemaining);
  const currentDaily = analytics.budget.safeDailySpend;
  const newDaily = Math.max(0, Math.round((remaining - extractedPrice) / days));

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
      const topCat = analytics.leakDetector.categoryStats[0];
      verdict = analytics.velocity.status === "BOROS_PARAH" ? "BAHAYA" : analytics.velocity.status === "AGAK_CEPAT" ? "WASPADA" : "AMAN";
      reply = `Siap Tuan. Sisa budget Rp ${remaining.toLocaleString("id-ID")} (${days} hari ke gajian, jatah Rp ${currentDaily.toLocaleString("id-ID")}/hari). Kebocoran terbesar Tuan ada di ${topCat?.category || "Jajan"} sebesar Rp ${(topCat?.spent || 0).toLocaleString("id-ID")} (${analytics.leakDetector.wantsPercent}% uang lari ke Wants).`;
    }

    return {
      verdict,
      itemPrice: extractedPrice,
      impactOnDailySpend: newDaily,
      reply,
    };
  }

  const contextData = {
    sisaHariKeGajian: days,
    sisaBudgetBulanIni: `Rp ${remaining.toLocaleString("id-ID")}`,
    jatahHarianSaatIni: `Rp ${currentDaily.toLocaleString("id-ID")}/hari`,
    estimasiHargaBarangDitanyakan: extractedPrice > 0 ? `Rp ${extractedPrice.toLocaleString("id-ID")}` : "Tidak disebut spesifik",
    jatahHarianJikaJadiBeli: extractedPrice > 0 ? `Rp ${newDaily.toLocaleString("id-ID")}/hari` : "-",
    rasioNeedsVsWants: `${analytics.leakDetector.needsPercent}% Needs vs ${analytics.leakDetector.wantsPercent}% Wants`,
    topBocorKategori: analytics.leakDetector.categoryStats.slice(0, 3).map((c) => `${c.category}: Rp ${c.spent.toLocaleString("id-ID")} (${c.percent}%)`),
    bocorRecehSering: analytics.leakDetector.latteFactor.slice(0, 3).map((l) => `${l.name} (${l.count}x = Rp ${l.total.toLocaleString("id-ID")})`),
    targetTabunganMasaDepan: (analytics.lifeGoalsSummary?.goals || []).map((g) => `${g.name} (${g.timelineYears} thn): terkumpul Rp ${g.savedAmount.toLocaleString("id-ID")}/${g.targetAmount.toLocaleString("id-ID")}, wajib nabung Rp ${g.requiredMonthly.toLocaleString("id-ID")}/bln`),
    wishlistIncaran: (analytics.leakDetector?.wishlistStatus || []).map((w) => `${w.name}: Rp ${w.price.toLocaleString("id-ID")} (kurang Rp ${w.needed.toLocaleString("id-ID")})`),
    modeNada: profile.advisorTone || "ROAST",
  };

  try {
    const prompt = `Pertanyaan Tuan: "${question}"
Data Keuangan Tuan: ${JSON.stringify(contextData)}
5 Transaksi Terakhir: ${JSON.stringify(recentTransactions.slice(0, 5).map((t) => `${t.item} Rp${t.amount} (${t.intent})`))}

ATURAN WAJIB PERSONA DIABLO (Tensura Butler):
1. Panggil user "Tuan", sebut dirimu "hamba". Gunakan gaya pelayan setia yang sopan tapi satir menohok ("Siap Tuan...", "Maaf Tuan, kalau begini Tuan tidak bisa hidup layak...", "Kufufufu...").
2. JANGAN BERTELE-TELE! Maksimal 2 sampai 3 kalimat padat saja. Langsung sebutkan angka dampak ke jatah harian Tuan dan sindiran intinya.`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction:
          "Kamu adalah Diablo, pelayan setia Tuan dari Tensura. Sopan, satir, tajam, dan SANGAT RINGKAS (maksimal 2-3 kalimat). Jangan pernah menulis paragraf panjang atau bertele-tele.",
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
        maxOutputTokens: 500,
        temperature: 0.25,
      },
    });

    const resObj = JSON.parse(response.text.trim());
    return {
      verdict: resObj.verdict || "WASPADA",
      itemPrice: resObj.itemPrice ?? extractedPrice,
      impactOnDailySpend: resObj.impactOnDailySpend ?? newDaily,
      reply: resObj.reply,
    };
  } catch (err) {
    console.error("[Diablo Advisor] AI error:", err.message);
    return {
      verdict: "WASPADA",
      itemPrice: extractedPrice,
      impactOnDailySpend: newDaily,
      reply: `Maaf Tuan, koneksi pikiran hamba ke Gemini terganggu (${err.message}). Namun secara hitungan kasar, sisa budget Tuan Rp ${remaining.toLocaleString("id-ID")} dengan jatah aman Rp ${currentDaily.toLocaleString("id-ID")}/hari.`,
    };
  }
}

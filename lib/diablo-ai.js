import { GoogleGenAI, Type } from "@google/genai";
import { getConfig } from "./bundled-config.js";

const MODEL_NAME = (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== "gemini-2.5-flash" ? process.env.GEMINI_MODEL : null) || "gemini-3.5-flash";

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
      intent: { type: Type.STRING, enum: ["NEED", "WANT"] },
      paymentMethod: { type: Type.STRING },
      notes: { type: Type.STRING },
    },
  },
};

function parseSingleExpense(chunk, amount) {
  let item = chunk
    .replace(/(?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(k|rb|ribu|jt|juta)?/gi, "")
    .replace(/[-*•]/g, "")
    .replace(/\b(aku|hari|ini|udah|itu|aja|tadi|lagi|dan|lalu|terus|sama)\b/gi, "")
    .replace(/\b(qris|gopay|ovo|shopeepay|dana|bca|mandiri|transfer|cash|tunai|spaylater|paylater)\b/gi, "")
    .trim();

  if (!item) item = "Pengeluaran";

  const lower = chunk.toLowerCase();
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

  return {
    amount,
    item,
    category,
    intent,
    paymentMethod,
    notes: chunk.trim(),
  };
}

/**
 * Fallback regex parser jika GEMINI_API_KEY bermasalah
 */
function fallbackExpenseParser(text) {
  const regex = /(?:rp\.?\s*)?(\d+(?:[.,]\d+)?)\s*(k|rb|ribu|jt|juta)?/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[1]) {
      let rawNum = parseFloat(m[1].replace(",", "."));
      const unit = (m[2] || "").toLowerCase();
      let amount = 0;
      if (unit === "k" || unit === "rb" || unit === "ribu") amount = Math.round(rawNum * 1000);
      else if (unit === "jt" || unit === "juta") amount = Math.round(rawNum * 1000000);
      else if (rawNum < 1000) amount = Math.round(rawNum * 1000);
      else amount = Math.round(rawNum);

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
    results.push(parseSingleExpense(chunk, matches[i].amount));
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
export async function parseExpenseMessage(text) {
  const ai = getGeminiClient();
  if (!ai) return fallbackExpenseParser(text);

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Ekstrak seluruh item pengeluaran dari teks berikut menjadi array JSON:\n"""\n${text}\n"""`,
        config: {
          systemInstruction:
            "Kamu adalah Diablo Expense Parser. Ekstrak pengeluaran ke JSON. k/rb = ribuan, jt = jutaan. Klasifikasikan intent: NEED (makan pokok, transport kerja, tagihan wajib) vs WANT (kopi, jajan, nongkrong, belanja impulsif, game).",
          responseMimeType: "application/json",
          responseSchema: EXPENSE_SCHEMA,
          maxOutputTokens: 2000,
          temperature: 0.1,
        },
      }),
      2800
    );

    const parsed = JSON.parse(response.text.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
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
1. Panggil user "Tuan", sebut dirimu "hamba". Karakter: Pelayan setia yang cerdas, sopan, ringkas, dan to-the-point.
2. DILARANG BERTELE-TELE! Maksimal 1 sampai 2 kalimat saja.
3. DILARANG ceramah panjang dan DILARANG kalimat puitis/filosofis lebay (seperti "menghapus jejak masa lalu tidak akan membuat dompet terisi emas", "realita tetaplah kejam", dll).
4. Jawab langsung inti pertanyaan:
   - Jika tanya kelayakan beli ("aman ga?"): Langsung sebut aman/tidak dan dampaknya ke jatah harian secara singkat.
   - Jika tanya hal lain: Jawab langsung to-the-point tanpa basa-basi berlebihan.`;

    for (const model of candidateModels) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction:
                "Kamu adalah Diablo, pelayan setia Tuan. Sopan, cerdas, to-the-point, dan SANGAT SINGKAT (maksimal 1-2 kalimat). DILARANG ceramah puitis atau bertele-tele.",
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

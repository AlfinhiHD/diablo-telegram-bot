import { NextResponse } from "next/server.js";
import {
  getUserProfile,
  saveUserProfile,
  getTransactions,
  addTransaction,
  undoLastTransaction,
  computeAnalytics,
  addAdvisorHistory,
  addToPot,
  createLoginToken,
} from "../../../../lib/store.js";
import { parseExpenseMessage, parseReceiptImage, askFinancialAdvisor } from "../../../../lib/diablo-ai.js";
import { isAllowedUser, appUrl } from "../../../../lib/auth.js";
import { formatRupiah } from "../../../../lib/format.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8749252504:AAGaK5CuaR7etKom0u99EQOLYX-XRS_gwIc";

async function sendTelegramMessage(chatId, text, threadId = null, replyMarkup = null) {
  const token = BOT_TOKEN;
  if (!token) return false;

  // Sanitasi button URLs jika ada
  if (replyMarkup?.inline_keyboard) {
    for (const row of replyMarkup.inline_keyboard) {
      for (const btn of row) {
        if (btn.url && !btn.url.startsWith("https://")) {
          const pathOnly = btn.url.startsWith("http://localhost:3000") ? btn.url.replace("http://localhost:3000", "") : btn.url;
          btn.url = "https://diablo-telegram-bot.vercel.app" + (pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`);
        }
      }
    }
  }

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };
  if (threadId) payload.message_thread_id = threadId;
  if (replyMarkup) payload.reply_markup = replyMarkup;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      console.error("[Telegram] Send error with markup/markdown:", errJson);
      // Fallback tanpa markdown & markup
      const fallbackPayload = {
        chat_id: chatId,
        text: text.replace(/[*_`]/g, ""),
      };
      if (threadId) fallbackPayload.message_thread_id = threadId;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackPayload),
      });
    }
    return true;
  } catch (err) {
    console.error("[Telegram] Network send error:", err.message);
    return false;
  }
}

async function fetchTelegramPhotoBase64(fileId) {
  const token = BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diset.");

  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const info = await infoRes.json();
  const filePath = info?.result?.file_path;
  if (!filePath) throw new Error("Gagal mengambil lokasi file dari Telegram.");

  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return buffer.toString("base64");
}

function parseNominalString(str, unitStr = "") {
  let num = parseFloat(String(str).replace(/\./g, "").replace(",", "."));
  if (isNaN(num)) return 0;
  const unit = (unitStr || "").toLowerCase().trim();
  if (unit === "jt" || unit === "juta") num *= 1_000_000;
  else if (unit === "rb" || unit === "ribu" || unit === "k") num *= 1_000;
  return Math.round(num);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const message = body.message || body.channel_post;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const fromId = String(message.from?.id || chatId);
    const threadId = message.message_thread_id || null;
    const text = (message.text || message.caption || "").trim();
    const photos = message.photo || null;

    if (!text && !photos) {
      return NextResponse.json({ ok: true, note: "Ignored" });
    }

    if (!isAllowedUser(fromId)) {
      await sendTelegramMessage(
        chatId,
        `Maaf Tuan, akun Telegram dengan ID \`${fromId}\` belum didaftarkan di konfigurasi Diablo.`,
        threadId
      );
      return NextResponse.json({ ok: true });
    }

    const userId = fromId;

    // Command: /id
    if (text === "/id" || text.startsWith("/id@")) {
      const reply =
        `Siap Tuan, ini identitas kanal Tuan:\n` +
        `• *User ID:* \`${userId}\`\n` +
        `• *Chat ID:* \`${chatId}\`\n` +
        `• *Topic ID:* \`${threadId || "None"}\``;
      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true });
    }

    // Command: /login
    if (text === "/login" || text.startsWith("/login@")) {
      const token = await createLoginToken(userId);
      const baseUrl = appUrl();
      const loginUrl = `${baseUrl}/auth/verify?token=${token}`;

      const reply =
        `*Kukuku... Akses Rahasia Web Dashboard Tuan:*\n\n` +
        `Klik link di bawah ini untuk masuk ke dashboard tanpa password (link berlaku selama 10 menit):\n\n` +
        `👉 [Buka Diablo Finance](${loginUrl})\n\n` +
        `_Catatan: Jangan teruskan pesan atau link ini kepada orang lain demi keamanan pundi-pundi Tuan._`;

      const markup = {
        inline_keyboard: [
          [{ text: "🔑 Masuk ke Web Dashboard", url: loginUrl }],
        ],
      };

      await sendTelegramMessage(chatId, reply, threadId, markup);
      return NextResponse.json({ ok: true });
    }

    const profile = await getUserProfile(userId);

    // Command: /start atau /help
    if (text === "/start" || text === "/help" || text.startsWith("/start@") || text.startsWith("/help@")) {
      const isConfigured = profile && profile.monthlyIncome > 0;

      if (!isConfigured) {
        const token = await createLoginToken(userId);
        const loginUrl = `${appUrl()}/auth/verify?token=${token}`;
        const welcome =
          `*Kukuku... Selamat datang, Tuan. Hamba Diablo, pelayan finansial pribadi Tuan.*\n\n` +
          `Pundi-pundi Tuan tampaknya belum dikonfigurasi. Mari kita atur pendapatan bulanan, tanggal gajian, dan pos tabungan Tuan di Web Dashboard.\n\n` +
          `Klik tombol di bawah ini untuk membuka halaman pengaturan:`;

        const markup = {
          inline_keyboard: [
            [{ text: "⚙️ Atur Pundi-pundi Sekarang", url: loginUrl }],
          ],
        };

        await sendTelegramMessage(chatId, welcome, threadId, markup);
        return NextResponse.json({ ok: true });
      }

      const welcome =
        `*Siap Tuan. Hamba Diablo, siap menjaga pundi-pundi Tuan.*\n\n` +
        `• *Catat Pengeluaran:* Ketik langsung \`kopi 25k qris\` atau kirim foto struk.\n` +
        `• *Tanya Diablo:* Ketik \`beli sepatu 1jt aman ga?\` atau \`/tanya ...\`\n` +
        `• *Isi Tabungan:* \`/nabung <nama pos> <nominal>\` (misal: \`/nabung darurat 200rb\`)\n` +
        `• *Web Dashboard:* Ketik \`/login\` untuk membuka web.\n` +
        `• *Menu Cepat:* \`/rekap\`, \`/undo\`, \`/id\``;

      await sendTelegramMessage(chatId, welcome, threadId);
      return NextResponse.json({ ok: true });
    }

    // Command: /undo
    if (text === "/undo" || text.startsWith("/undo@")) {
      const removed = await undoLastTransaction(userId);
      const reply = removed
        ? `Siap Tuan. Catatan terakhir (*${removed.item}* - ${formatRupiah(removed.amount)}) telah hamba batalkan.`
        : `Maaf Tuan, tidak ada transaksi yang bisa dibatalkan.`;
      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true });
    }

    // Command: /nabung <nama pos> <nominal>
    if (text.toLowerCase().startsWith("/nabung")) {
      const raw = text.replace(/^\/nabung(?:@\S+)?\s*/i, "").trim();
      const match = raw.match(/^(.+?)\s+([\d.,]+)\s*(jt|juta|rb|ribu|k)?$/i);

      if (!match) {
        const potsList = (profile.savingsPots || []).map((p) => `• *${p.name}*`).join("\n");
        await sendTelegramMessage(
          chatId,
          `Siap Tuan. Format menabung:\n\`/nabung <nama pos> <nominal>\`\nContoh: \`/nabung darurat 250rb\`\n\nPos tabungan Tuan saat ini:\n${potsList || "- Belum ada pos (buat di Web Dashboard /login)"}`,
          threadId
        );
        return NextResponse.json({ ok: true });
      }

      const potName = match[1].trim();
      const amount = parseNominalString(match[2], match[3]);
      if (amount <= 0) {
        await sendTelegramMessage(chatId, `Maaf Tuan, nominal menabung harus lebih dari 0.`, threadId);
        return NextResponse.json({ ok: true });
      }

      const result = await addToPot(userId, { name: potName }, amount);
      if (!result.pot) {
        const available = (profile.savingsPots || []).map((p) => `*${p.name}*`).join(", ");
        await sendTelegramMessage(
          chatId,
          `Maaf Tuan, pos tabungan "${potName}" tidak ditemukan.\nPos yang tersedia: ${available || "Belum ada"}.\n\nTuan dapat menambah pos tabungan baru di Web Dashboard (\`/login\`).`,
          threadId
        );
        return NextResponse.json({ ok: true });
      }

      const pot = result.pot;
      const pct = pot.target > 0 ? Math.min(100, Math.round((pot.saved / pot.target) * 100)) : 0;
      const reply =
        `💰 *Setoran Tabungan Berhasil!*\n\n` +
        `• Pos Tabungan: *${pot.name}*\n` +
        `• Setoran: *+${formatRupiah(amount)}*\n` +
        `• Total Terkumpul: *${formatRupiah(pot.saved)}* / ${formatRupiah(pot.target)} (${pct}%)\n\n` +
        `_Hamba senang melihat Tuan menambah benteng pertahanan finansial Tuan._`;

      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true });
    }

    // Command: /setgaji <nominal> [tgl_gajian]
    if (text.toLowerCase().startsWith("/setgaji")) {
      const rawArg = text.replace(/^\/setgaji(?:@\S+)?\s*/i, "").trim();
      const match = rawArg.match(/^([\d.,]+)\s*(jt|juta|rb|ribu|k)?(?:\s+(\d{1,2}))?/i);
      if (!match) {
        await sendTelegramMessage(
          chatId,
          `Siap Tuan. Contoh:\n\`/setgaji 12jt 25\` (Gaji 12 juta, gajian tgl 25)`,
          threadId
        );
        return NextResponse.json({ ok: true });
      }
      const num = parseNominalString(match[1], match[2]);
      const nextPayday = match[3] ? Math.min(28, Math.max(1, Number(match[3]))) : profile.paydayDate;
      const updated = await saveUserProfile(userId, {
        ...profile,
        monthlyIncome: num,
        paydayDate: nextPayday,
      });
      await sendTelegramMessage(
        chatId,
        `Siap Tuan. Pendapatan diperbarui menjadi *${formatRupiah(updated.monthlyIncome)}* (Gajian tanggal *${updated.paydayDate}*).`,
        threadId
      );
      return NextResponse.json({ ok: true });
    }

    const transactions = await getTransactions(userId, 200);
    const analytics = computeAnalytics(profile, transactions);

    // Command: /rekap
    if (text === "/rekap" || text.startsWith("/rekap@")) {
      const rem = formatRupiah(analytics.budget.remainingBudget);
      const safeDaily = formatRupiah(analytics.budget.safeDailySpend);
      const todaySpent = formatRupiah(analytics.budget.todaySpent);
      const days = analytics.cycle.daysRemaining;

      const potSummary = (profile.savingsPots || [])
        .map((p) => `• ${p.name}: ${formatRupiah(p.saved)}`)
        .join("\n");

      const satire =
        analytics.budget.todayRemaining < 0
          ? `_Jatah hari ini sudah jebol ${formatRupiah(Math.abs(analytics.budget.todayRemaining))}. Tahan nafsu Tuan sebelum gajian tiba._`
          : `_Keadaan masih dalam kendali hamba, Tuan._`;

      const rekap =
        `📜 *Status Pundi-pundi (${days} Hari ke Gajian)*\n\n` +
        `• Sisa Budget Siklus: *${rem}*\n` +
        `• Jatah Aman Harian: *${safeDaily}/hari*\n` +
        `• Pengeluaran Hari Ini: *${todaySpent}*\n` +
        `• Needs vs Wants: *${analytics.leakDetector.needsPercent}% vs ${analytics.leakDetector.wantsPercent}%*\n\n` +
        (potSummary ? `*Tabungan Terkumpul:*\n${potSummary}\n\n` : "") +
        satire;

      await sendTelegramMessage(chatId, rekap, threadId);
      return NextResponse.json({ ok: true });
    }

    // Foto Struk / QRIS
    if (photos && photos.length > 0) {
      try {
        const largestPhoto = photos[photos.length - 1];
        const base64 = await fetchTelegramPhotoBase64(largestPhoto.file_id);
        const items = await parseReceiptImage(base64, "image/jpeg", text);
        const saved = [];
        for (const it of items) {
          saved.push(await addTransaction(userId, { ...it, source: "telegram-photo" }));
        }
        const updatedAnalytics = computeAnalytics(profile, [...saved, ...transactions]);
        const listText = saved.map((s) => `• *${s.item}*: ${formatRupiah(s.amount)} [${s.intent}]`).join("\n");
        await sendTelegramMessage(
          chatId,
          `Siap Tuan, struk berhasil dibaca:\n${listText}\n\nSisa jatah hari ini: *${formatRupiah(updatedAnalytics.budget.todayRemaining)}*`,
          threadId
        );
        return NextResponse.json({ ok: true, mode: "photo_logged" });
      } catch (err) {
        await sendTelegramMessage(chatId, `Maaf Tuan, struk gagal dibaca: ${err.message}`, threadId);
        return NextResponse.json({ ok: true });
      }
    }

    // Deteksi Advisor vs Logger
    const loggerThreadId = process.env.TELEGRAM_LOGGER_THREAD_ID ? Number(process.env.TELEGRAM_LOGGER_THREAD_ID) : null;
    const advisorThreadId = process.env.TELEGRAM_ADVISOR_THREAD_ID ? Number(process.env.TELEGRAM_ADVISOR_THREAD_ID) : null;

    let isAdvisorChat = false;
    if (advisorThreadId && threadId === advisorThreadId) {
      isAdvisorChat = true;
    } else if (loggerThreadId && threadId === loggerThreadId) {
      isAdvisorChat = false;
    } else {
      const lower = text.toLowerCase();
      if (
        lower.startsWith("/tanya") ||
        lower.startsWith("/ask") ||
        lower.startsWith("/advisor") ||
        lower.includes("?") ||
        lower.includes("aman ga") ||
        lower.includes("oke ga") ||
        lower.includes("boleh beli") ||
        lower.includes("boros") ||
        lower.includes("gimana") ||
        lower.includes("layak")
      ) {
        isAdvisorChat = true;
      }
    }

    // ROUTE 1: Financial Advisor
    if (isAdvisorChat) {
      const cleanQuestion = text.replace(/^\/(?:tanya|ask|advisor)\s*/i, "").trim();
      const advResult = await askFinancialAdvisor(cleanQuestion, profile, analytics, transactions);
      await addAdvisorHistory(userId, { question: cleanQuestion, reply: advResult.reply, verdict: advResult.verdict });

      const reply = `*[${advResult.verdict}]* ${advResult.reply}`;
      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true, mode: "advisor" });
    }

    // ROUTE 2: Expense Logger
    const items = await parseExpenseMessage(text);
    if (!items || items.length === 0) {
      await sendTelegramMessage(
        chatId,
        `Maaf Tuan, sebutkan nominal pengeluaran agar bisa hamba catat. Contoh: \`kopi 25k qris\``,
        threadId
      );
      return NextResponse.json({ ok: true, mode: "logger_empty" });
    }

    const savedItems = [];
    for (const item of items) {
      savedItems.push(await addTransaction(userId, { ...item, source: "telegram" }));
    }

    const updatedAnalytics = computeAnalytics(profile, [...savedItems, ...transactions]);
    const lines = savedItems.map((s) => `• *${s.item}*: ${formatRupiah(s.amount)} (${s.category} / ${s.intent})`);
    const todayRem = updatedAnalytics.budget.todayRemaining;
    const footerNote =
      todayRem < 0
        ? `⚠️ _Jatah hari ini sudah minus ${formatRupiah(Math.abs(todayRem))}. Mohon kendalikan diri Tuan._`
        : `📉 Sisa jatah hari ini: *${formatRupiah(todayRem)}* (Jatah aman: ${formatRupiah(updatedAnalytics.budget.safeDailySpend)}/hari)`;

    const ack = `Siap Tuan, tercatat:\n${lines.join("\n")}\n\n${footerNote}`;
    await sendTelegramMessage(chatId, ack, threadId);
    return NextResponse.json({ ok: true, mode: "logger_saved", count: savedItems.length });
  } catch (err) {
    console.error("[Telegram Webhook] Error:", err);
    try {
      const body = await req.clone().json().catch(() => ({}));
      const msg = body?.message || body?.channel_post;
      if (msg?.chat?.id) {
        await sendTelegramMessage(msg.chat.id, `Maaf Tuan, terjadi kendala teknis: ${err.message}`, msg.message_thread_id);
      }
    } catch {}
    return NextResponse.json({ ok: true, error: err.message });
  }
}

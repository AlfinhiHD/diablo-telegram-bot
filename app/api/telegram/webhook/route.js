import { NextResponse } from "next/server.js";
import {
  getUserProfile,
  saveUserProfile,
  getTransactions,
  addTransaction,
  undoLastTransaction,
  clearUserData,
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
  const rawStr = String(str).trim();
  const unit = (unitStr || "").toLowerCase().trim();
  let num = 0;

  if (unit === "jt" || unit === "juta") {
    const decStr = rawStr.replace(",", ".");
    num = parseFloat(decStr) * 1_000_000;
  } else if (unit === "rb" || unit === "ribu" || unit === "k") {
    const decStr = rawStr.replace(",", ".");
    num = parseFloat(decStr) * 1_000;
  } else {
    num = parseFloat(rawStr.replace(/\./g, "").replace(",", "."));
  }

  if (isNaN(num)) return 0;
  return Math.round(num);
}

function parseMultiPockets(text) {
  const lines = text.split(/\r?\n/);
  const pockets = [];
  let currentGroup = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const headerMatch = trimmed.match(/^(?:uang\s+di\s+|di\s+)?([a-zA-Z0-9\s]+)\s*:\s*$/i);
    if (headerMatch) {
      currentGroup = headerMatch[1].replace(/^(?:uang\s+di\s+|di\s+)/i, "").trim();
      continue;
    }

    const m = trimmed.match(/^[-*•]?\s*(?:([^:\d]+?)\s*:\s*)?([\d.,]+)\s*(jt|juta|rb|ribu|k)\b/i);
    if (m && m[2]) {
      let name = (m[1] || "").trim();
      if (!name && currentGroup) {
        name = currentGroup;
      } else if (name && currentGroup && !name.toLowerCase().includes(currentGroup.toLowerCase())) {
        name = currentGroup + " - " + name;
      }
      if (!name) name = "Kantong";

      const amt = parseNominalString(m[2], m[3]);
      if (amt > 0) {
        pockets.push({ name, amount: amt });
      }
    }
  }
  return pockets;
}

function hasExpenseNominal(str) {
  return (
    /(?:rp\.?\s*)?\b\d+(?:[.,]\d+)?\s*(?:k|rb|ribu|jt|juta)\b/i.test(str) ||
    /(?:rp\.?\s*)\d+/i.test(str) ||
    /\b\d{4,9}\b/.test(str)
  );
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
    const lower = text.toLowerCase();
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

    // Web Dashboard request (Command: /login atau bahasa wajar: "mau buka web dashboard ku dong", "link web", dll)
    const isWebLoginRequest =
      text === "/login" ||
      text.startsWith("/login@") ||
      lower.includes("buka web") ||
      lower.includes("buka dashboard") ||
      lower.includes("web dashboard") ||
      lower.includes("link web") ||
      lower.includes("link login") ||
      lower.includes("link dashboard") ||
      lower.includes("masuk web") ||
      lower.includes("masuk dashboard") ||
      lower.includes("akses web") ||
      lower.includes("akses dashboard") ||
      lower.includes("minta link") ||
      lower.includes("buka pundi") ||
      /^(?:mau\s+|tolong\s+|bisa\s+)?(?:buka|masuk|akses|lihat|minta\s+link|link)?\s*(?:web\s+dashboard|dashboard|web(?:\s+ku)?|pundi|login)\b/i.test(lower);

    if (isWebLoginRequest) {
      const token = await createLoginToken(userId);
      const baseUrl = appUrl();
      const loginUrl = `${baseUrl}/auth/verify?token=${token}`;

      const reply =
        `Siap Tuan, ini tautan langsung menuju Web Dashboard Tuan (berlaku 10 menit):\n\n` +
        `👉 [Buka Web Dashboard Diablo](${loginUrl})\n\n` +
        `_Silakan klik tombol di bawah untuk langsung membukanya._`;

      const markup = {
        inline_keyboard: [
          [{ text: "🔑 Buka Web Dashboard", url: loginUrl }],
        ],
      };

      await sendTelegramMessage(chatId, reply, threadId, markup);
      return NextResponse.json({ ok: true, mode: "web_dashboard_link" });
    }

    const fromUser = message.from;
    const tgName = [fromUser?.first_name, fromUser?.last_name].filter(Boolean).join(" ");
    const tgUsername = fromUser?.username || "";

    const profile = await getUserProfile(userId);
    if (profile && (!profile.telegramUsername || !profile.telegramName || !profile.ownerName)) {
      saveUserProfile(userId, {
        ownerName: profile.ownerName || tgName || (userId === "1128526190" ? "Alfin" : ""),
        telegramName: profile.telegramName || tgName,
        telegramUsername: profile.telegramUsername || tgUsername || (userId === "1128526190" ? "nocelestial14" : ""),
      }).catch(() => {});
    }

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

      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;
      const welcome =
        `*Siap Tuan. Hamba Diablo, pelayan setia pundi-pundi Tuan.*\n\n` +
        `Tuan bisa bicara santai tanpa perlu menghafal perintah kaku:\n` +
        `• *Catat Belanja:* Cukup ketik nominal santai, misal: \`makan siang 16k beli kopi 14k\` atau kirim foto struk.\n` +
        `• *Tanya Bebas:* \`beli sepatu 1jt aman ga?\` atau \`hari ini udah keluar berapa?\`.\n` +
        `• *Status Keuangan:* Ketik \`rekap\` atau \`sisa budget\`.\n` +
        `• *Menabung:* Ketik \`nabung booster 200rb\` atau \`nabung darurat 500k\`.\n` +
        `• *Batal:* Ketik \`batal\` atau \`undo\` jika keliru mencatat.\n` +
        `• *Web Dashboard:* Ketik \`buka dashboard\` atau klik tombol di bawah.\n\n` +
        `_Tuan cukup bicara wajar pada hamba, hamba yang siap mengurusnya._`;

      const markup = {
        inline_keyboard: [
          [{ text: "🔑 Buka Web Dashboard", url: loginUrl }],
        ],
      };

      await sendTelegramMessage(chatId, welcome, threadId, markup);
      return NextResponse.json({ ok: true });
    }

    // Command: /undo atau natural "undo", "batal", "batalin", "salah catat"
    const isUndoRequest =
      text === "/undo" ||
      text.startsWith("/undo@") ||
      lower === "undo" ||
      lower === "batal" ||
      lower === "batalin" ||
      lower === "batalin dong" ||
      /^(?:tolong\s+)?(?:undo|batal(?:kan)?|hapus\s+transaksi\s+terakhir|salah\s+catat)\b/i.test(lower);

    if (isUndoRequest) {
      const removed = await undoLastTransaction(userId);
      const reply = removed
        ? `Siap Tuan. Catatan terakhir (*${removed.item}* - ${formatRupiah(removed.amount)}) telah hamba batalkan.`
        : `Maaf Tuan, tidak ada transaksi yang bisa dibatalkan.`;
      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true, mode: "undo_done" });
    }

    // Command: /nabung <nama pos> <nominal> atau natural "nabung booster 200rb"
    const isNabungCmd =
      lower.startsWith("/nabung") ||
      lower.startsWith("nabung ") ||
      lower.startsWith("isi tabungan ") ||
      lower.startsWith("setor tabungan ");

    if (isNabungCmd) {
      const raw = text.replace(/^(?:\/nabung(?:@\S+)?|nabung|isi\s+tabungan|setor\s+tabungan)\s*/i, "").trim();
      const match = raw.match(/^(.+?)\s+([\d.,]+)\s*(jt|juta|rb|ribu|k)?$/i);

      if (!match) {
        const potsList = (profile.savingsPots || []).map((p) => `• *${p.name}*`).join("\n");
        await sendTelegramMessage(
          chatId,
          `Siap Tuan. Format menabung:\n\`nabung <nama pos> <nominal>\`\nContoh: \`nabung booster 250rb\`\n\nPos tabungan Tuan saat ini:\n${potsList || "- Belum ada pos (buat di Web Dashboard)"}`,
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
          `Maaf Tuan, pos tabungan "${potName}" tidak ditemukan.\nPos yang tersedia: ${available || "Belum ada"}.\n\nTuan dapat menambah pos tabungan baru di Web Dashboard.`,
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

    // Command: /reset atau pesan minta hapus/clear data
    const isResetRequest =
      text === "/reset" ||
      text.startsWith("/reset@") ||
      /^(?:aku\s+mau\s+)?(?:semua(?:nya)?\s+di\s+)?(?:clear|reset|hapus\s+semua\s+data)(?:\s+dulu)?/i.test(lower) ||
      lower.includes("clear history") ||
      lower.includes("reset history") ||
      lower.includes("hapus semua data") ||
      lower.includes("hapus semua riwayat");

    if (isResetRequest) {
      await clearUserData(userId);
      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;
      const reply =
        `Siap Tuan. Seluruh data transaksi, riwayat, dan profil telah hamba bersihkan.\n\n` +
        `Untuk mengatur ulang gaji & tanggal gajian:\n` +
        `• Cukup ketik: \`gajiku 8jt 25\` atau \`set budget 10jt\`\n` +
        `• Atau buka [Web Dashboard](${loginUrl})`;

      const markup = {
        inline_keyboard: [[{ text: "⚙️ Atur Pundi-pundi", url: loginUrl }]],
      };

      await sendTelegramMessage(chatId, reply, threadId, markup);
      return NextResponse.json({ ok: true, mode: "reset_done" });
    }

    // Deteksi pengaturan multi-kantong / rekening (seperti Bank Saqu, Wondr, dll)
    const multiPockets = parseMultiPockets(text);
    const isMultiPocketSetup =
      multiPockets.length >= 2 &&
      (lower.includes("budget") || lower.includes("set") || lower.includes("atur") || lower.includes("saldo") || lower.includes("uang"));

    if (isMultiPocketSetup) {
      const totalAmount = multiPockets.reduce((sum, p) => sum + p.amount, 0);
      const newSavingsPots = multiPockets.map((p, idx) => ({
        id: `pot_${idx + 1}_${Date.now().toString(36)}`,
        name: p.name,
        target: p.amount,
        saved: p.amount,
        monthly: 0,
        deadline: "",
      }));

      const updated = await saveUserProfile(userId, {
        ...(profile || {}),
        monthlyIncome: totalAmount,
        savingsPots: newSavingsPots,
      });

      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;

      const lines = multiPockets.map((p) => `• *${p.name}*: ${formatRupiah(p.amount)}`).join("\n");
      const reply =
        `Siap Tuan. Pundi-pundi Tuan telah berhasil hamba atur sesuai rincian:\n\n` +
        `${lines}\n\n` +
        `💰 *Total Budget:* *${formatRupiah(totalAmount)}*\n` +
        `📅 *Tanggal Gajian:* Tanggal *${updated.paydayDate || 25}*\n\n` +
        `Semua pos tabungan & saldo telah tercatat rapi di Web Dashboard Tuan.`;

      const markup = {
        inline_keyboard: [[{ text: "🔑 Buka Web Dashboard", url: loginUrl }]],
      };

      await sendTelegramMessage(chatId, reply, threadId, markup);
      return NextResponse.json({ ok: true, mode: "multi_pockets_set" });
    }

    // Command: /setgaji <nominal> [tgl_gajian] atau natural "gajiku 8jt 25", "set budget 10jt"
    const isSetGajiCmd = lower.startsWith("/setgaji");
    const naturalGajiMatch = text.match(/^(?:atur\s+|set\s+)?(?:gaji|budget|pendapatan|penghasilan|saldo)(?:ku)?\s+([\d.,]+)\s*(jt|juta|rb|ribu|k)?(?:\s+(?:tanggal|tgl)?\s*(\d{1,2}))?$/i);

    if (isSetGajiCmd || naturalGajiMatch) {
      const match = isSetGajiCmd
        ? text.replace(/^\/setgaji(?:@\S+)?\s*/i, "").trim().match(/^([\d.,]+)\s*(jt|juta|rb|ribu|k)?(?:\s+(\d{1,2}))?/i)
        : naturalGajiMatch;

      if (!match) {
        await sendTelegramMessage(
          chatId,
          `Siap Tuan. Format:\n\`gajiku <nominal> <tgl_gajian>\` atau \`set budget <nominal>\`\nContoh: \`gajiku 8jt 25\` atau \`set budget 10jt\``,
          threadId
        );
        return NextResponse.json({ ok: true });
      }
      const num = parseNominalString(match[1], match[2]);
      const nextPayday = match[3] ? Math.min(28, Math.max(1, Number(match[3]))) : (profile?.paydayDate || 25);
      const updated = await saveUserProfile(userId, {
        ...(profile || {}),
        monthlyIncome: num,
        paydayDate: nextPayday,
      });
      await sendTelegramMessage(
        chatId,
        `Siap Tuan. Budget & pendapatan Tuan diperbarui menjadi *${formatRupiah(updated.monthlyIncome)}* (Gajian tanggal *${updated.paydayDate}*).\n\nPundi-pundi Tuan kini telah aktif!`,
        threadId
      );
      return NextResponse.json({ ok: true });
    }

    // WAJIB KONFIGURASI: Jika gaji belum diatur, kunci chat & arahkan setup!
    const isConfigured = profile && Number(profile.monthlyIncome) > 0;
    if (!isConfigured) {
      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;
      const msg =
        `⚠️ *Pundi-pundi Tuan Belum Dikonfigurasi!*\n\n` +
        `Kukuku... Hamba belum dapat mencatat pengeluaran atau menganalisis keuangan sebelum Tuan mengatur pendapatan bulanan dan tanggal gajian Tuan.\n\n` +
        `*Silakan pilih salah satu cara:*\n` +
        `1. Klik link masuk ke Web Dashboard:\n👉 [Buka Pengaturan Web](${loginUrl})\n\n` +
        `2. Atau atur langsung sekarang di chat ini:\nKetik: \`/setgaji <nominal> <tgl_gajian>\`\nContoh: \`/setgaji 8jt 25\``;

      const markup = {
        inline_keyboard: [[{ text: "⚙️ Atur Pundi-pundi Sekarang", url: loginUrl }]],
      };

      await sendTelegramMessage(chatId, msg, threadId, markup);
      return NextResponse.json({ ok: true, note: "Unconfigured user blocked" });
    }

    const transactions = await getTransactions(userId, 200);
    const analytics = computeAnalytics(profile, transactions);

    // Command: /rekap atau bahasa wajar: "rekap dong", "status keuangan", "laporan", dll
    const isRekapRequest =
      text === "/rekap" ||
      text.startsWith("/rekap@") ||
      lower === "rekap" ||
      lower === "rekap dong" ||
      lower === "cek rekap" ||
      lower === "laporan" ||
      lower === "laporan keuangan" ||
      lower === "status keuangan" ||
      lower === "ringkasan pundi" ||
      lower.includes("rekap pundi") ||
      lower.includes("rekap keuangan");

    if (isRekapRequest) {
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

    // ==========================================
    // FAST QUERY ENGINE (<50ms, Tanpa AI Delay)
    // ==========================================

    // 1. Tanya Pengeluaran Hari Ini / Rekap Hari Ini
    const isTodayQuery =
      (lower.includes("hari ini") && (lower.includes("keluar") || lower.includes("habis") || lower.includes("berapa") || lower.includes("belanja") || lower.includes("catat"))) ||
      lower.includes("udah keluar berapa") ||
      lower.includes("udah belanja apa") ||
      lower.includes("tadi habis berapa") ||
      lower.includes("pengeluaran hari ini") ||
      lower.includes("rekap hari ini");

    if (isTodayQuery) {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayTxs = transactions.filter((t) => new Date(t.createdAt) >= startOfToday);
      const todaySpentStr = formatRupiah(analytics.budget.todaySpent);
      const safeDailyStr = formatRupiah(analytics.budget.safeDailySpend);
      const todayRemStr = formatRupiah(analytics.budget.todayRemaining);
      const remBudgetStr = formatRupiah(analytics.budget.remainingBudget);

      let reply = "";
      if (todayTxs.length === 0) {
        reply =
          `Siap Tuan. Hari ini Tuan *belum mencatat pengeluaran* apapun.\n\n` +
          `• Sisa jatah aman hari ini: *${safeDailyStr}*\n` +
          `• Sisa budget siklus: *${remBudgetStr}* (${analytics.cycle.daysRemaining} hari ke gajian)\n\n` +
          `_Kukuku... Pertahankan ketenangan finansial ini, Tuan._`;
      } else {
        const lines = todayTxs.map((t) => `• *${t.item}*: ${formatRupiah(t.amount)} (${t.category || "Lainnya"})`).join("\n");
        const statusNote = analytics.budget.todayRemaining < 0
          ? `⚠️ _Jatah harian jebol minus ${formatRupiah(Math.abs(analytics.budget.todayRemaining))}. Mohon kendalikan diri Tuan._`
          : `📉 Sisa jatah hari ini: *${todayRemStr}* (Jatah aman: ${safeDailyStr}/hari).`;

        reply =
          `📊 *Laporan Pengeluaran Hari Ini*\n\n` +
          `Daftar transaksi hari ini:\n${lines}\n\n` +
          `• Total Pengeluaran: *${todaySpentStr}*\n` +
          `• ${statusNote}\n` +
          `• Sisa Budget Siklus: *${remBudgetStr}* (${analytics.cycle.daysRemaining} hari ke gajian)`;
      }

      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true, mode: "fast_today_query" });
    }

    // 2. Tanya Sisa Uang / Budget / Saldo Bebas
    const isBudgetQuery =
      lower.includes("sisa budget") ||
      lower.includes("sisa uang") ||
      lower.includes("uangku tinggal berapa") ||
      lower.includes("uang tinggal berapa") ||
      lower.includes("sisa berapa") ||
      lower.includes("saldo") ||
      lower.includes("uang bebas");

    if (isBudgetQuery) {
      const remBudgetStr = formatRupiah(analytics.budget.remainingBudget);
      const safeDailyStr = formatRupiah(analytics.budget.safeDailySpend);
      const todaySpentStr = formatRupiah(analytics.budget.todaySpent);

      const reply =
        `💰 *Status Pundi-pundi Siklus Ini*\n\n` +
        `• Sisa Budget Bebas: *${remBudgetStr}*\n` +
        `• Hari ke Gajian: *${analytics.cycle.daysRemaining} hari* (gajian tanggal ${profile.paydayDate || 25})\n` +
        `• Jatah Aman Harian: *${safeDailyStr}/hari*\n` +
        `• Terpakai Hari Ini: *${todaySpentStr}*\n\n` +
        `_Hamba terus mengawasi agar pundi-pundi Tuan tidak bocor sia-sia._`;

      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true, mode: "fast_budget_query" });
    }

    // 3. Tanya Kapan Gajian
    const isPaydayQuery =
      lower.includes("kapan gajian") ||
      lower.includes("gajian kapan") ||
      lower.includes("berapa hari lagi gajian");

    if (isPaydayQuery) {
      const reply =
        `📅 *Jadwal Gajian Tuan*\n\n` +
        `Gajian Tuan dijadwalkan pada tanggal *${profile.paydayDate || 25}* (tersisa *${analytics.cycle.daysRemaining} hari* lagi).\n` +
        `Sisa pundi-pundi siklus ini masih ada *${formatRupiah(analytics.budget.remainingBudget)}*.\n\n` +
        `_Bersabarlah Tuan, hari kemenangan finansial sudah semakin dekat._`;

      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true, mode: "fast_payday_query" });
    }

    // 4. Tanya Kemampuan Bot / Bantuan / Cara Pakai
    const isBotCapabilityQuery =
      lower.includes("bisa tanya apa") ||
      lower.includes("tanya apa aja") ||
      lower.includes("bisa apa aja") ||
      lower.includes("bisa ngapain") ||
      lower.includes("fitur apa") ||
      lower.includes("cara pakai") ||
      lower.includes("cara pakenya") ||
      lower.includes("gimana pakainya") ||
      lower.includes("gimana pakenya") ||
      lower.includes("bingung") ||
      lower.includes("panduan") ||
      lower.includes("bantuan");

    if (isBotCapabilityQuery) {
      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;

      const reply =
        `Siap Tuan. Hamba Diablo siap melayani keuangan Tuan dengan cara santai tanpa perintah kaku:\n\n` +
        `1. 📝 *Catat Pengeluaran:* Ketik nominal santai (misal: \`makan siang 16k beli kopi 14k\`, \`jus 35k\`) atau kirim foto struk/QRIS.\n` +
        `2. 📊 *Cek Status:* Cukup tanya \`hari ini udah keluar berapa\`, \`sisa budget\`, \`rekap\`, atau \`kapan gajian\`.\n` +
        `3. 🧐 *Konsultasi:* Bebas tanya \`beli sneakers 1jt aman ga?\` atau \`mending nabung atau beli gadget?\`.\n` +
        `4. 💰 *Menabung:* Ketik \`nabung <nama pos> <nominal>\` (misal: \`nabung booster 200rb\`).\n` +
        `5. 🌐 *Web Dashboard:* Ketik \`buka dashboard\` atau klik tombol di bawah.\n` +
        `6. ↩️ *Batal Transaksi:* Ketik \`undo\` atau \`batal\` jika keliru mencatat.\n\n` +
        `_Tuan tidak perlu repot menghafal perintah kaku garis miring (/), cukup chat santai saja pada hamba._`;

      const markup = {
        inline_keyboard: [
          [{ text: "🔑 Buka Web Dashboard", url: loginUrl }],
        ],
      };

      await sendTelegramMessage(chatId, reply, threadId, markup);
      return NextResponse.json({ ok: true, mode: "fast_capability_query" });
    }

    // ==========================================
    // ROUTING: ADVISOR vs EXPENSE LOGGER
    // ==========================================
    const loggerThreadId = process.env.TELEGRAM_LOGGER_THREAD_ID ? Number(process.env.TELEGRAM_LOGGER_THREAD_ID) : null;
    const advisorThreadId = process.env.TELEGRAM_ADVISOR_THREAD_ID ? Number(process.env.TELEGRAM_ADVISOR_THREAD_ID) : null;

    const hasNominal = hasExpenseNominal(text);

    let isAdvisorChat = false;
    if (advisorThreadId && threadId === advisorThreadId) {
      isAdvisorChat = true;
    } else if (loggerThreadId && threadId === loggerThreadId) {
      isAdvisorChat = false;
    } else {
      const isQuestionOrAdvice =
        lower.startsWith("/tanya") ||
        lower.startsWith("/ask") ||
        lower.startsWith("/advisor") ||
        lower.includes("?") ||
        lower.includes("aman ga") ||
        lower.includes("oke ga") ||
        lower.includes("boleh beli") ||
        lower.includes("boros") ||
        lower.includes("gimana") ||
        lower.includes("layak") ||
        lower.includes("mending") ||
        lower.includes("saran") ||
        lower.includes("rekomendasi") ||
        lower.includes("kenapa") ||
        lower.includes("apakah") ||
        lower.includes("bisa ga");

      // Jika ada kata tanya/konsultasi ATAU tidak ada angka nominal pengeluaran sama sekali -> ADVISOR!
      if (isQuestionOrAdvice || !hasNominal) {
        isAdvisorChat = true;
      }
    }

    // ROUTE 1: Financial Advisor / Konsultasi / Percakapan
    if (isAdvisorChat) {
      const cleanQuestion = text.replace(/^\/(?:tanya|ask|advisor)\s*/i, "").trim();
      const advResult = await askFinancialAdvisor(cleanQuestion, profile, analytics, transactions);
      await addAdvisorHistory(userId, { question: cleanQuestion, reply: advResult.reply, verdict: advResult.verdict });

      const reply = advResult.reply;
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

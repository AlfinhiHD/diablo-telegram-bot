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
import { parseExpenseMessage, parseReceiptImage, askFinancialAdvisor, parseNaturalDate } from "../../../../lib/diablo-ai.js";
import { isAllowedUser, appUrl } from "../../../../lib/auth.js";
import { formatRupiah, toWibParts, startOfWibDay } from "../../../../lib/format.js";
import { getConfig } from "../../../../lib/bundled-config.js";

const BOT_TOKEN = getConfig("TELEGRAM_BOT_TOKEN") || process.env.TELEGRAM_BOT_TOKEN || "";

let commandsSynced = false;
async function ensureBotCommands(token) {
  if (commandsSynced || !token) return;
  commandsSynced = true;
  try {
    await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "Panduan & ringkasan pundi-pundi" },
          { command: "web", description: "🔑 Buka Web Dashboard Diablo" },
          { command: "dashboard", description: "🔑 Buka Web Dashboard Diablo" },
          { command: "analisis", description: "📊 Laporan boros & kesehatan pundi" },
          { command: "rekap", description: "📜 Status sisa budget & hari ini" },
          { command: "nabung", description: "💰 Setor tabungan: /nabung <pos> <nominal>" },
          { command: "undo", description: "↩️ Batalkan transaksi terakhir" },
          { command: "id", description: "🆔 Cek Telegram User ID" },
        ],
      }),
    });
  } catch (err) {
    console.warn("[Telegram] Failed to sync commands:", err.message);
  }
}

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
    /\b\d{1,3}(?:[.,]\d{3})+\b/.test(str) ||
    /\b\d{4,9}\b/.test(str)
  );
}

export async function POST(req) {
  try {
    ensureBotCommands(BOT_TOKEN).catch(() => {});

    const body = await req.json();
    const message = body.message || body.channel_post;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const fromId = String(message.from?.id || chatId);
    const threadId = message.message_thread_id || null;
    const text = (message.text || message.caption || "").trim();
    const lower = text.toLowerCase();
    const hasNominal = hasExpenseNominal(text);
    const photos = message.photo || null;
    const messageTime = message.date ? new Date(message.date * 1000) : new Date();

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

    // Web Dashboard request (Command: /web, /dashboard, /login, /app atau bahasa wajar)
    const isWebLoginRequest =
      text === "/web" ||
      text.startsWith("/web@") ||
      text.startsWith("/web ") ||
      text === "/dashboard" ||
      text.startsWith("/dashboard@") ||
      text.startsWith("/dashboard ") ||
      text === "/login" ||
      text.startsWith("/login@") ||
      text.startsWith("/login ") ||
      text === "/app" ||
      text.startsWith("/app@") ||
      text === "/link" ||
      text.startsWith("/link@") ||
      lower === "web" ||
      lower === "website" ||
      lower === "dashboard" ||
      lower === "login" ||
      lower === "/web" ||
      lower === "/dashboard" ||
      lower.includes("website") ||
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
      lower.includes("web dong") ||
      lower.includes("dashboard dong") ||
      /^(?:mau\s+|tolong\s+|bisa\s+)?(?:buka|masuk|akses|lihat|minta\s+link|link)?\s*(?:web\s+dashboard|dashboard|web(?:\s+ku)?|website(?:\s+ku)?|pundi|login)\b/i.test(lower);

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
        `• *Catat Belanja:* Cukup ketik santai: \`makan siang 17.5k beli kopi 14k\` atau kirim foto struk.\n` +
        `• *Web Dashboard:* Ketik \`/web\` atau \`/dashboard\` untuk buka dashboard visual pundi-pundi.\n` +
        `• *Analisis Finansial:* Ketik \`/analisis\` atau \`paling boros di mana\` untuk cek kebocoran pundi.\n` +
        `• *Status Keuangan:* Ketik \`/rekap\` atau \`sisa budget\`.\n` +
        `• *Tanya Bebas:* \`beli sepatu 1jt aman ga?\` atau \`hari ini udah keluar berapa?\`.\n` +
        `• *Menabung:* Ketik \`/nabung booster 200rb\` atau \`nabung darurat 500k\`.\n` +
        `• *Batal:* Ketik \`/undo\` atau \`batal\` jika keliru mencatat.\n\n` +
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

      const peakSlot = analytics.hourlyStats?.peakSlot;
      const peakLine = peakSlot && peakSlot.spent > 0
        ? `• Jam Paling Boros: *${peakSlot.label}* (${formatRupiah(peakSlot.spent)})\n`
        : "";

      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;

      const rekap =
        `📜 *Status Pundi-pundi (${days} Hari ke Gajian)*\n\n` +
        `• Sisa Budget Siklus: *${rem}*\n` +
        `• Jatah Aman Harian: *${safeDaily}/hari*\n` +
        `• Pengeluaran Hari Ini: *${todaySpent}*\n` +
        `• Needs vs Wants: *${analytics.leakDetector.needsPercent}% vs ${analytics.leakDetector.wantsPercent}%*\n` +
        peakLine +
        `\n` +
        (potSummary ? `*Tabungan Terkumpul:*\n${potSummary}\n\n` : "") +
        satire;

      const markup = {
        inline_keyboard: [
          [{ text: "🔑 Buka Web Dashboard", url: loginUrl }],
        ],
      };

      await sendTelegramMessage(chatId, rekap, threadId, markup);
      return NextResponse.json({ ok: true });
    }

    // Command: /analisis, /report, atau bahasa wajar ("analisis ku", "report ku", "paling boros di mana", "masih aman engga", dll)
    const isAnalysisRequest =
      text === "/analisis" ||
      text.startsWith("/analisis@") ||
      text.startsWith("/analisis ") ||
      text === "/analysis" ||
      text.startsWith("/analysis@") ||
      text === "/report" ||
      text.startsWith("/report@") ||
      text === "/evaluasi" ||
      text.startsWith("/evaluasi@") ||
      lower === "analisis" ||
      lower === "analysis" ||
      lower === "report" ||
      lower.includes("analisis ku") ||
      lower.includes("analisis dong") ||
      lower.includes("report ku") ||
      lower.includes("liat report") ||
      lower.includes("lihat report") ||
      lower.includes("paling boros di mana") ||
      lower.includes("paling boros dimana") ||
      lower.includes("boros di mana") ||
      lower.includes("boros dimana") ||
      lower.includes("paling banyak keluar di mana") ||
      lower.includes("kebanyakan jajan") ||
      lower.includes("masih aman ga") ||
      lower.includes("masih aman engga") ||
      lower.includes("evaluasi keuangan") ||
      lower.includes("analisa keuangan");

    if (isAnalysisRequest) {
      const rem = formatRupiah(analytics.budget.remainingBudget);
      const safeDaily = formatRupiah(analytics.budget.safeDailySpend);
      const days = analytics.cycle.daysRemaining;
      const spent = formatRupiah(analytics.budget.spent);
      const statusIcon = analytics.status === "AMAN" ? "🟢" : analytics.status === "HATI_HATI" ? "🟡" : "🔴";

      const topCatLines = (analytics.categories || [])
        .slice(0, 4)
        .map((c, i) => `• ${c.category}: *${formatRupiah(c.spent)}* (${c.percent}%)`)
        .join("\n");

      const leak = analytics.leakDetector;
      const leakLines =
        `• Kebutuhan Pokok (NEED): *${leak.needsPercent}%* (${formatRupiah(leak.needsTotal)})\n` +
        `• Jajan & Keinginan (WANT): *${leak.wantsPercent}%* (${formatRupiah(leak.wantsTotal)})\n` +
        `• Hadiah & Traktir (GIFT): *${leak.giftsPercent}%* (${formatRupiah(leak.giftsTotal)})` +
        (leak.assetsTotal > 0 ? `\n• Aset & Barang (ASSET): *${leak.assetsPercent}%* (${formatRupiah(leak.assetsTotal)})` : "");

      const peak = analytics.hourlyStats?.peakSlot;
      const untimedCount = analytics.hourlyStats?.untimedCount || 0;
      const untimedSpent = analytics.hourlyStats?.untimedSpent || 0;
      const peakText = (peak && peak.spent > 0
        ? `🔥 *${peak.label} (${peak.hours})*: *${formatRupiah(peak.spent)}* (${peak.percent}% dari belanja berjam)`
        : `• _Belum ada jam belanja yang mendominasi._`) +
        (untimedCount > 0 ? `\n• _Catatan: ${untimedCount} transaksi tanpa jam (${formatRupiah(untimedSpent)}) tidak masuk hitungan jam._` : "");

      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;

      const reply =
        `📊 *Laporan Analisis Finansial Tuan*\n\n` +
        `${statusIcon} *Status Keuangan: ${analytics.status}*\n` +
        `_${analytics.message}_\n\n` +
        `💰 *Kondisi Siklus (${days} Hari ke Gajian)*\n` +
        `• Sisa Budget Bebas: *${rem}*\n` +
        `• Total Terpakai: *${spent}*\n` +
        `• Jatah Aman Harian: *${safeDaily}/hari*\n\n` +
        `🛍️ *Paling Boros di Kategori:*\n` +
        `${topCatLines || "• _Belum ada pengeluaran._"}\n\n` +
        `🎯 *Porsi Pengeluaran (Bocor Finansial):*\n` +
        `${leakLines}\n\n` +
        `⏰ *Jam Paling Rawan Boros:*\n` +
        `${peakText}\n\n` +
        `👉 [Klik di sini untuk buka Visual Web Dashboard Tuan](${loginUrl})`;

      const markup = {
        inline_keyboard: [
          [{ text: "🔑 Buka Web Dashboard Lengkap", url: loginUrl }],
        ],
      };

      await sendTelegramMessage(chatId, reply, threadId, markup);
      return NextResponse.json({ ok: true, mode: "fast_analysis_query" });
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

    // 1. Tanya Pengeluaran Kemarin / Hari Tertentu / Hari Ini
    const isPastQuery =
      !hasNominal &&
      (lower.includes("kemarin") || lower.includes("kemaren") || lower.includes("hari selasa") || lower.includes("hari rabu") || lower.includes("hari kamis") || lower.includes("hari jumat") || lower.includes("hari sabtu") || lower.includes("hari minggu") || lower.includes("hari senin") || lower.includes("tgl ") || lower.includes("tanggal ")) &&
      (lower.includes("keluar") || lower.includes("habis") || lower.includes("berapa") || lower.includes("belanja") || lower.includes("catat") || lower.includes("rekap"));

    if (isPastQuery) {
      const { date: targetDate } = parseNaturalDate(text);
      const startOfDay = startOfWibDay(targetDate);
      const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

      const dayTxs = transactions.filter((t) => {
        const d = new Date(t.createdAt);
        return d >= startOfDay && d < endOfDay;
      });

      const daySpent = dayTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const dateName = targetDate.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      });

      let reply = "";
      if (dayTxs.length === 0) {
        reply =
          `Siap Tuan. Pada *${dateName}*, Tuan *tidak mencatat pengeluaran* apapun.\n\n` +
          `• Sisa budget siklus saat ini: *${formatRupiah(analytics.budget.remainingBudget)}*`;
      } else {
        const lines = dayTxs.map((t) => `• *${t.item}*: ${formatRupiah(t.amount)} (${t.category || "Lainnya"})`).join("\n");
        reply =
          `📊 *Laporan Pengeluaran (${dateName})*\n\n` +
          `Daftar transaksi:\n${lines}\n\n` +
          `• Total Terpakai: *${formatRupiah(daySpent)}*\n` +
          `• Sisa Budget Siklus: *${formatRupiah(analytics.budget.remainingBudget)}*`;
      }

      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true, mode: "fast_past_query" });
    }

    const isTodayQuery =
      (lower.includes("hari ini") && (lower.includes("keluar") || lower.includes("habis") || lower.includes("berapa") || lower.includes("belanja") || lower.includes("catat"))) ||
      lower.includes("udah keluar berapa") ||
      lower.includes("udah belanja apa") ||
      lower.includes("tadi habis berapa") ||
      lower.includes("pengeluaran hari ini") ||
      lower.includes("rekap hari ini");

    if (isTodayQuery) {
      const startOfToday = startOfWibDay(new Date());
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
      lower.includes("sisa duit") ||
      lower.includes("uangku tinggal berapa") ||
      lower.includes("uang tinggal berapa") ||
      lower.includes("duit tinggal berapa") ||
      lower.includes("uangku sisa berapa") ||
      lower.includes("duitku sisa berapa") ||
      lower.includes("sisa berapa") ||
      lower.includes("saldo") ||
      lower.includes("uang bebas") ||
      lower.includes("sisa pundi") ||
      /(?:sisa|tinggal berapa)\s*(?:uang|budget|duit|dana|saldo|pundi)/i.test(lower) ||
      /(?:uang|budget|duit|saldo|pundi)\s*(?:ku\s*)?(?:sisa|tinggal)\s*berapa/i.test(lower);

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

    // 4. Tanya Jam Boros / Waktu Pengeluaran
    const isHourlyQuery =
      lower.includes("jam boros") ||
      lower.includes("boros jam") ||
      lower.includes("jam berapa") ||
      lower.includes("waktu boros") ||
      lower.includes("paling boros jam") ||
      lower.includes("pola jam");

    if (isHourlyQuery) {
      const peak = analytics.hourlyStats?.peakSlot;
      const slots = analytics.hourlyStats?.slots || [];
      const untimedCount = analytics.hourlyStats?.untimedCount || 0;
      const untimedSpent = analytics.hourlyStats?.untimedSpent || 0;
      const lines = slots
        .map((s) => `• ${s.label} (${s.hours}): *${formatRupiah(s.spent)}* (${s.count} tx) ${peak && s.key === peak.key && s.spent > 0 ? "🔥" : ""}`)
        .join("\n");

      let verdictText = "_Pola belanja Tuan masih merata dan belum menunjukkan jam rawan khusus._";
      if (peak && peak.spent > 0) {
        verdictText = `_Saran Diablo: Tuan paling sering boros di waktu *${peak.label}* (${peak.percent}% pengeluaran berjam). Waspadai pengeluaran impulsif di rentang jam tersebut._`;
      }
      const untimedNote = untimedCount > 0
        ? `\n\n_Catatan: ${untimedCount} transaksi tanpa jam (${formatRupiah(untimedSpent)}) tidak dimasukkan ke statistik jam._`
        : "";

      const reply =
        `⏰ *Analisis Jam Belanja & Jam Boros Tuan*\n\n` +
        `Paling Boros di Waktu:\n` +
        (peak && peak.spent > 0
          ? `🔥 *${peak.label} (${peak.hours})*: *${formatRupiah(peak.spent)}* (${peak.percent}%)\n\n`
          : `• _Belum ada pola jam belanja dominan._\n\n`) +
        `*Rincian Waktu Belanja Siklus Ini:*\n` +
        `${lines}\n\n` +
        verdictText +
        untimedNote;

      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true, mode: "fast_hourly_query" });
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
    const items = await parseExpenseMessage(text, messageTime);
    if (!items || items.length === 0) {
      await sendTelegramMessage(
        chatId,
        `Maaf Tuan, sebutkan nominal pengeluaran agar bisa hamba catat. Contoh: \`kopi 25k qris\` atau \`makan soto 15k kemarin\``,
        threadId
      );
      return NextResponse.json({ ok: true, mode: "logger_empty" });
    }

    const savedItems = [];
    for (const item of items) {
      savedItems.push(await addTransaction(userId, { ...item, source: "telegram" }));
    }

    const updatedAnalytics = computeAnalytics(profile, [...savedItems, ...transactions]);
    const formatWibClock = (d) => {
      const p = toWibParts(d);
      return `${String(p.hour).padStart(2, "0")}.${String(p.minute).padStart(2, "0")}`;
    };

    const lines = savedItems.map((s) => {
      const showItemTime = savedItems.length > 1 && s.timeKnown !== false;
      const itemTimeStr = showItemTime ? formatWibClock(s.createdAt) : "";
      return `• *${s.item}*: ${formatRupiah(s.amount)} (${s.category} / ${s.intent}${showItemTime ? ` • ${itemTimeStr} WIB` : ""})`;
    });
    const todayRem = updatedAnalytics.budget.todayRemaining;

    // Cek apakah transaksi dicatat untuk tanggal lampau / hari ini & apakah jam diketahui
    const now = new Date();
    const nowWib = toWibParts(now);
    const txDate = new Date(savedItems[0]?.createdAt || Date.now());
    const txWib = toWibParts(txDate);
    const isSameDay =
      txWib.year === nowWib.year &&
      txWib.month === nowWib.month &&
      txWib.date === nowWib.date;

    const timedItems = savedItems.filter((s) => s.timeKnown !== false);
    const uniqueTimedClocks = [...new Set(timedItems.map((s) => formatWibClock(s.createdAt)))];
    const dayStr = txDate.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Jakarta",
    });

    let dateLabel = "";
    if (isSameDay) {
      dateLabel = uniqueTimedClocks.length === 1
        ? ` (*Hari ini • ${uniqueTimedClocks[0]} WIB*)`
        : " (*Hari ini*)";
    } else if (timedItems.length === 0) {
      dateLabel = ` (*${dayStr} • tanpa jam spesifik*)`;
    } else if (uniqueTimedClocks.length === 1) {
      dateLabel = ` (*${dayStr} • ${uniqueTimedClocks[0]} WIB*)`;
    } else {
      dateLabel = ` (*${dayStr}*)`;
    }

    const todaySpentStr = formatRupiah(updatedAnalytics.budget.todaySpent);
    const safeDailyStr = formatRupiah(updatedAnalytics.budget.safeDailySpend);
    const untimedInfo = !isSameDay && timedItems.length === 0
      ? `\n_Info: Jam tidak disebut, tidak masuk hitungan Jam Boros. Tambah kata waktu (misal \`angkringan 23k malem\`) jika ingin dicatat jamnya._`
      : "";
    const footerNote = isSameDay
      ? `• Total belanja hari ini: *${todaySpentStr}*\n` +
        (todayRem < 0
          ? `⚠️ _Jatah hari ini sudah minus ${formatRupiah(Math.abs(todayRem))}. Mohon kendalikan diri Tuan._`
          : `📉 Sisa jatah hari ini: *${formatRupiah(todayRem)}* (Jatah aman: ${safeDailyStr}/hari)`)
      : `📉 Sisa budget siklus: *${formatRupiah(updatedAnalytics.budget.remainingBudget)}* (Jatah aman: ${safeDailyStr}/hari)${untimedInfo}`;

    const ack = `Siap Tuan, tercatat${dateLabel}:\n${lines.join("\n")}\n\n${footerNote}`;
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

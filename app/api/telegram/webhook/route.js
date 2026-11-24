import { NextResponse } from "next/server.js";
import {
  getUserProfile,
  saveUserProfile,
  getTransactions,
  getTransactionById,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  findTransaction,
  editTransactionAmount,
  changeTransactionWallet,
  undoLastTransaction,
  clearUserData,
  computeAnalytics,
  addAdvisorHistory,
  addToPot,
  createLoginToken,
  resolveWallet,
  adjustWalletBalance,
  transferBetweenWallets,
  computeAuditDiff,
  applyAuditBalances,
  findFixedCost,
  markFixedCostPaid,
  addDebt,
  upsertDebt,
  deleteDebt,
  findOpenDebt,
  updateDebt,
  snoozeDebt,
} from "../../../../lib/store.js";
import {
  analyzeUserMessage,
  parseReceiptImage,
  askFinancialAdvisor,
  parseNaturalDate,
  hasTimeHint,
  applyTimeReplyToPendingItems,
} from "../../../../lib/diablo-ai.js";
import { buildReminderTelegramMessage } from "../../../../lib/reminders-tg.js";
import { isAllowedUser, appUrl } from "../../../../lib/auth.js";
import { formatRupiah, toWibParts, fromWib, startOfWibDay } from "../../../../lib/format.js";
import { getConfig } from "../../../../lib/bundled-config.js";

export const maxDuration = 30;

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
          { command: "saldo", description: "💳 Cek saldo semua sumber dana & surplus" },
          { command: "rekap", description: "📜 Status sisa budget & hari ini" },
          { command: "reminder", description: "🔔 Tagihan jatuh tempo & utang macet" },
          { command: "utang", description: "🧾 Cek catatan utang & piutang" },
          { command: "analisis", description: "📊 Laporan boros & kesehatan pundi" },
          { command: "dashboard", description: "🔑 Buka Web Dashboard Diablo" },
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
      const fallbackPayload = {
        chat_id: chatId,
        text: text.replace(/[*_`]/g, ""),
      };
      if (threadId) fallbackPayload.message_thread_id = threadId;
      if (replyMarkup) fallbackPayload.reply_markup = replyMarkup;
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
  const cleaned = String(str || "")
    .replace(/(?:jam|pukul)\s*\d{1,2}(?:[.:]\d{2})?/gi, " ")
    .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, " ")
    .replace(/\b(?:[01]?\d|2[0-3])\.[0-5]\d\s*(?:wib|wita|wit)?\b/gi, " ");
  return (
    /(?:rp\.?\s*)?\b\d+(?:[.,]\d+)?\s*(?:k|rb|ribu|jt|juta)\b/i.test(cleaned) ||
    /(?:rp\.?\s*)\d+/i.test(cleaned) ||
    /\b\d{1,3}(?:[.,]\d{3})+\b/.test(cleaned) ||
    /\b\d{4,9}\b/.test(cleaned)
  );
}

function formatWibClock(d) {
  const p = toWibParts(d);
  return `${String(p.hour).padStart(2, "0")}.${String(p.minute).padStart(2, "0")}`;
}

function formatCompactRp(n) {
  const abs = Math.abs(Math.round(Number(n) || 0));
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, "").replace(".", ",")}jt`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}rb`;
  return `${sign}${abs}`;
}

function walletEmoji(w) {
  if (!w) return "💳";
  if (w.locked || w.role === "emergency") return "🔒";
  if (w.role === "credit") return w.balance < 0 ? "🧾" : "✨";
  const id = String(w.id || "").toLowerCase();
  if (id.includes("cash")) return "💵";
  if (id.includes("shopeepay")) return "🟠";
  if (id.includes("booster")) return "⚡";
  if (id.includes("saqu")) return "🏦";
  return "💳";
}

async function answerCallbackQuery(callbackQueryId, text = "") {
  if (!BOT_TOKEN || !callbackQueryId) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch {}
}

async function clearInlineKeyboard(chatId, messageId) {
  if (!BOT_TOKEN || !chatId || !messageId) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
    });
  } catch {}
}

async function sendPendingPastExpensePrompt(chatId, threadId, items) {
  const txDate = new Date(items[0]?.createdAt || Date.now());
  const dayStr = txDate.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });

  const itemLines = items.map((s) => {
    const isInc = s.type === "income";
    const tStr = s.timeKnown !== false ? ` • ${formatWibClock(s.createdAt)} WIB` : " • _belum ada jam_";
    return `• ${isInc ? "💚 +" : ""}*${s.item}*: ${formatRupiah(s.amount)} (${s.category} / ${s.intent}${tStr})`;
  });

  const promptMsg =
    `⏳ *Tuan, catatan tanggal lampau (${dayStr}) wajib menyertakan waktu/jam agar tidak ada data jam kosong:*\n` +
    `${itemLines.join("\n")}\n\n` +
    `Pilih waktu di bawah atau balas langsung jamnya (misal: \`malem\`, \`jam 20.00\`):`;

  const markup = {
    inline_keyboard: [
      [
        { text: "🌅 Pagi (08.30)", callback_data: "past_time:08:30" },
        { text: "☀️ Siang (12.30)", callback_data: "past_time:12:30" },
      ],
      [
        { text: "🌇 Sore (16.30)", callback_data: "past_time:16:30" },
        { text: "🌙 Malam (20.30)", callback_data: "past_time:20:30" },
      ],
      [{ text: "❌ Batal Catat", callback_data: "past_time:cancel" }],
    ],
  };

  await sendTelegramMessage(chatId, promptMsg, threadId, markup);
}

/** Tampilkan tombol pilihan sumber/tujuan dana di bawah pesan laporan! */
async function sendWalletSelectionPrompt(chatId, threadId, items, profile, extraLabel = "") {
  const allIncome = items.every((it) => it.type === "income");
  const allExpense = items.every((it) => (it.type || "expense") !== "income");
  // Untuk pemasukan jangan tawarkan SPayLater; untuk pengeluaran tampilkan semua dompet tidak terkunci termasuk SPayLater
  const activeWallets = (profile?.wallets || []).filter(
    (w) => !w.locked && (!allIncome || w.role !== "credit")
  );

  const header = extraLabel
    ? extraLabel
    : allIncome
      ? "💰 *Masuk ke dana yang mana, Tuan?*"
      : allExpense
        ? "💳 *Kurangi / pakai sumber dana yang mana, Tuan?*"
        : "💳 *Pilih sumber/tujuan dana untuk catatan ini, Tuan:*";

  const itemLines = items.map((s) => {
    const isInc = s.type === "income";
    const prefix = isInc ? "💚 +" : "🔻 ";
    const wTag = s.walletName ? ` [${s.walletName}]` : "";
    return `• ${prefix}*${s.item}*: ${formatRupiah(s.amount)} (${s.category}${wTag})`;
  });

  const rows = [];
  for (let i = 0; i < activeWallets.length; i += 2) {
    const chunk = activeWallets.slice(i, i + 2);
    rows.push(
      chunk.map((w) => ({
        text: `${walletEmoji(w)} ${w.name} (${formatCompactRp(w.balance)})`,
        callback_data: `pick_wallet:${w.id}`,
      }))
    );
  }
  rows.push([{ text: "❌ Batal", callback_data: "pick_wallet:cancel" }]);

  const msg =
    `${header}\n` +
    `${itemLines.join("\n")}\n\n` +
    `_Klik salah satu dana di bawah (atau balas nama dananya, misal \`bni\`, \`cash\`, \`saqu\`, \`spaylater\`):_`;

  await sendTelegramMessage(chatId, msg, threadId, { inline_keyboard: rows });
}

/** Tampilkan tombol pilih dompet asal/tujuan untuk satu atau beberapa transfer. */
async function sendTransferWalletPrompt(chatId, threadId, pendingTransfers, profile, pendingItems = []) {
  const missingSide = pendingTransfers.every((t) => !t.fromWalletId) ? "from" : "to";
  const excludedIds = new Set(
    pendingTransfers.map((t) => (missingSide === "from" ? t.toWalletId : t.fromWalletId)).filter(Boolean)
  );
  const unlocked = (profile?.wallets || []).filter((w) => !w.locked);
  let activeWallets =
    missingSide === "from"
      ? unlocked.filter((w) => w.role !== "credit" && !excludedIds.has(w.id))
      : unlocked.filter((w) => !excludedIds.has(w.id));
  if (activeWallets.length === 0) {
    activeWallets = missingSide === "from" ? unlocked.filter((w) => w.role !== "credit") : unlocked;
  }

  const walletName = (id) => {
    const w = (profile?.wallets || []).find((x) => x.id === id);
    return w ? `${walletEmoji(w)} *${w.name}*` : `_${id}_`;
  };

  const transferLines = pendingTransfers.map((tr) => {
    const fromLabel = tr.fromWalletId ? walletName(tr.fromWalletId) : "_(pilih asal)_";
    const toLabel = tr.toWalletId ? walletName(tr.toWalletId) : "_(pilih tujuan)_";
    const noteStr = tr.note ? ` — _${tr.note}_` : "";
    return `• 🔁 ${fromLabel} → ${toLabel}: *${formatRupiah(tr.amount)}*${noteStr}`;
  });

  const itemLines = (pendingItems || []).map((s) => {
    const isInc = s.type === "income";
    const prefix = isInc ? "💚 +" : "🔻 ";
    const wTag = s.walletName ? ` [${s.walletName}]` : "";
    return `• ${prefix}*${s.item}*: ${formatRupiah(s.amount)} (${s.category}${wTag})`;
  });

  const header =
    missingSide === "from"
      ? "🏦 *Kirim / transfer dari sumber dana yang mana, Tuan?*"
      : "🏦 *Masuk ke dompet tujuan yang mana, Tuan?*";

  const rows = [];
  for (let i = 0; i < activeWallets.length; i += 2) {
    const chunk = activeWallets.slice(i, i + 2);
    rows.push(
      chunk.map((w) => ({
        text: `${walletEmoji(w)} ${w.name} (${formatCompactRp(w.balance)})`,
        callback_data: `pick_wallet:${w.id}`,
      }))
    );
  }
  rows.push([{ text: "❌ Batal", callback_data: "pick_wallet:cancel" }]);

  const msg =
    `${header}\n` +
    `${[...transferLines, ...itemLines].join("\n")}\n\n` +
    `_Klik salah satu dana di bawah (atau balas nama dananya, misal \`saqu\`, \`bni\`, \`cash\`):_`;

  await sendTelegramMessage(chatId, msg, threadId, { inline_keyboard: rows });
}

async function executeAndConfirmTransfers(userId, chatId, threadId, transfers, { clearPending = false } = {}) {
  const succeeded = [];
  const errors = [];
  const affectedIds = [];
  let latestProfile = null;

  for (const tr of transfers) {
    const result = await transferBetweenWallets(userId, tr.fromWalletId, tr.toWalletId, tr.amount);
    if (result.error) {
      errors.push(result.error);
      continue;
    }
    latestProfile = result.profile;
    succeeded.push({ ...result, note: tr.note || "" });
    if (!affectedIds.includes(result.fromWallet.id)) affectedIds.push(result.fromWallet.id);
    if (!affectedIds.includes(result.toWallet.id)) affectedIds.push(result.toWallet.id);
  }

  if (clearPending) {
    latestProfile = await saveUserProfile(userId, { pendingWalletSelection: null });
  }

  if (succeeded.length === 0) {
    await sendTelegramMessage(chatId, `Maaf Tuan, pindah dana gagal: ${errors[0] || "data transfer tidak valid."}`, threadId);
    return { succeeded, errors, profile: latestProfile };
  }

  let reply;
  if (succeeded.length === 1 && errors.length === 0) {
    const r = succeeded[0];
    const isPaylaterPayoff = r.toWallet.role === "credit";
    reply =
      `${isPaylaterPayoff ? "✅ *Pembayaran Tagihan PayLater Berhasil!*" : "🔁 *Pindah Dana Berhasil!*"}\n\n` +
      `• Dari: ${walletEmoji(r.fromWallet)} *${r.fromWallet.name}* → Sisa *${formatRupiah(r.fromWallet.balance)}*\n` +
      `• Ke: ${walletEmoji(r.toWallet)} *${r.toWallet.name}* → Kini *${formatRupiah(r.toWallet.balance)}*\n` +
      `• Nominal: *${formatRupiah(r.amount)}*` +
      (r.note ? `\n• Catatan: ${r.note}` : "");
  } else {
    const transferLines = succeeded.map(
      (r) =>
        `• ${walletEmoji(r.fromWallet)} *${r.fromWallet.name}* → ${walletEmoji(r.toWallet)} *${r.toWallet.name}*: *${formatRupiah(r.amount)}*${r.note ? ` _(${r.note})_` : ""}`
    );
    const balanceLines = affectedIds
      .map((id) => (latestProfile?.wallets || []).find((w) => w.id === id))
      .filter(Boolean)
      .map((w) => `• ${walletEmoji(w)} *${w.name}*: *${formatRupiah(w.balance)}*`);

    reply =
      `🔁 *Pindah Dana Berhasil!*\n\n` +
      `${transferLines.join("\n")}\n\n` +
      `*Saldo Terbaru:*\n${balanceLines.join("\n")}` +
      (errors.length > 0 ? `\n\n⚠️ ${errors.join("; ")}` : "");
  }

  await sendTelegramMessage(chatId, reply, threadId);
  return { succeeded, errors, profile: latestProfile };
}

async function completePendingTransferSelection(userId, chatId, threadId, pending, wallet, profile, transactions) {
  const hasCollision = (pending.transfers || []).some(
    (tr) => (!tr.fromWalletId && tr.toWalletId === wallet.id) || (!tr.toWalletId && tr.fromWalletId === wallet.id)
  );
  if (hasCollision) {
    await sendTelegramMessage(
      chatId,
      `Maaf Tuan, dompet asal dan tujuan tidak boleh sama (*${wallet.name}*). Pilih dompet lain ya Tuan.`,
      threadId
    );
    return { ok: false, sameWallet: true };
  }

  const filledTransfers = (pending.transfers || []).map((tr) => ({
    ...tr,
    fromWalletId: tr.fromWalletId || wallet.id,
    toWalletId: tr.toWalletId || wallet.id,
  }));

  const hasItems = Boolean(pending.items?.length);
  const trRes = await executeAndConfirmTransfers(userId, chatId, threadId, filledTransfers, {
    clearPending: !hasItems,
  });

  if (hasItems) {
    const freshProfile = trRes.profile || (await getUserProfile(userId));
    const resolvedItems = pending.items.map((it) =>
      it.walletId ? it : { ...it, walletId: wallet.id, walletName: wallet.name, paymentMethod: wallet.name }
    );
    await saveAndConfirmTransactions(userId, chatId, threadId, resolvedItems, freshProfile, transactions, {
      settleDebtId: pending.settleDebtId || null,
      payBillId: pending.payBillId || null,
    });
  }

  return { ok: true };
}

function buildWalletSummaryText(profile, analytics) {
  const wallets = profile?.wallets || [];
  const ws = analytics?.walletSummary;
  const sur = analytics?.surplusSummary;
  if (!wallets.length) {
    return `Maaf Tuan, daftar sumber dana/dompet belum diatur.`;
  }

  const dailyList = wallets.filter((w) => w.role === "daily");
  const creditList = wallets.filter((w) => w.role === "credit");
  const savingList = wallets.filter((w) => w.role === "saving");
  const emergencyList = wallets.filter((w) => w.role === "emergency" || w.locked);

  const fmtLine = (w) => `• ${walletEmoji(w)} *${w.name}*: *${formatRupiah(w.balance)}*`;

  const sections = [];
  if (dailyList.length) {
    sections.push(
      `*Dana Harian (Jatah Siklus):*\n${dailyList.map(fmtLine).join("\n")}\n` +
      `  ↳ _Dana Harian Bersih: *${formatRupiah(ws?.dailyTotal || 0)}*${(ws?.creditDebtTotal || 0) > 0 ? ` (sudah potong PayLater ${formatRupiah(ws.creditDebtTotal)})` : ""}_`
    );
  }
  if (creditList.length) {
    sections.push(
      `*PayLater / Kredit:*\n${creditList
        .map((w) => `• ${walletEmoji(w)} *${w.name}*: ${w.balance < 0 ? `*Tagihan ${formatRupiah(Math.abs(w.balance))}*` : "*Rp 0 (LUNAS)*"}`)
        .join("\n")}`
    );
  }
  if (savingList.length) {
    sections.push(`*Simpanan / Dana Cadangan:*\n${savingList.map(fmtLine).join("\n")}`);
  }
  if (emergencyList.length) {
    sections.push(`*Dana Darurat (Tidak Disentuh):*\n${emergencyList.map(fmtLine).join("\n")}`);
  }

  const ds = analytics?.debtsSummary;
  let debtFooter = "";
  if (ds && (ds.openUtangCount > 0 || ds.openPiutangCount > 0)) {
    const netSign = ds.netDebtPosition >= 0 ? "+" : "";
    debtFooter =
      `\n\n🧾 *Utang & Piutang Terbuka:*\n` +
      `• Utang: *${formatRupiah(ds.openUtangTotal)}* (${ds.openUtangCount}) • Piutang: *${formatRupiah(ds.openPiutangTotal)}* (${ds.openPiutangCount})\n` +
      `• Net Utang/Piutang: *${netSign}${formatRupiah(ds.netDebtPosition)}*`;
  }

  let surplusLine = "";
  if (sur) {
    const pSur = sur.projectedEndCycleSurplus;
    surplusLine = `\n📈 *Proyeksi Surplus Akhir Siklus:* *${pSur >= 0 ? "+" : ""}${formatRupiah(pSur)}*`;
  }

  return (
    `💼 *Ringkasan Sumber Dana & Surplus Tuan*\n\n` +
    `${sections.join("\n\n")}\n\n` +
    `💧 *Total Likuid Bersih:* *${formatRupiah(ws?.liquidTotal || 0)}*\n` +
    `🏦 *Total Kekayaan Bersih:* *${formatRupiah(ws?.netWorthTotal || 0)}*` +
    surplusLine +
    debtFooter
  );
}

function buildDebtsListText(profile) {
  const debts = (profile?.debts || []).filter((d) => d.status !== "paid");
  const utang = debts.filter((d) => d.type === "utang");
  const piutang = debts.filter((d) => d.type === "piutang");

  if (debts.length === 0) {
    return `🧾 *Catatan Utang & Piutang*\n\nTidak ada utang maupun piutang terbuka, Tuan. Bersih!`;
  }

  const fmtDebt = (d, idx) => {
    const amtStr = d.amount === null ? `_nominal belum jelas (?)_` : `*${formatRupiah(d.amount)}*`;
    const noteStr = d.note ? ` — ${d.note}` : "";
    return `${idx + 1}. *${d.person}*: ${amtStr}${noteStr}`;
  };

  const utangTotal = utang.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const utangUnknown = utang.filter((d) => d.amount === null).length;
  const piutangTotal = piutang.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const net = piutangTotal - utangTotal;

  let text = `🧾 *Catatan Utang & Piutang Terbuka*\n\n`;
  text += `🔴 *Utang Tuan (${utang.length}):*\n`;
  text += utang.length ? utang.map(fmtDebt).join("\n") : "• _Tidak ada_";
  if (utang.length) {
    text += `\n  ↳ _Total: ${formatRupiah(utangTotal)}${utangUnknown > 0 ? ` (+ ${utangUnknown} belum pasti)` : ""}_`;
  }

  text += `\n\n🟢 *Piutang / Uang di Orang (${piutang.length}):*\n`;
  text += piutang.length ? piutang.map(fmtDebt).join("\n") : "• _Tidak ada_";
  if (piutang.length) {
    text += `\n  ↳ _Total Piutang: ${formatRupiah(piutangTotal)}_`;
  }

  text += `\n\n⚖️ *Net (Piutang − Utang):* *${net >= 0 ? "+" : ""}${formatRupiah(net)}*`;
  text += `\n\n_Tips: Ketik natural untuk lunas, misal \`andani udah bayar 74.33k masuk bni\` atau \`bayar utang sup kalduara 57k pake cash\`._`;
  return text;
}

function buildWalletHistoryText(wallet, transactions = []) {
  const wTxs = transactions.filter((t) => t.walletId === wallet.id);
  const expTotal = wTxs.filter((t) => (t.type || "expense") !== "income").reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const incTotal = wTxs.filter((t) => t.type === "income").reduce((a, t) => a + (Number(t.amount) || 0), 0);

  if (wTxs.length === 0) {
    return (
      `${walletEmoji(wallet)} *Riwayat Dana: ${wallet.name}*\n` +
      `• Saldo saat ini: *${formatRupiah(wallet.balance)}*\n\n` +
      `_Belum ada transaksi tercatat di dana ini._`
    );
  }

  const recent = wTxs.slice(0, 12).map((t) => {
    const isInc = t.type === "income";
    const dStr = new Date(t.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
    return `• ${isInc ? "💚 +" : "🔻 "}*${t.item}*: ${formatRupiah(t.amount)} _(${dStr})_`;
  });

  return (
    `${walletEmoji(wallet)} *Riwayat Dana: ${wallet.name}*\n` +
    `• Saldo saat ini: *${formatRupiah(wallet.balance)}*\n` +
    `• Total Keluar: *${formatRupiah(expTotal)}*${incTotal > 0 ? `\n• Total Masuk: *+${formatRupiah(incTotal)}*` : ""}\n` +
    `• Jumlah Transaksi: *${wTxs.length}*\n\n` +
    `*Transaksi Terakhir:*\n${recent.join("\n")}` +
    (wTxs.length > 12 ? `\n_...dan ${wTxs.length - 12} transaksi lainnya di Web Dashboard._` : "")
  );
}

async function saveAndConfirmTransactions(
  userId,
  chatId,
  threadId,
  items,
  profile,
  existingTransactions = [],
  { settleDebtId = null, payBillId = null } = {}
) {
  const savedItems = [];
  const updatedIds = new Set();

  for (const item of items) {
    if (item.id) {
      const updated = await updateTransaction(userId, item.id, {
        createdAt: item.createdAt,
        timeKnown: true,
        ...(item.walletId ? { walletId: item.walletId, walletName: item.walletName || "" } : {}),
      });
      savedItems.push(updated || { ...item, timeKnown: true });
      updatedIds.add(item.id);
    } else {
      const resolvedW = item.walletId ? resolveWallet(profile, item.walletId) : null;
      savedItems.push(
        await addTransaction(userId, {
          ...item,
          walletId: resolvedW?.id || item.walletId || "",
          walletName: resolvedW?.name || item.walletName || "",
          paymentMethod: resolvedW?.name || item.paymentMethod || "QRIS",
          timeKnown: true,
          source: item.source || "telegram",
        })
      );
    }
  }

  if (settleDebtId) {
    await updateDebt(userId, settleDebtId, { status: "paid" });
  }
  if (payBillId) {
    await markFixedCostPaid(userId, payBillId, { logTx: false });
  }

  if (profile?.pendingPastExpense || profile?.pendingWalletSelection) {
    await saveUserProfile(userId, { pendingPastExpense: null, pendingWalletSelection: null });
  }

  const freshProfile = await getUserProfile(userId);
  const mergedTransactions = [
    ...savedItems.filter((s) => !updatedIds.has(s.id)),
    ...existingTransactions.map((t) => (updatedIds.has(t.id) ? savedItems.find((s) => s.id === t.id) || t : t)),
  ];
  const updatedAnalytics = computeAnalytics(freshProfile, mergedTransactions);

  const lines = savedItems.map((s) => {
    const isInc = s.type === "income";
    const showItemTime = savedItems.length > 1;
    const itemTimeStr = showItemTime ? ` • ${formatWibClock(s.createdAt)} WIB` : "";
    const wLabel = s.walletName ? ` • ${s.walletName}` : "";
    return `• ${isInc ? "💚 +" : ""}*${s.item}*: ${formatRupiah(s.amount)} (${s.category} / ${s.intent}${wLabel}${itemTimeStr})`;
  });

  const now = new Date();
  const nowWib = toWibParts(now);
  const txDate = new Date(savedItems[0]?.createdAt || Date.now());
  const txWib = toWibParts(txDate);
  const isSameDay =
    txWib.year === nowWib.year &&
    txWib.month === nowWib.month &&
    txWib.date === nowWib.date;

  const uniqueClocks = [...new Set(savedItems.map((s) => formatWibClock(s.createdAt)))];
  const dayStr = txDate.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });

  let dateLabel = "";
  if (isSameDay) {
    dateLabel = uniqueClocks.length === 1 ? ` (*Hari ini • ${uniqueClocks[0]} WIB*)` : " (*Hari ini*)";
  } else if (uniqueClocks.length === 1) {
    dateLabel = ` (*${dayStr} • ${uniqueClocks[0]} WIB*)`;
  } else {
    dateLabel = ` (*${dayStr}*)`;
  }

  const touchedWalletIds = [...new Set(savedItems.map((s) => s.walletId).filter(Boolean))];
  const walletBalanceLines = touchedWalletIds
    .map((wid) => freshProfile.wallets.find((w) => w.id === wid))
    .filter(Boolean)
    .map((w) => `• Saldo ${walletEmoji(w)} *${w.name}*: *${formatRupiah(w.balance)}*`);

  const todayRem = updatedAnalytics.budget.todayRemaining;
  const todaySpentStr = formatRupiah(updatedAnalytics.budget.todaySpent);
  const safeDailyStr = formatRupiah(updatedAnalytics.budget.safeDailySpend);

  const hasIncome = savedItems.some((s) => s.type === "income");
  const hasDailyOrCreditExpense = savedItems.some((s) => {
    if (s.type === "income") return false;
    const w = freshProfile.wallets.find((x) => x.id === s.walletId);
    return !w || w.role === "daily" || w.role === "credit";
  });

  let footerNote = "";
  if (walletBalanceLines.length) {
    footerNote += `${walletBalanceLines.join("\n")}\n`;
  }
  if (hasIncome) {
    footerNote += `✨ Sisa dana harian bersih: *${formatRupiah(updatedAnalytics.budget.remainingBudget)}* (Jatah aman: ${safeDailyStr}/hari)`;
  } else if (isSameDay && hasDailyOrCreditExpense) {
    footerNote +=
      `• Total belanja harian hari ini: *${todaySpentStr}*\n` +
      (todayRem < 0
        ? `⚠️ _Jatah hari ini sudah minus ${formatRupiah(Math.abs(todayRem))}. Mohon kendalikan diri Tuan._`
        : `📉 Sisa jatah hari ini: *${formatRupiah(todayRem)}* (Jatah aman: ${safeDailyStr}/hari)`);
  } else {
    footerNote += `📉 Sisa dana harian bersih: *${formatRupiah(updatedAnalytics.budget.remainingBudget)}* (Jatah aman: ${safeDailyStr}/hari)`;
  }

  let replyMarkup = null;
  let switchHint = "";
  const unlockedWallets = (freshProfile.wallets || []).filter((w) => !w.locked);
  if (savedItems.length === 1 && unlockedWallets.length > 1) {
    const tx = savedItems[0];
    const otherWallets = unlockedWallets.filter(
      (w) => w.id !== tx.walletId && (tx.type !== "income" || w.role !== "credit")
    );
    if (otherWallets.length > 0) {
      const switchRows = [];
      for (let i = 0; i < otherWallets.length; i += 2) {
        switchRows.push(
          otherWallets.slice(i, i + 2).map((w) => ({
            text: `🔄 ${w.name}`,
            callback_data: `switch_wallet:${tx.id}:${w.id}`,
          }))
        );
      }
      replyMarkup = { inline_keyboard: switchRows };
      switchHint = `\n\n_Salah dana? Klik tombol di bawah untuk pindah:_`;
    }
  }

  const extraNotes = [
    settleDebtId ? "✅ _Status utang/piutang juga telah ditandai LUNAS._" : "",
    payBillId ? "✅ _Tagihan rutin ditandai LUNAS & jadwal maju ke siklus berikutnya._" : "",
  ]
    .filter(Boolean)
    .join("\n");

  const ack = `Siap Tuan, tercatat${dateLabel}:\n${lines.join("\n")}${extraNotes ? `\n${extraNotes}` : ""}\n\n${footerNote}${switchHint}`;
  await sendTelegramMessage(chatId, ack, threadId, replyMarkup);
  return savedItems;
}

async function processParsedTransactions(userId, chatId, threadId, items, profile, transactions, options = {}) {
  const { settleDebtId = null, payBillId = null, customPrompt = "" } = options;

  if (items.some((s) => s.timeKnown === false)) {
    await saveUserProfile(userId, {
      pendingPastExpense: { items, settleDebtId, payBillId, createdAt: new Date().toISOString() },
    });
    await sendPendingPastExpensePrompt(chatId, threadId, items);
    return { mode: "logger_pending_time", count: items.length };
  }

  const hasActiveWallets = (profile?.wallets || []).some((w) => !w.locked);
  const missingWallet = items.some((s) => !s.walletId);
  if (hasActiveWallets && missingWallet) {
    await saveUserProfile(userId, {
      pendingWalletSelection: { items, settleDebtId, payBillId, createdAt: new Date().toISOString() },
    });
    await sendWalletSelectionPrompt(chatId, threadId, items, profile, customPrompt);
    return { mode: "logger_pending_wallet", count: items.length };
  }

  const saved = await saveAndConfirmTransactions(userId, chatId, threadId, items, profile, transactions, {
    settleDebtId,
    payBillId,
  });
  return { mode: "logger_saved", count: saved.length };
}

export async function POST(req) {
  try {
    ensureBotCommands(BOT_TOKEN).catch(() => {});

    const body = await req.json();

    // ==========================================
    // HANDLE INLINE BUTTON CALLBACKS
    // ==========================================
    if (body.callback_query) {
      const cb = body.callback_query;
      const cbId = cb.id;
      const data = String(cb.data || "");
      const cbChatId = cb.message?.chat?.id;
      const cbThreadId = cb.message?.message_thread_id || null;
      const cbUserId = String(cb.from?.id || cbChatId);

      if (!isAllowedUser(cbUserId)) {
        await answerCallbackQuery(cbId, "Akses ditolak");
        return NextResponse.json({ ok: true });
      }

      // 1. Batal / Pilih Waktu Lampau
      if (data === "past_time:cancel") {
        await saveUserProfile(cbUserId, { pendingPastExpense: null });
        await answerCallbackQuery(cbId, "Catatan dibatalkan");
        await sendTelegramMessage(cbChatId, "Siap Tuan, catatan transaksi tertunda telah hamba batalkan.", cbThreadId);
        return NextResponse.json({ ok: true, mode: "pending_cancelled" });
      }

      if (data.startsWith("past_time:")) {
        const [hStr, mStr] = data.replace("past_time:", "").split(":");
        const hour = parseInt(hStr, 10);
        const minute = parseInt(mStr, 10) || 0;
        const [profile, transactions] = await Promise.all([
          getUserProfile(cbUserId),
          getTransactions(cbUserId, 200),
        ]);

        const settleDebtId = profile?.pendingPastExpense?.settleDebtId || null;
        const payBillId = profile?.pendingPastExpense?.payBillId || null;
        let pendingItems = profile?.pendingPastExpense?.items || [];
        if (pendingItems.length === 0) {
          const untimed = transactions.filter((t) => t.timeKnown === false && t.source !== "bank-saqu");
          if (untimed.length > 0) {
            const latestDay = toWibParts(untimed[0].createdAt);
            pendingItems = untimed.filter((t) => {
              const p = toWibParts(t.createdAt);
              return p.year === latestDay.year && p.month === latestDay.month && p.date === latestDay.date;
            });
          }
        }

        if (pendingItems.length === 0) {
          await answerCallbackQuery(cbId, "Tidak ada catatan tertunda");
          await sendTelegramMessage(cbChatId, "Maaf Tuan, tidak ada catatan tertunda.", cbThreadId);
          return NextResponse.json({ ok: true });
        }

        const resolved = pendingItems.map((it) => {
          if (it.timeKnown !== false) return it;
          const w = toWibParts(it.createdAt);
          return {
            ...it,
            createdAt: fromWib(w.year, w.month, w.date, hour, minute).toISOString(),
            timeKnown: true,
          };
        });

        await saveUserProfile(cbUserId, { pendingPastExpense: null });
        await answerCallbackQuery(cbId, "Waktu dicatat!");
        const res = await processParsedTransactions(cbUserId, cbChatId, cbThreadId, resolved, profile, transactions, {
          settleDebtId,
          payBillId,
        });
        return NextResponse.json({ ok: true, ...res });
      }

      // 2. Batal / Pilih Sumber Dana (Wallet Picker)
      if (data === "pick_wallet:cancel") {
        await saveUserProfile(cbUserId, { pendingWalletSelection: null });
        await clearInlineKeyboard(cbChatId, cb.message?.message_id);
        await answerCallbackQuery(cbId, "Dibatalkan");
        await sendTelegramMessage(cbChatId, "Siap Tuan, catatan transaksi telah hamba batalkan.", cbThreadId);
        return NextResponse.json({ ok: true, mode: "wallet_pick_cancelled" });
      }

      if (data.startsWith("pick_wallet:")) {
        const chosenId = data.replace("pick_wallet:", "");
        const [profile, transactions] = await Promise.all([
          getUserProfile(cbUserId),
          getTransactions(cbUserId, 200),
        ]);

        const pending = profile?.pendingWalletSelection;
        if (!pending?.items?.length && !pending?.transfers?.length) {
          await answerCallbackQuery(cbId, "Catatan sudah tersimpan / kedaluwarsa");
          return NextResponse.json({ ok: true });
        }

        const wallet = resolveWallet(profile, chosenId);
        if (!wallet) {
          await answerCallbackQuery(cbId, "Dompet tidak ditemukan");
          return NextResponse.json({ ok: true });
        }

        if (pending.mode === "transfer" && pending.transfers?.length) {
          const res = await completePendingTransferSelection(cbUserId, cbChatId, cbThreadId, pending, wallet, profile, transactions);
          if (res.sameWallet) {
            await answerCallbackQuery(cbId, "Dompet asal & tujuan sama");
            return NextResponse.json({ ok: true, mode: "transfer_wallet_collision" });
          }
          await clearInlineKeyboard(cbChatId, cb.message?.message_id);
          await answerCallbackQuery(cbId, "Transfer dicatat!");
          return NextResponse.json({ ok: true, mode: "transfer_wallet_picked", walletId: wallet.id });
        }

        const resolvedItems = pending.items.map((it) =>
          it.walletId ? it : { ...it, walletId: wallet.id, walletName: wallet.name, paymentMethod: wallet.name }
        );

        await clearInlineKeyboard(cbChatId, cb.message?.message_id);
        await answerCallbackQuery(cbId, `Masuk ke ${wallet.name}!`);
        await saveAndConfirmTransactions(cbUserId, cbChatId, cbThreadId, resolvedItems, profile, transactions, {
          settleDebtId: pending.settleDebtId || null,
          payBillId: pending.payBillId || null,
        });
        return NextResponse.json({ ok: true, mode: "wallet_picked_saved", walletId: wallet.id });
      }

      // 3. Pindah Sumber Dana 1-Tap
      if (data.startsWith("switch_wallet:")) {
        const [, txId, targetWalletId] = data.split(":");
        const result = await changeTransactionWallet(cbUserId, txId, targetWalletId);
        if (!result) {
          await answerCallbackQuery(cbId, "Transaksi/dompet tidak ditemukan");
          return NextResponse.json({ ok: true });
        }

        await answerCallbackQuery(cbId, `Dipindahkan ke ${result.wallet.name}!`);
        const summary = result.profile.wallets
          .filter((w) => !w.locked)
          .map((w) => `• ${walletEmoji(w)} *${w.name}*: ${formatRupiah(w.balance)}`)
          .join("\n");

        await sendTelegramMessage(
          cbChatId,
          `🔄 Siap Tuan, *${result.transaction.item}* (${formatRupiah(result.transaction.amount)}) dipindahkan ke *${result.wallet.name}*.\n\n*Saldo Terbaru:*\n${summary}`,
          cbThreadId
        );
        return NextResponse.json({ ok: true, mode: "wallet_switched" });
      }

      // 4. Audit Saldo: Terapkan / Batal
      if (data === "audit_cancel") {
        await saveUserProfile(cbUserId, { pendingAuditAdjustment: null });
        await answerCallbackQuery(cbId, "Saldo tidak diubah");
        await sendTelegramMessage(cbChatId, "Siap Tuan, saldo catatan dibiarkan apa adanya.", cbThreadId);
        return NextResponse.json({ ok: true, mode: "audit_cancelled" });
      }

      if (data === "audit_apply") {
        const profile = await getUserProfile(cbUserId);
        const pendingItems = profile?.pendingAuditAdjustment?.items || [];
        if (pendingItems.length === 0) {
          await answerCallbackQuery(cbId, "Tidak ada penyesuaian audit tertunda");
          return NextResponse.json({ ok: true });
        }
        const saved = await applyAuditBalances(cbUserId, pendingItems);
        await answerCallbackQuery(cbId, "Saldo disesuaikan!");
        const lines = pendingItems.map((it) => `• *${it.walletName}*: ${formatRupiah(it.actual)}`).join("\n");
        await sendTelegramMessage(
          cbChatId,
          `✅ Siap Tuan, saldo telah disesuaikan ke angka real:\n${lines}\n\n_Semua gap kini sudah 0._`,
          cbThreadId
        );
        return NextResponse.json({ ok: true, mode: "audit_applied", wallets: saved.wallets.length });
      }

      // 5. Reminder Action: Sudah Bayar Tagihan Tetap
      if (data.startsWith("pay_bill:")) {
        const fcId = data.replace("pay_bill:", "");
        const [profile, transactions] = await Promise.all([
          getUserProfile(cbUserId),
          getTransactions(cbUserId, 200),
        ]);
        const fc = findFixedCost(profile, fcId);
        if (!fc) {
          await answerCallbackQuery(cbId, "Tagihan tidak ditemukan");
          return NextResponse.json({ ok: true });
        }
        const payAmt = fc.isSinkingFund && (fc.cycleMonths || 1) > 1 ? fc.amount * fc.cycleMonths : fc.amount;
        const txItem = {
          type: "expense",
          amount: payAmt,
          item: `Bayar ${fc.name.split("(")[0].trim()}`,
          category: "Tagihan",
          intent: "NEED",
          walletId: "",
          walletName: "",
          createdAt: new Date().toISOString(),
          timeKnown: true,
          source: "telegram-bill",
        };
        await answerCallbackQuery(cbId, "Pilih dana pembayaran");
        await processParsedTransactions(cbUserId, cbChatId, cbThreadId, [txItem], profile, transactions, {
          payBillId: fc.id,
          customPrompt: `📌 *Bayar tagihan ${fc.name.split("(")[0].trim()} (${formatRupiah(payAmt)}) pakai dana mana, Tuan?*`,
        });
        return NextResponse.json({ ok: true, mode: "bill_pay_pick_wallet" });
      }

      // 6. Reminder Action: Lunasi Utang/Piutang 1-Tap
      if (data.startsWith("debt_lunas:")) {
        const debtId = data.replace("debt_lunas:", "");
        const [profile, transactions] = await Promise.all([
          getUserProfile(cbUserId),
          getTransactions(cbUserId, 200),
        ]);
        const debt = (profile.debts || []).find((d) => d.id === debtId && d.status !== "paid");
        if (!debt) {
          await answerCallbackQuery(cbId, "Utang/piutang sudah lunas atau tidak ditemukan");
          return NextResponse.json({ ok: true });
        }
        if (!debt.amount || debt.amount <= 0) {
          await answerCallbackQuery(cbId, "Sebutkan nominalnya dulu");
          await sendTelegramMessage(cbChatId, `Nominal *${debt.person}* belum diisi Tuan. Ketik misal: \`udah bayar ${debt.person} 50k pake cash\`.`, cbThreadId);
          return NextResponse.json({ ok: true });
        }

        const isPiutang = debt.type === "piutang";
        const txItem = {
          type: isPiutang ? "income" : "expense",
          amount: debt.amount,
          item: isPiutang ? `Pelunasan piutang ${debt.person}` : `Bayar utang ${debt.person}`,
          category: isPiutang ? "Pemasukan" : "Tagihan",
          intent: isPiutang ? "INCOME" : "NEED",
          walletId: "",
          walletName: "",
          createdAt: new Date().toISOString(),
          timeKnown: true,
          notes: debt.note || "",
          source: "telegram-debt",
        };
        await answerCallbackQuery(cbId, "Pilih sumber/tujuan dana");
        await processParsedTransactions(cbUserId, cbChatId, cbThreadId, [txItem], profile, transactions, {
          settleDebtId: debt.id,
          customPrompt: isPiutang
            ? `💚 *Pelunasan piutang ${debt.person} (${formatRupiah(debt.amount)}) masuk ke dana mana, Tuan?*`
            : `🔻 *Bayar utang ${debt.person} (${formatRupiah(debt.amount)}) pakai dana mana, Tuan?*`,
        });
        return NextResponse.json({ ok: true, mode: "debt_lunas_pick_wallet" });
      }

      // 7. Reminder Action: Snooze Utang/Piutang
      if (data.startsWith("debt_snooze:")) {
        const [, debtId, daysStr] = data.split(":");
        const days = Math.max(1, parseInt(daysStr, 10) || 3);
        const res = await snoozeDebt(cbUserId, debtId, days);
        if (!res) {
          await answerCallbackQuery(cbId, "Tidak ditemukan");
          return NextResponse.json({ ok: true });
        }
        await answerCallbackQuery(cbId, `Di-snooze ${days} hari`);
        await sendTelegramMessage(
          cbChatId,
          `⏰ Siap Tuan, pengingat *${res.debt.person}* ditunda *${days} hari* lagi.`,
          cbThreadId
        );
        return NextResponse.json({ ok: true, mode: "debt_snoozed" });
      }

      // 8. Split Bill Follow-up: Teman sudah bayar -> refund saldo dompet
      if (data.startsWith("split_refund:")) {
        const [, walletId, amtStr] = data.split(":");
        const amt = Math.round(Number(amtStr) || 0);
        if (!walletId || amt <= 0) {
          await answerCallbackQuery(cbId, "Data split tidak valid");
          return NextResponse.json({ ok: true });
        }
        const res = await adjustWalletBalance(cbUserId, walletId, amt);
        await clearInlineKeyboard(cbChatId, cb.message?.message_id);
        if (!res?.wallet) {
          await answerCallbackQuery(cbId, "Dompet tidak ditemukan");
          return NextResponse.json({ ok: true });
        }
        await answerCallbackQuery(cbId, `+${formatCompactRp(amt)} ke ${res.wallet.name}`);
        await sendTelegramMessage(
          cbChatId,
          `✅ Siap Tuan, patungan *+${formatRupiah(amt)}* dikembalikan ke ${walletEmoji(res.wallet)} *${res.wallet.name}*.\n• Saldo kini: *${formatRupiah(res.wallet.balance)}*`,
          cbThreadId
        );
        return NextResponse.json({ ok: true, mode: "split_refunded" });
      }

      // 9. Split Bill Follow-up: Teman belum bayar -> catat piutang otomatis
      if (data.startsWith("split_debt:")) {
        const [, txId, amtStr] = data.split(":");
        const amt = Math.round(Number(amtStr) || 0);
        if (amt <= 0) {
          await answerCallbackQuery(cbId, "Nominal tidak valid");
          return NextResponse.json({ ok: true });
        }
        const tx = txId ? await getTransactionById(cbUserId, txId) : null;
        const label = tx?.item ? `Patungan ${tx.item}` : "Patungan";
        const { debt } = await addDebt(cbUserId, {
          type: "piutang",
          person: label,
          amount: amt,
          note: tx ? `Split bill dari ${tx.item}` : "Split bill",
          targetWalletId: tx?.walletId || "",
        });
        await clearInlineKeyboard(cbChatId, cb.message?.message_id);
        await answerCallbackQuery(cbId, "Piutang patungan dicatat!");
        await sendTelegramMessage(
          cbChatId,
          `🧾 Siap Tuan, dicatat ke *Piutang*:\n• Nama: *${debt.person}*\n• Nominal: *${formatRupiah(debt.amount)}*`,
          cbThreadId
        );
        return NextResponse.json({ ok: true, mode: "split_debt_added" });
      }

      // 10. Split Bill Follow-up: Biarkan saldo tetap
      if (data === "split_ignore") {
        await clearInlineKeyboard(cbChatId, cb.message?.message_id);
        await answerCallbackQuery(cbId, "Saldo dibiarkan tetap");
        return NextResponse.json({ ok: true, mode: "split_ignored" });
      }

      await answerCallbackQuery(cbId);
      return NextResponse.json({ ok: true });
    }

    // ==========================================
    // HANDLE INCOMING MESSAGE
    // ==========================================
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

    // Web Dashboard request
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
      lower.includes("web dong") ||
      lower.includes("dashboard dong");

    if (isWebLoginRequest) {
      const token = await createLoginToken(userId);
      const baseUrl = appUrl();
      const loginUrl = `${baseUrl}/auth/verify?token=${token}`;

      const reply =
        `Siap Tuan, ini tautan langsung menuju Web Dashboard Tuan (berlaku 10 menit):\n\n` +
        `👉 [Buka Web Dashboard Diablo](${loginUrl})\n\n` +
        `_Silakan klik tombol di bawah untuk langsung membukanya._`;

      const markup = { inline_keyboard: [[{ text: "🔑 Buka Web Dashboard", url: loginUrl }]] };
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
      const isConfigured = profile && (profile.monthlyIncome > 0 || (profile.wallets || []).length > 0);
      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;

      if (!isConfigured) {
        const welcome =
          `*Kukuku... Selamat datang, Tuan. Hamba Diablo, pelayan finansial pribadi Tuan.*\n\n` +
          `Pundi-pundi Tuan belum dikonfigurasi. Klik tombol di bawah untuk mulai mengatur.`;
        await sendTelegramMessage(chatId, welcome, threadId, {
          inline_keyboard: [[{ text: "⚙️ Atur Pundi-pundi Sekarang", url: loginUrl }]],
        });
        return NextResponse.json({ ok: true });
      }

      const welcome =
        `*Siap Tuan. Hamba Diablo, pelayan setia pundi-pundi Tuan.*\n\n` +
        `Tuan cukup chat santai dengan bahasa sehari-hari:\n` +
        `• *Catat Keluar/Masuk:* \`makan siang 15k\` atau \`dapet duit 50k dari ngamen\` → muncul tombol pilih dana!\n` +
        `• *Langsung Kurangi Dana:* \`kopi 15k pake cash\` atau \`beli barang 200k pake spaylater\`.\n` +
        `• *Bayar SPayLater / Pindah Dana:* \`bayar spaylater 500k dari bni\` atau \`tarik tunai 200k dari bni ke cash\`.\n` +
        `• *Cek Surplus & Audit Saldo:* \`/saldo\`, atau \`audit bni 35k cash 273k saqu 1.313jt\`.\n` +
        `• *Reminder Tagihan & Utang:* \`/reminder\`, \`/utang\`, atau \`udah bayar spotify 30k pake bni\`.\n` +
        `• *Analisis & Batal:* \`/rekap\`, \`/analisis\`, \`/undo\`.`;

      await sendTelegramMessage(chatId, welcome, threadId, {
        inline_keyboard: [[{ text: "🔑 Buka Web Dashboard", url: loginUrl }]],
      });
      return NextResponse.json({ ok: true });
    }

    // Command: /undo atau batal
    const isUndoRequest =
      text === "/undo" ||
      text.startsWith("/undo@") ||
      /^(?:tolong\s+)?(?:undo|batal(?:in|kan)?|hapus\s+transaksi\s+terakhir|salah\s+catat)(?:\s+(?:dong|ya|aja|barusan))?$/i.test(lower);

    if (isUndoRequest) {
      if (profile?.pendingWalletSelection?.items?.length || profile?.pendingPastExpense?.items?.length || profile?.pendingAuditAdjustment) {
        await saveUserProfile(userId, { pendingPastExpense: null, pendingWalletSelection: null, pendingAuditAdjustment: null });
        await sendTelegramMessage(chatId, "Siap Tuan, aksi tertunda telah hamba batalkan.", threadId);
        return NextResponse.json({ ok: true, mode: "pending_cancelled" });
      }
      const removed = await undoLastTransaction(userId);
      const reply = removed
        ? `Siap Tuan. Catatan terakhir (*${removed.item}* - ${formatRupiah(removed.amount)}${removed.walletName ? ` • ${removed.walletName}` : ""}) telah dibatalkan & saldo dikembalikan.`
        : `Maaf Tuan, tidak ada transaksi yang bisa dibatalkan.`;
      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true, mode: "undo_done" });
    }

    // Command: /nabung
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
          `Siap Tuan. Format menabung:\n\`nabung <nama pos> <nominal>\`\n\nPos tabungan Tuan saat ini:\n${potsList || "- Belum ada pos"}`,
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
          `Maaf Tuan, pos tabungan "${potName}" tidak ditemukan.\nPos tersedia: ${available || "Belum ada"}.`,
          threadId
        );
        return NextResponse.json({ ok: true });
      }

      const pot = result.pot;
      const pct = pot.target > 0 ? Math.min(100, Math.round((pot.saved / pot.target) * 100)) : 0;
      await sendTelegramMessage(
        chatId,
        `💰 *Setoran Tabungan Berhasil!*\n• Pos: *${pot.name}*\n• Setoran: *+${formatRupiah(amount)}*\n• Terkumpul: *${formatRupiah(pot.saved)}* / ${formatRupiah(pot.target)} (${pct}%)`,
        threadId
      );
      return NextResponse.json({ ok: true });
    }

    // Command: /reset
    const isResetRequest =
      text === "/reset" ||
      text.startsWith("/reset@") ||
      lower.includes("hapus semua data") ||
      lower.includes("hapus semua riwayat");

    if (isResetRequest) {
      await clearUserData(userId);
      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;
      await sendTelegramMessage(
        chatId,
        `Siap Tuan. Seluruh data telah dibersihkan. Atur ulang lewat \`gajiku 8jt 25\` atau [Web Dashboard](${loginUrl}).`,
        threadId,
        { inline_keyboard: [[{ text: "⚙️ Atur Pundi-pundi", url: loginUrl }]] }
      );
      return NextResponse.json({ ok: true, mode: "reset_done" });
    }

    // Command: /setgaji
    const isSetGajiCmd = lower.startsWith("/setgaji");
    const naturalGajiMatch = text.match(/^(?:atur\s+|set\s+)?(?:gaji|budget|pendapatan|penghasilan)(?:ku)?\s+([\d.,]+)\s*(jt|juta|rb|ribu|k)?(?:\s+(?:tanggal|tgl)?\s*(\d{1,2}))?$/i);

    if (isSetGajiCmd || naturalGajiMatch) {
      const match = isSetGajiCmd
        ? text.replace(/^\/setgaji(?:@\S+)?\s*/i, "").trim().match(/^([\d.,]+)\s*(jt|juta|rb|ribu|k)?(?:\s+(\d{1,2}))?/i)
        : naturalGajiMatch;

      if (!match) {
        await sendTelegramMessage(chatId, `Format: \`gajiku <nominal> <tgl_gajian>\``, threadId);
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
        `Siap Tuan. Pendapatan diperbarui menjadi *${formatRupiah(updated.monthlyIncome)}* (Gajian tanggal *${updated.paydayDate}*).`,
        threadId
      );
      return NextResponse.json({ ok: true });
    }

    // WAJIB KONFIGURASI
    const isConfigured = profile && (Number(profile.monthlyIncome) > 0 || (profile.wallets || []).length > 0);
    if (!isConfigured) {
      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;
      await sendTelegramMessage(
        chatId,
        `⚠️ *Pundi-pundi Tuan Belum Dikonfigurasi!*\nAtur di [Web Dashboard](${loginUrl}) atau ketik \`/setgaji 8jt 25\`.`,
        threadId,
        { inline_keyboard: [[{ text: "⚙️ Atur Pundi-pundi Sekarang", url: loginUrl }]] }
      );
      return NextResponse.json({ ok: true, note: "Unconfigured user blocked" });
    }

    const transactions = await getTransactions(userId, 250);
    const analytics = computeAnalytics(profile, transactions);

    // Tangkap balasan teks NAMA DANA jika ada pendingWalletSelection yang sedang menunggu
    if ((profile?.pendingWalletSelection?.items?.length || profile?.pendingWalletSelection?.transfers?.length) && !hasNominal && !photos) {
      const matchedWallet = resolveWallet(profile, text.replace(/^(?:pake|pakai|masuk(?:\s+ke)?|ke|dari)\s+/i, "").trim());
      if (matchedWallet) {
        const pending = profile.pendingWalletSelection;
        if (pending.mode === "transfer" && pending.transfers?.length) {
          await completePendingTransferSelection(userId, chatId, threadId, pending, matchedWallet, profile, transactions);
          return NextResponse.json({ ok: true, mode: "transfer_wallet_text_saved", walletId: matchedWallet.id });
        }
        const resolvedItems = pending.items.map((it) =>
          it.walletId ? it : { ...it, walletId: matchedWallet.id, walletName: matchedWallet.name, paymentMethod: matchedWallet.name }
        );
        await saveAndConfirmTransactions(userId, chatId, threadId, resolvedItems, profile, transactions, {
          settleDebtId: pending.settleDebtId || null,
          payBillId: pending.payBillId || null,
        });
        return NextResponse.json({ ok: true, mode: "wallet_text_reply_saved", walletId: matchedWallet.id });
      }
    }

    // Tangkap balasan jam/waktu untuk catatan tanggal lampau yang tertunda
    const isTimeReplyCandidate =
      !hasNominal &&
      !photos &&
      hasTimeHint(text) &&
      !lower.includes("?") &&
      !lower.includes("berapa") &&
      !lower.includes("boros") &&
      !lower.includes("keluar") &&
      !lower.includes("habis") &&
      !lower.includes("rekap") &&
      !lower.includes("analisis");

    if (isTimeReplyCandidate) {
      const settleDebtId = profile?.pendingPastExpense?.settleDebtId || null;
      const payBillId = profile?.pendingPastExpense?.payBillId || null;
      let pendingItems = profile?.pendingPastExpense?.items || [];
      if (pendingItems.length > 0) {
        const updatedItems = applyTimeReplyToPendingItems(pendingItems, text);
        if (updatedItems.some((it) => it.timeKnown === false)) {
          await saveUserProfile(userId, {
            pendingPastExpense: { items: updatedItems, settleDebtId, payBillId, createdAt: new Date().toISOString() },
          });
          await sendPendingPastExpensePrompt(chatId, threadId, updatedItems);
          return NextResponse.json({ ok: true, mode: "pending_time_partial" });
        }
        await saveUserProfile(userId, { pendingPastExpense: null });
        const res = await processParsedTransactions(userId, chatId, threadId, updatedItems, profile, transactions, {
          settleDebtId,
          payBillId,
        });
        return NextResponse.json({ ok: true, ...res });
      }
    }

    // Command: /saldo atau /surplus
    if (
      text === "/saldo" ||
      text.startsWith("/saldo@") ||
      text === "/surplus" ||
      text.startsWith("/surplus@") ||
      lower === "saldo" ||
      lower === "cek saldo" ||
      lower === "cek surplus" ||
      lower === "surplus" ||
      lower === "cek dana" ||
      lower === "dompet"
    ) {
      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;
      await sendTelegramMessage(chatId, buildWalletSummaryText(profile, analytics), threadId, {
        inline_keyboard: [[{ text: "🔑 Buka Web Dashboard", url: loginUrl }]],
      });
      return NextResponse.json({ ok: true, mode: "fast_saldo_query" });
    }

    // Command: /reminder atau /tagihan
    if (
      text === "/reminder" ||
      text.startsWith("/reminder@") ||
      text === "/tagihan" ||
      text.startsWith("/tagihan@") ||
      lower === "reminder" ||
      lower === "cek reminder" ||
      lower === "cek tagihan" ||
      lower === "tagihan" ||
      lower === "tagihan bulanan"
    ) {
      const { text: remText, replyMarkup } = buildReminderTelegramMessage(profile, analytics, { onlyUrgent: false });
      await sendTelegramMessage(chatId, remText, threadId, replyMarkup);
      return NextResponse.json({ ok: true, mode: "fast_reminder_query" });
    }

    // Command: /utang
    if (
      text === "/utang" ||
      text.startsWith("/utang@") ||
      text === "/piutang" ||
      text.startsWith("/piutang@") ||
      lower === "utang" ||
      lower === "piutang" ||
      lower === "utang piutang" ||
      lower === "cek utang" ||
      lower === "cek piutang" ||
      lower === "cek utang piutang"
    ) {
      await sendTelegramMessage(chatId, buildDebtsListText(profile), threadId);
      return NextResponse.json({ ok: true, mode: "fast_debts_query" });
    }

    // Command: /audit (petunjuk jika tanpa angka)
    if (text === "/audit" || text.startsWith("/audit@")) {
      const guide =
        `🔍 *Audit Saldo (Cek Surplus / Gap)*\n\n` +
        `Cukup ketik saldo asli di HP Tuan sekarang, contoh:\n` +
        `\`audit bni 35k cash 273k saqu 1.313jt spaylater 0\`\n\n` +
        `Diablo akan langsung membandingkan saldo catatan vs saldo real dan menampilkan surplus/minus tiap dana.`;
      await sendTelegramMessage(chatId, guide, threadId);
      return NextResponse.json({ ok: true, mode: "audit_guide" });
    }

    // Command: /rekap
    const isRekapRequest =
      text === "/rekap" ||
      text.startsWith("/rekap@") ||
      lower === "rekap" ||
      lower === "rekap dong" ||
      lower === "cek rekap" ||
      lower === "laporan" ||
      lower === "status keuangan";

    if (isRekapRequest) {
      const rem = formatRupiah(analytics.budget.remainingBudget);
      const safeDaily = formatRupiah(analytics.budget.safeDailySpend);
      const todaySpent = formatRupiah(analytics.budget.todaySpent);
      const totalIncome = analytics.budget.totalIncomeCycle || 0;
      const days = analytics.cycle.daysRemaining;

      const walletLines = (profile.wallets || [])
        .map((w) => `• ${walletEmoji(w)} ${w.name}: *${formatRupiah(w.balance)}*`)
        .join("\n");

      const incomeLine = totalIncome > 0 ? `• Pemasukan Siklus Ini: *+${formatRupiah(totalIncome)}*\n` : "";
      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;

      const rekap =
        `📜 *Status Pundi-pundi (${days} Hari ke Gajian)*\n\n` +
        `• Sisa Dana Harian Bersih: *${rem}*\n` +
        `• Jatah Aman Harian: *${safeDaily}/hari*\n` +
        `• Pengeluaran Hari Ini: *${todaySpent}*\n` +
        incomeLine +
        `• Needs vs Wants: *${analytics.leakDetector.needsPercent}% vs ${analytics.leakDetector.wantsPercent}%*\n\n` +
        (walletLines ? `*Rincian Sumber Dana:*\n${walletLines}\n\n` : "") +
        `_${analytics.message}_`;

      await sendTelegramMessage(chatId, rekap, threadId, {
        inline_keyboard: [[{ text: "🔑 Buka Web Dashboard", url: loginUrl }]],
      });
      return NextResponse.json({ ok: true });
    }

    // Command: /analisis
    const isAnalysisRequest =
      text === "/analisis" ||
      text.startsWith("/analisis@") ||
      text === "/analysis" ||
      text === "/report" ||
      lower === "analisis" ||
      lower.includes("analisis ku") ||
      lower.includes("analisis dong") ||
      lower.includes("paling boros di mana") ||
      lower.includes("paling boros dimana") ||
      lower.includes("evaluasi keuangan");

    if (isAnalysisRequest) {
      const rem = formatRupiah(analytics.budget.remainingBudget);
      const safeDaily = formatRupiah(analytics.budget.safeDailySpend);
      const days = analytics.cycle.daysRemaining;
      const spent = formatRupiah(analytics.budget.spent);
      const statusIcon = analytics.status === "AMAN" ? "🟢" : analytics.status === "HATI_HATI" ? "🟡" : "🔴";

      const topCatLines = (analytics.categories || [])
        .slice(0, 4)
        .map((c) => `• ${c.category}: *${formatRupiah(c.spent)}* (${c.percent}%)`)
        .join("\n");

      const varLines = (analytics.variableAverages || [])
        .filter((v) => v.total > 0)
        .map((v) => `• ${v.label}: rata-rata *${formatRupiah(v.avgMonthly)}/bln*`)
        .join("\n");

      const token = await createLoginToken(userId);
      const loginUrl = `${appUrl()}/auth/verify?token=${token}`;

      const reply =
        `📊 *Laporan Analisis Finansial Tuan*\n\n` +
        `${statusIcon} *Status: ${analytics.status}*\n` +
        `_${analytics.message}_\n\n` +
        `💰 *Siklus (${days} Hari ke Gajian)*\n` +
        `• Sisa Dana Harian Bersih: *${rem}*\n` +
        `• Terpakai Harian: *${spent}*\n` +
        `• Jatah Aman: *${safeDaily}/hari*\n\n` +
        `🛍️ *Kategori Terbesar:*\n${topCatLines || "• _Belum ada pengeluaran._"}` +
        (varLines ? `\n\n⚡ *Rata-rata Rutin Variabel:*\n${varLines}` : "") +
        `\n\n👉 [Buka Visual Web Dashboard Tuan](${loginUrl})`;

      await sendTelegramMessage(chatId, reply, threadId, {
        inline_keyboard: [[{ text: "🔑 Buka Web Dashboard Lengkap", url: loginUrl }]],
      });
      return NextResponse.json({ ok: true, mode: "fast_analysis_query" });
    }

    // Foto Struk / QRIS / Mutasi
    if (photos && photos.length > 0) {
      try {
        const largestPhoto = photos[photos.length - 1];
        const base64 = await fetchTelegramPhotoBase64(largestPhoto.file_id);
        const items = (await parseReceiptImage(base64, "image/jpeg", text, profile.wallets || [])).map((it) => ({
          ...it,
          source: "telegram-photo",
        }));

        const transferItems = items.filter((it) => it.type === "transfer" && Number(it.amount) > 0);
        const regularItems = items.filter((it) => it.type !== "transfer");

        let latestProfile = profile;
        if (transferItems.length > 0) {
          const trLines = [];
          for (const tr of transferItems) {
            const trRes = await transferBetweenWallets(
              userId,
              tr.fromWalletId || "saqu",
              tr.toWalletId || "saqu_booster",
              tr.amount
            );
            if (!trRes.error) {
              latestProfile = trRes.profile;
              trLines.push(
                `• ${walletEmoji(trRes.fromWallet)} *${trRes.fromWallet.name}* → ${walletEmoji(trRes.toWallet)} *${trRes.toWallet.name}*: *${formatRupiah(trRes.amount)}*`
              );
            }
          }
          if (trLines.length > 0) {
            await sendTelegramMessage(
              chatId,
              `🔁 *Transfer Internal Terdeteksi dari Mutasi* _(bukan pengeluaran)_:\n${trLines.join("\n")}`,
              threadId
            );
          }
        }

        if (regularItems.length > 0) {
          const res = await processParsedTransactions(userId, chatId, threadId, regularItems, latestProfile, transactions);
          return NextResponse.json({ ok: true, ...res, transfers: transferItems.length });
        }
        return NextResponse.json({ ok: true, mode: "photo_transfer_done", count: transferItems.length });
      } catch (err) {
        await sendTelegramMessage(chatId, `Maaf Tuan, struk gagal dibaca: ${err.message}`, threadId);
        return NextResponse.json({ ok: true });
      }
    }

    // Fast Queries: Kemarin / Hari ini / Gajian / Jam boros
    const isPastQuery =
      !hasNominal &&
      (lower.includes("kemarin") || lower.includes("kemaren") || lower.includes("tgl ") || lower.includes("tanggal ")) &&
      (lower.includes("keluar") || lower.includes("habis") || lower.includes("berapa") || lower.includes("belanja") || lower.includes("rekap"));

    if (isPastQuery) {
      const { date: targetDate } = parseNaturalDate(text);
      const startOfDay = startOfWibDay(targetDate);
      const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
      const dayTxs = transactions.filter((t) => {
        const d = new Date(t.createdAt);
        return d >= startOfDay && d < endOfDay;
      });
      const daySpent = dayTxs.filter((t) => (t.type || "expense") !== "income").reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const dateName = targetDate.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
      const lines = dayTxs.map((t) => `• ${t.type === "income" ? "💚 +" : ""}*${t.item}*: ${formatRupiah(t.amount)} (${t.walletName || t.category})`).join("\n");
      const reply = dayTxs.length === 0
        ? `Pada *${dateName}*, Tuan tidak mencatat transaksi.`
        : `📊 *Transaksi ${dateName}*\n${lines}\n\n• Total Keluar: *${formatRupiah(daySpent)}*`;
      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true, mode: "fast_past_query" });
    }

    const isTodayQuery =
      !hasNominal &&
      ((lower.includes("hari ini") && (lower.includes("keluar") || lower.includes("habis") || lower.includes("berapa") || lower.includes("belanja"))) ||
        lower.includes("udah keluar berapa") ||
        lower.includes("pengeluaran hari ini"));

    if (isTodayQuery) {
      const startOfToday = startOfWibDay(new Date());
      const todayTxs = transactions.filter((t) => new Date(t.createdAt) >= startOfToday);
      const lines = todayTxs.map((t) => `• ${t.type === "income" ? "💚 +" : ""}*${t.item}*: ${formatRupiah(t.amount)} (${t.walletName || t.category})`).join("\n");
      const reply = todayTxs.length === 0
        ? `Hari ini Tuan belum mencatat transaksi. Jatah aman: *${formatRupiah(analytics.budget.safeDailySpend)}*.`
        : `📊 *Transaksi Hari Ini*\n${lines}\n\n• Total Keluar: *${formatRupiah(analytics.budget.todaySpent)}*\n• Sisa Jatah Hari Ini: *${formatRupiah(analytics.budget.todayRemaining)}*`;
      await sendTelegramMessage(chatId, reply, threadId);
      return NextResponse.json({ ok: true, mode: "fast_today_query" });
    }

    // ==========================================
    // SMART LLM UNIFIED ROUTER
    // ==========================================
    const analysis = await analyzeUserMessage(text, profile, transactions, messageTime);

    // 1. EXECUTE_OPS (Multi-op: Transfers + Catat Transaksi + Batch Utang/Piutang + Edit/Split/Hapus Transaksi Lama)
    if (analysis.action === "EXECUTE_OPS") {
      const debtUpdates = Array.isArray(analysis.debtUpdates) ? analysis.debtUpdates : [];
      const txEdits = Array.isArray(analysis.txEdits) ? analysis.txEdits : [];
      const newTxs = Array.isArray(analysis.transactions) ? analysis.transactions : [];
      const rawTransfers = Array.isArray(analysis.transfers)
        ? analysis.transfers.filter((t) => Number(t?.amount) > 0)
        : [];

      // Kasus khusus: 1 pelunasan utang/piutang saja -> pakai alur wallet picker interaktif
      if (debtUpdates.length === 1 && debtUpdates[0]?.op === "settle" && txEdits.length === 0 && newTxs.length === 0 && rawTransfers.length === 0) {
        const d = debtUpdates[0];
        const matched = findOpenDebt(profile, d.person, d.type);
        if (!matched) {
          await sendTelegramMessage(chatId, `Tidak ditemukan utang/piutang terbuka atas nama *${d.person}*.\n\n${buildDebtsListText(profile)}`, threadId);
          return NextResponse.json({ ok: true, mode: "debt_settle_not_found" });
        }
        const finalAmount = d.amount > 0 ? d.amount : matched.amount;
        if (!finalAmount || finalAmount <= 0) {
          await sendTelegramMessage(chatId, `Nominal *${matched.person}* belum diisi Tuan. Sebutkan nominalnya juga ya.`, threadId);
          return NextResponse.json({ ok: true, mode: "debt_settle_need_amount" });
        }
        const isPiutang = matched.type === "piutang";
        const explicitW = (d.walletId || matched.targetWalletId) ? resolveWallet(profile, d.walletId || matched.targetWalletId) : null;
        const txItem = {
          type: isPiutang ? "income" : "expense",
          amount: finalAmount,
          item: isPiutang ? `Pelunasan piutang ${matched.person}` : `Bayar utang ${matched.person}`,
          category: isPiutang ? "Pemasukan" : "Tagihan",
          intent: isPiutang ? "INCOME" : "NEED",
          walletId: explicitW?.id || "",
          walletName: explicitW?.name || "",
          paymentMethod: explicitW?.name || "QRIS",
          createdAt: messageTime.toISOString(),
          timeKnown: true,
          notes: matched.note || "",
          source: "telegram-debt",
        };
        const res = await processParsedTransactions(userId, chatId, threadId, [txItem], profile, transactions, {
          settleDebtId: matched.id,
          customPrompt: isPiutang
            ? `💚 *Pelunasan piutang ${matched.person} masuk ke dana mana, Tuan?*`
            : `🔻 *Bayar utang ${matched.person} pakai dana mana, Tuan?*`,
        });
        return NextResponse.json({ ok: true, ...res });
      }

      let curProfile = profile;
      const summaryLines = [];
      const splitButtons = [];

      // 1a-pre. Pisahkan transfers yang sudah lengkap vs menunggu pilihan dompet
      const readyTransfers = [];
      const pendingTransfers = [];
      for (const tr of rawTransfers) {
        const fromW = tr.fromWalletId ? resolveWallet(curProfile, tr.fromWalletId) : null;
        const toW = tr.toWalletId ? resolveWallet(curProfile, tr.toWalletId) : null;
        const fromId = fromW?.id || "";
        const toId = toW?.id || "";
        if (fromId && toId) {
          if (fromId === toId) {
            summaryLines.push(`⚠️ Dompet asal dan tujuan sama (*${fromW.name}*).`);
          } else {
            readyTransfers.push({ fromWalletId: fromId, toWalletId: toId, amount: tr.amount, note: tr.note || "" });
          }
        } else if (fromId || toId) {
          pendingTransfers.push({ fromWalletId: fromId, toWalletId: toId, amount: tr.amount, note: tr.note || "" });
        }
      }

      if (
        readyTransfers.length > 0 &&
        pendingTransfers.length === 0 &&
        debtUpdates.length === 0 &&
        txEdits.length === 0 &&
        newTxs.length === 0
      ) {
        await executeAndConfirmTransfers(userId, chatId, threadId, readyTransfers);
        return NextResponse.json({ ok: true, mode: "transfer_done", count: readyTransfers.length });
      }

      if (readyTransfers.length > 0) {
        for (const tr of readyTransfers) {
          const res = await transferBetweenWallets(userId, tr.fromWalletId, tr.toWalletId, tr.amount);
          if (res.error) {
            summaryLines.push(`⚠️ Pindah dana gagal: ${res.error}`);
          } else {
            curProfile = res.profile;
            summaryLines.push(
              `🔁 *${res.fromWallet.name}* → *${res.toWallet.name}*: *${formatRupiah(res.amount)}*${tr.note ? ` _(${tr.note})_` : ""}`
            );
          }
        }
      }

      // 1a. Proses batch debtUpdates (upsert / settle / delete)
      for (const d of debtUpdates) {
        if (!d?.person) continue;
        const op = String(d.op || "upsert").toLowerCase();
        if (op === "delete") {
          const matched = findOpenDebt(curProfile, d.person, d.type);
          if (matched) {
            curProfile = await deleteDebt(userId, matched.id);
            summaryLines.push(`🗑️ Hapus ${matched.type} *${matched.person}* (${matched.amount ? formatRupiah(matched.amount) : "?"})`);
          } else {
            summaryLines.push(`⚠️ ${d.type || "Utang/piutang"} *${d.person}* tidak ditemukan.`);
          }
        } else if (op === "settle") {
          const matched = findOpenDebt(curProfile, d.person, d.type);
          if (matched) {
            const payAmt = d.amount > 0 ? d.amount : matched.amount;
            const settled = await updateDebt(userId, matched.id, { status: "paid" });
            if (settled?.profile) curProfile = settled.profile;
            const explicitW = d.walletId ? resolveWallet(curProfile, d.walletId) : null;
            if (explicitW && payAmt > 0) {
              const isPiutang = matched.type === "piutang";
              await addTransaction(userId, {
                type: isPiutang ? "income" : "expense",
                amount: payAmt,
                item: isPiutang ? `Pelunasan piutang ${matched.person}` : `Bayar utang ${matched.person}`,
                category: isPiutang ? "Pemasukan" : "Tagihan",
                intent: isPiutang ? "INCOME" : "NEED",
                walletId: explicitW.id,
                walletName: explicitW.name,
                paymentMethod: explicitW.name,
                createdAt: messageTime.toISOString(),
                source: "telegram-debt",
              });
              curProfile = await getUserProfile(userId);
              summaryLines.push(`✅ Lunas ${matched.type} *${matched.person}* (${formatRupiah(payAmt)} • ${explicitW.name})`);
            } else {
              summaryLines.push(`✅ Lunas ${matched.type} *${matched.person}* (${payAmt ? formatRupiah(payAmt) : "?"})`);
            }
          } else {
            summaryLines.push(`⚠️ ${d.type || "Utang/piutang"} *${d.person}* tidak ditemukan.`);
          }
        } else {
          const amt = d.amountUnknown || !d.amount || d.amount <= 0 ? null : d.amount;
          const res = await upsertDebt(userId, {
            type: d.type || "utang",
            person: d.person,
            amount: amt,
            note: d.note || "",
            targetWalletId: d.walletId || "",
            additive: op === "add",
          });
          curProfile = res.profile;
          const tag = res.debt.type === "piutang" ? "🟢 Piutang" : "🔴 Utang";
          const nextStr = res.debt.amount === null ? "_nominal ?_" : `*${formatRupiah(res.debt.amount)}*`;
          if (res.mode === "added_amount") {
            const prevStr = res.prevAmount === null ? "Rp 0" : formatRupiah(res.prevAmount);
            summaryLines.push(`${tag} *${res.debt.person}*: ${prevStr} + ${formatRupiah(res.addedAmount)} → ${nextStr}`);
          } else if (res.mode === "updated") {
            const prevStr = res.prevAmount === null ? "?" : formatRupiah(res.prevAmount);
            summaryLines.push(`${tag} *${res.debt.person}*: ${prevStr} → ${nextStr}`);
          } else if (res.mode === "unchanged") {
            summaryLines.push(`${tag} *${res.debt.person}*: tetap ${nextStr}`);
          } else {
            summaryLines.push(`${tag} *${res.debt.person}*: ${nextStr} _(baru)_`);
          }
        }
      }

      // 1b. Proses txEdits (edit nominal / split bill / pindah dompet / hapus transaksi lama)
      for (const e of txEdits) {
        const targetTx = findTransaction(transactions, e.txId) || findTransaction(transactions, e.itemQuery);
        if (!targetTx) {
          summaryLines.push(`⚠️ Transaksi "${e.itemQuery || e.txId || "?"}" tidak ditemukan di riwayat terbaru.`);
          continue;
        }
        const op = String(e.op || "edit").toLowerCase();
        if (op === "delete") {
          await deleteTransaction(userId, targetTx.id, { revertWallet: true });
          summaryLines.push(
            `🗑️ Hapus *${targetTx.item}* (${formatRupiah(targetTx.amount)}${targetTx.walletName ? ` • saldo ${targetTx.walletName} dikembalikan` : ""})`
          );
        } else if (op === "change_wallet" && e.newWalletId) {
          const res = await changeTransactionWallet(userId, targetTx.id, e.newWalletId);
          if (res) {
            curProfile = res.profile;
            summaryLines.push(
              `🔄 Pindah dana *${res.transaction.item}* (${formatRupiah(res.transaction.amount)}): ${targetTx.walletName || "-"} → *${res.wallet.name}*`
            );
          } else {
            summaryLines.push(`⚠️ Dompet "${e.newWalletId}" tidak ditemukan untuk *${targetTx.item}*.`);
          }
        } else if (op === "split" && Number(e.newAmount) > 0) {
          const res = await editTransactionAmount(userId, targetTx.id, e.newAmount, {
            item: e.newItem || null,
            notes: e.note || `Bagi dua dari ${formatRupiah(targetTx.amount)}`,
            adjustWallet: false,
          });
          summaryLines.push(`✂️ Split *${targetTx.item}*: ${formatRupiah(res.oldAmount)} → *${formatRupiah(res.newAmount)}* _(porsi Tuan)_`);
          if (res.diff > 0) {
            summaryLines.push(
              `   ↳ Selisih *${formatRupiah(res.diff)}* belum mengubah saldo ${targetTx.walletName || "dompet"} — pilih status patungannya:`
            );
            if (targetTx.walletId) {
              splitButtons.push([
                {
                  text: `✅ Udah dibayar (+${formatRupiah(res.diff)} → ${targetTx.walletName || targetTx.walletId})`,
                  callback_data: `split_refund:${targetTx.walletId}:${res.diff}`,
                },
              ]);
            }
            splitButtons.push([
              {
                text: `🧾 Belum bayar (Catat Piutang ${formatRupiah(res.diff)})`,
                callback_data: `split_debt:${targetTx.id}:${res.diff}`,
              },
            ]);
            splitButtons.push([{ text: "👌 Biarkan Saldo Tetap", callback_data: "split_ignore" }]);
          }
        } else if (Number(e.newAmount) > 0) {
          const res = await editTransactionAmount(userId, targetTx.id, e.newAmount, {
            item: e.newItem || null,
            notes: e.note || null,
            adjustWallet: true,
          });
          summaryLines.push(
            `✏️ Revisi *${res.transaction.item}*: ${formatRupiah(res.oldAmount)} → *${formatRupiah(res.newAmount)}*${targetTx.walletName ? ` _(saldo ${targetTx.walletName} disesuaikan)_` : ""}`
          );
        }
      }

      if (summaryLines.length > 0) {
        await sendTelegramMessage(
          chatId,
          `✅ *Siap Tuan, perubahan sudah hamba catat:*\n\n${summaryLines.join("\n")}`,
          threadId,
          splitButtons.length ? { inline_keyboard: splitButtons } : null
        );
      }

      if (pendingTransfers.length > 0) {
        const latestProfile = summaryLines.length > 0 ? await getUserProfile(userId) : curProfile;
        const latestTxs = summaryLines.length > 0 ? await getTransactions(userId, 250) : transactions;
        let pendingItems = [];
        let activeProfile = latestProfile;

        if (newTxs.length > 0) {
          const allReady = newTxs.every((s) => s.walletId && s.timeKnown !== false);
          if (allReady) {
            await saveAndConfirmTransactions(userId, chatId, threadId, newTxs, latestProfile, latestTxs);
            activeProfile = await getUserProfile(userId);
          } else {
            pendingItems = newTxs;
          }
        }

        await saveUserProfile(userId, {
          pendingWalletSelection: {
            mode: "transfer",
            transfers: pendingTransfers,
            items: pendingItems,
            createdAt: new Date().toISOString(),
          },
        });
        await sendTransferWalletPrompt(chatId, threadId, pendingTransfers, activeProfile, pendingItems);
        return NextResponse.json({ ok: true, mode: "transfer_pending_wallet", count: pendingTransfers.length });
      }

      // 1c. Jika ada transaksi baru di pesan yang sama, catat sekalian
      if (newTxs.length > 0) {
        const latestProfile = summaryLines.length > 0 ? await getUserProfile(userId) : curProfile;
        const latestTxs = summaryLines.length > 0 ? await getTransactions(userId, 250) : transactions;
        const res = await processParsedTransactions(userId, chatId, threadId, newTxs, latestProfile, latestTxs);
        return NextResponse.json({
          ok: true,
          mode: "execute_ops",
          ...res,
          transfers: readyTransfers.length,
          debts: debtUpdates.length,
          edits: txEdits.length,
        });
      }

      return NextResponse.json({
        ok: true,
        mode: "execute_ops",
        transfers: readyTransfers.length,
        debts: debtUpdates.length,
        edits: txEdits.length,
      });
    }

    // 1d. Legacy fallback LOG_TRANSACTIONS
    if (analysis.action === "LOG_TRANSACTIONS" && Array.isArray(analysis.transactions) && analysis.transactions.length > 0) {
      const res = await processParsedTransactions(userId, chatId, threadId, analysis.transactions, profile, transactions);
      return NextResponse.json({ ok: true, ...res });
    }

    // 2. TRANSFER / BAYAR SPAYLATER
    if (analysis.action === "TRANSFER" && analysis.transfer?.amount > 0) {
      const tr = analysis.transfer;
      const fromW = tr.fromWalletId ? resolveWallet(profile, tr.fromWalletId) : null;
      const toW = tr.toWalletId ? resolveWallet(profile, tr.toWalletId) : null;
      if (!fromW || !toW) {
        if (fromW || toW) {
          const pendingTransfers = [
            {
              fromWalletId: fromW?.id || "",
              toWalletId: toW?.id || "",
              amount: tr.amount,
              note: tr.note || "",
            },
          ];
          await saveUserProfile(userId, {
            pendingWalletSelection: { mode: "transfer", transfers: pendingTransfers, items: [], createdAt: new Date().toISOString() },
          });
          await sendTransferWalletPrompt(chatId, threadId, pendingTransfers, profile);
          return NextResponse.json({ ok: true, mode: "transfer_pending_wallet", count: 1 });
        }
        await sendTelegramMessage(chatId, `Maaf Tuan, dompet asal/tujuan tidak ditemukan.`, threadId);
        return NextResponse.json({ ok: true, mode: "transfer_error" });
      }
      await executeAndConfirmTransfers(userId, chatId, threadId, [
        { fromWalletId: fromW.id, toWalletId: toW.id, amount: tr.amount, note: tr.note || "" },
      ]);
      return NextResponse.json({ ok: true, mode: "transfer_done" });
    }

    // 3. AUDIT_BALANCE (Cek Surplus / Gap Saldo Riil vs Catatan)
    if (analysis.action === "AUDIT_BALANCE" && Array.isArray(analysis.auditBalances) && analysis.auditBalances.length > 0) {
      const audit = computeAuditDiff(profile, analysis.auditBalances);
      if (audit.items.length === 0) {
        await sendTelegramMessage(chatId, `Maaf Tuan, nama dompet tidak dikenali untuk diaudit.`, threadId);
        return NextResponse.json({ ok: true, mode: "audit_empty" });
      }

      const lines = audit.items.map((it) => {
        const icon = it.diff === 0 ? "✅" : it.diff > 0 ? "🟢" : "🔴";
        const diffStr = it.diff === 0 ? "KLOP" : `${it.diff > 0 ? "Surplus +" : "Gap "}${formatRupiah(it.diff)}`;
        return `${icon} *${it.walletName}*: Catatan ${formatRupiah(it.recorded)} → Real *${formatRupiah(it.actual)}* _(${diffStr})_`;
      });

      const hasAnyDiff = audit.items.some((it) => it.diff !== 0);
      const totalLabel =
        audit.totalDiff === 0
          ? "✅ *Total 100% KLOP (Gap Rp 0)!*"
          : audit.totalDiff > 0
            ? `🟢 *Total Surplus:* *+${formatRupiah(audit.totalDiff)}*`
            : `🔴 *Total Gap / Minus:* *${formatRupiah(audit.totalDiff)}*`;

      let markup = null;
      if (hasAnyDiff) {
        await saveUserProfile(userId, {
          pendingAuditAdjustment: { items: audit.items, createdAt: new Date().toISOString() },
        });
        markup = {
          inline_keyboard: [
            [
              { text: "✅ Sesuaikan Saldo Sekarang", callback_data: "audit_apply" },
              { text: "❌ Biarkan Dulu", callback_data: "audit_cancel" },
            ],
          ],
        };
      }

      await sendTelegramMessage(
        chatId,
        `🔍 *Hasil Audit Saldo Tuan*\n\n${lines.join("\n")}\n\n${totalLabel}`,
        threadId,
        markup
      );
      return NextResponse.json({ ok: true, mode: "audit_result" });
    }

    // 4. BILL_PAID (Bayar Tagihan Tetap Rutin)
    if (analysis.action === "BILL_PAID" && analysis.billPayment?.billName) {
      const bp = analysis.billPayment;
      const fc = findFixedCost(profile, bp.billName);
      if (!fc) {
        await sendTelegramMessage(chatId, `Maaf Tuan, tagihan rutin "${bp.billName}" tidak ditemukan di daftar fixed costs.`, threadId);
        return NextResponse.json({ ok: true, mode: "bill_not_found" });
      }
      const payAmt = bp.amount > 0 ? bp.amount : (fc.isSinkingFund && (fc.cycleMonths || 1) > 1 ? fc.amount * fc.cycleMonths : fc.amount);
      const explicitW = bp.walletId ? resolveWallet(profile, bp.walletId) : null;
      const txItem = {
        type: "expense",
        amount: payAmt,
        item: `Bayar ${fc.name.split("(")[0].trim()}`,
        category: "Tagihan",
        intent: "NEED",
        walletId: explicitW?.id || "",
        walletName: explicitW?.name || "",
        paymentMethod: explicitW?.name || "QRIS",
        createdAt: messageTime.toISOString(),
        timeKnown: true,
        source: "telegram-bill",
      };
      const res = await processParsedTransactions(userId, chatId, threadId, [txItem], profile, transactions, {
        payBillId: fc.id,
        customPrompt: `📌 *Bayar tagihan ${fc.name.split("(")[0].trim()} (${formatRupiah(payAmt)}) pakai dana mana, Tuan?*`,
      });
      return NextResponse.json({ ok: true, ...res });
    }

    // 5. BILL_QUERY (Cek Tagihan / Reminder / Surplus)
    if (analysis.action === "BILL_QUERY") {
      const { text: remText, replyMarkup } = buildReminderTelegramMessage(profile, analytics, { onlyUrgent: false });
      await sendTelegramMessage(chatId, remText, threadId, replyMarkup);
      return NextResponse.json({ ok: true, mode: "bill_query" });
    }

    // 6. DEBT_ADD
    if (analysis.action === "DEBT_ADD" && analysis.debt?.person) {
      const d = analysis.debt;
      const amt = d.amountUnknown || !d.amount || d.amount <= 0 ? null : d.amount;
      const { debt } = await addDebt(userId, {
        type: d.type || "utang",
        person: d.person,
        amount: amt,
        note: d.note || "",
        targetWalletId: d.walletId || "",
      });
      const label = debt.type === "piutang" ? "🟢 Piutang (Uang di Orang)" : "🔴 Utang Tuan";
      const amtText = debt.amount === null ? "_nominal belum jelas (?)_" : `*${formatRupiah(debt.amount)}*`;
      await sendTelegramMessage(
        chatId,
        `🧾 *Catatan ${label} Ditambahkan:*\n• Nama: *${debt.person}*\n• Nominal: ${amtText}${debt.note ? `\n• Catatan: ${debt.note}` : ""}`,
        threadId
      );
      return NextResponse.json({ ok: true, mode: "debt_added" });
    }

    // 7. DEBT_UPDATE
    if (analysis.action === "DEBT_UPDATE" && analysis.debt?.person) {
      const d = analysis.debt;
      const matched = findOpenDebt(profile, d.person, d.type);
      if (!matched) {
        await sendTelegramMessage(chatId, `Tidak ditemukan utang/piutang terbuka atas nama *${d.person}*.\n\n${buildDebtsListText(profile)}`, threadId);
        return NextResponse.json({ ok: true, mode: "debt_not_found" });
      }
      const nextAmt = d.amount > 0 ? d.amount : matched.amount;
      const updated = await updateDebt(userId, matched.id, { amount: nextAmt, ...(d.note ? { note: d.note } : {}) });
      await sendTelegramMessage(
        chatId,
        `✅ Catatan ${updated.debt.type} *${updated.debt.person}* diperbarui menjadi *${updated.debt.amount === null ? "?" : formatRupiah(updated.debt.amount)}*.`,
        threadId
      );
      return NextResponse.json({ ok: true, mode: "debt_updated" });
    }

    // 8. DEBT_SETTLE
    if (analysis.action === "DEBT_SETTLE" && analysis.debt?.person) {
      const d = analysis.debt;
      const matched = findOpenDebt(profile, d.person, d.type);
      if (!matched) {
        await sendTelegramMessage(chatId, `Tidak ditemukan utang/piutang terbuka atas nama *${d.person}*.\n\n${buildDebtsListText(profile)}`, threadId);
        return NextResponse.json({ ok: true, mode: "debt_settle_not_found" });
      }
      const finalAmount = d.amount > 0 ? d.amount : matched.amount;
      if (!finalAmount || finalAmount <= 0) {
        await sendTelegramMessage(chatId, `Nominal *${matched.person}* belum diisi Tuan. Sebutkan nominalnya juga ya.`, threadId);
        return NextResponse.json({ ok: true, mode: "debt_settle_need_amount" });
      }

      const isPiutang = matched.type === "piutang";
      const explicitW = (d.walletId || matched.targetWalletId) ? resolveWallet(profile, d.walletId || matched.targetWalletId) : null;
      const txItem = {
        type: isPiutang ? "income" : "expense",
        amount: finalAmount,
        item: isPiutang ? `Pelunasan piutang ${matched.person}` : `Bayar utang ${matched.person}`,
        category: isPiutang ? "Pemasukan" : "Tagihan",
        intent: isPiutang ? "INCOME" : "NEED",
        walletId: explicitW?.id || "",
        walletName: explicitW?.name || "",
        paymentMethod: explicitW?.name || "QRIS",
        createdAt: messageTime.toISOString(),
        timeKnown: true,
        notes: matched.note || "",
        source: "telegram-debt",
      };

      const res = await processParsedTransactions(userId, chatId, threadId, [txItem], profile, transactions, {
        settleDebtId: matched.id,
        customPrompt: isPiutang
          ? `💚 *Pelunasan piutang ${matched.person} masuk ke dana mana, Tuan?*`
          : `🔻 *Bayar utang ${matched.person} pakai dana mana, Tuan?*`,
      });
      return NextResponse.json({ ok: true, ...res });
    }

    // 9. DEBT_QUERY
    if (analysis.action === "DEBT_QUERY") {
      await sendTelegramMessage(chatId, buildDebtsListText(profile), threadId);
      return NextResponse.json({ ok: true, mode: "debt_query" });
    }

    // 10. WALLET_QUERY
    if (analysis.action === "WALLET_QUERY") {
      const wq = analysis.walletQuery || {};
      const targetW = wq.walletId ? resolveWallet(profile, wq.walletId) : null;
      if (targetW) {
        await sendTelegramMessage(chatId, buildWalletHistoryText(targetW, transactions), threadId);
        return NextResponse.json({ ok: true, mode: "wallet_history_query" });
      }
      await sendTelegramMessage(chatId, buildWalletSummaryText(profile, analytics), threadId);
      return NextResponse.json({ ok: true, mode: "wallet_all_query" });
    }

    // 11. ADVISOR
    const cleanQuestion = text.replace(/^\/(?:tanya|ask|advisor)\s*/i, "").trim();
    const advResult = await askFinancialAdvisor(cleanQuestion, profile, analytics, transactions);
    await addAdvisorHistory(userId, { question: cleanQuestion, reply: advResult.reply, verdict: advResult.verdict });
    await sendTelegramMessage(chatId, advResult.reply, threadId);
    return NextResponse.json({ ok: true, mode: "advisor" });
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

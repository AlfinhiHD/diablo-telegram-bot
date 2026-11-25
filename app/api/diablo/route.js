import { NextResponse } from "next/server";
import {
  getUserProfile,
  saveUserProfile,
  getTransactions,
  addTransaction,
  toggleTransactionIntent,
  changeTransactionWallet,
  undoLastTransaction,
  deleteTransaction,
  computeAnalytics,
  getAdvisorHistory,
  addAdvisorHistory,
  addToPot,
  resolveWallet,
  transferBetweenWallets,
  applyAuditBalances,
  markFixedCostPaid,
  addDebt,
  updateDebt,
  snoozeDebt,
  deleteDebt,
  adjustDebtAmount,
  simplifyDebts,
} from "@/lib/store";
import { parseExpenseMessage, parseReceiptImage, askFinancialAdvisor } from "@/lib/diablo-ai";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { readSession } from "@/lib/auth";

function resolveUserId(req, fallbackBodyUserId = null) {
  const sessionUid = readSession(req);
  if (sessionUid) return sessionUid;

  // Development convenience fallback only
  if (process.env.NODE_ENV !== "production") {
    const urlUid = req.nextUrl.searchParams.get("userId");
    if (urlUid) return urlUid;
    if (fallbackBodyUserId) return fallbackBodyUserId;
  }
  return null;
}

export async function GET(req) {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Sesi tidak valid atau telah berakhir." }, { status: 401 });
    }

    const [profile, transactions, advisorHistory] = await Promise.all([
      getUserProfile(userId),
      getTransactions(userId, 300),
      getAdvisorHistory(userId, 30),
    ]);

    if (String(userId) === "1128526190") {
      if (!profile.ownerName) profile.ownerName = "Alfin";
      if (!profile.telegramUsername) profile.telegramUsername = "nocelestial14";
    }
    if (!profile.ownerName && profile.telegramName) {
      profile.ownerName = profile.telegramName;
    }

    const analytics = computeAnalytics(profile, transactions);

    const systemStatus = {
      isFirebase: isFirebaseConfigured(),
      isGemini: Boolean(process.env.GEMINI_API_KEY),
      isTelegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    };

    return NextResponse.json({
      userId,
      profile,
      transactions,
      advisorHistory,
      analytics,
      systemStatus,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const userId = resolveUserId(req, body.userId);
    if (!userId) {
      return NextResponse.json({ error: "Sesi tidak valid atau telah berakhir." }, { status: 401 });
    }

    const action = body.action;

    if (action === "update_profile") {
      const updated = await saveUserProfile(userId, body.profile);
      return NextResponse.json({ ok: true, profile: updated });
    }

    if (action === "update_wallets") {
      const wallets = Array.isArray(body.wallets) ? body.wallets : [];
      const updated = await saveUserProfile(userId, { wallets });
      return NextResponse.json({ ok: true, profile: updated });
    }

    if (action === "transfer_wallet") {
      const res = await transferBetweenWallets(userId, body.fromWalletId, body.toWalletId, body.amount);
      if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === "audit_apply") {
      const items = Array.isArray(body.items) ? body.items : [];
      const updated = await applyAuditBalances(userId, items);
      return NextResponse.json({ ok: true, profile: updated });
    }

    if (action === "pay_bill") {
      const res = await markFixedCostPaid(userId, body.billId, {
        walletId: body.walletId || "",
        amount: body.amount,
        logTx: body.logTx !== false,
      });
      if (!res) return NextResponse.json({ error: "Tagihan tidak ditemukan" }, { status: 404 });
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === "snooze_debt") {
      const res = await snoozeDebt(userId, body.debtId, body.days || 3);
      if (!res) return NextResponse.json({ error: "Utang/piutang tidak ditemukan" }, { status: 404 });
      return NextResponse.json({ ok: true, ...res });
    }

    if (action === "add_to_pot") {
      const { potId, name, amount } = body;
      const result = await addToPot(userId, { id: potId, name }, Number(amount) || 0);
      if (!result.pot) {
        return NextResponse.json({ error: "Pos tabungan tidak ditemukan" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, pot: result.pot, pots: result.pots });
    }

    if (action === "update_pots") {
      const pots = Array.isArray(body.pots) ? body.pots : [];
      const updated = await saveUserProfile(userId, { savingsPots: pots });
      return NextResponse.json({ ok: true, profile: updated });
    }

    if (action === "add_debt") {
      const result = await addDebt(userId, {
        type: body.type || "utang",
        person: body.person,
        amount: body.amount,
        note: body.note || "",
        targetWalletId: body.targetWalletId || "",
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "update_debt") {
      const result = await updateDebt(userId, body.debtId, body.patch || {});
      if (!result) return NextResponse.json({ error: "Catatan utang/piutang tidak ditemukan" }, { status: 404 });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "simplify_debts") {
      const result = await simplifyDebts(userId);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "adjust_debt") {
      const result = await adjustDebtAmount(userId, body.debtId, {
        delta: body.delta,
        reason: body.reason || "",
      });
      if (!result) return NextResponse.json({ error: "Catatan utang/piutang tidak ditemukan" }, { status: 404 });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "settle_debt") {
      const profile = await getUserProfile(userId);
      const debt = (profile.debts || []).find((d) => d.id === body.debtId);
      if (!debt) return NextResponse.json({ error: "Catatan utang/piutang tidak ditemukan" }, { status: 404 });
      if (debt.status === "paid") {
        return NextResponse.json({ error: "Catatan ini sudah dilunasi" }, { status: 400 });
      }

      const prevAmount = Number(debt.amount) || 0;
      const finalAmount = Number(body.amount) > 0 ? Number(body.amount) : prevAmount;
      const wallet = body.walletId ? resolveWallet(profile, body.walletId) : null;
      const isPartial = prevAmount > 0 && finalAmount > 0 && finalAmount < prevAmount;

      if (isPartial) {
        const remaining = prevAmount - finalAmount;
        const stepNote = `− Bayar Rp ${Math.round(finalAmount).toLocaleString("id-ID")}`;
        const nextNote = debt.note
          ? `${debt.note} ${stepNote}`
          : `Rp ${Math.round(prevAmount).toLocaleString("id-ID")} ${stepNote}`;
        await updateDebt(userId, debt.id, { amount: remaining, note: nextNote });
      } else {
        await updateDebt(userId, debt.id, {
          status: "paid",
          ...(finalAmount > 0 ? { amount: finalAmount } : {}),
          ...(wallet ? { targetWalletId: wallet.id } : {}),
        });
      }

      let tx = null;
      if (finalAmount > 0 && wallet) {
        const isPiutang = debt.type === "piutang";
        tx = await addTransaction(userId, {
          type: isPiutang ? "income" : "expense",
          amount: finalAmount,
          item: isPartial
            ? isPiutang
              ? `Cicil piutang ${debt.person}`
              : `Cicil utang ${debt.person}`
            : isPiutang
            ? `Pelunasan piutang ${debt.person}`
            : `Bayar utang ${debt.person}`,
          category: isPiutang ? "Pemasukan" : "Tagihan",
          intent: isPiutang ? "INCOME" : "NEED",
          walletId: wallet.id,
          walletName: wallet.name,
          paymentMethod: wallet.name,
          notes: debt.note || "",
          source: "web-debt",
        });
      }

      return NextResponse.json({ ok: true, partial: isPartial, transaction: tx });
    }

    if (action === "delete_debt") {
      const updated = await deleteDebt(userId, body.debtId);
      return NextResponse.json({ ok: true, profile: updated });
    }

    if (action === "log_expense" || action === "log_transaction") {
      const text = body.text || "";
      if (!text.trim()) return NextResponse.json({ error: "Teks kosong" }, { status: 400 });

      const profile = await getUserProfile(userId);
      const wallets = profile.wallets || [];
      const parsedItems = await parseExpenseMessage(text, new Date(), wallets);

      if (!parsedItems.length) {
        return NextResponse.json({ error: "Nominal tidak terdeteksi. Contoh: kopi 25k atau dapet 50k ngamen" }, { status: 400 });
      }
      if (!body.createdAt && parsedItems.some((it) => it.timeKnown === false)) {
        return NextResponse.json(
          {
            error:
              "Untuk catatan kemarin/tanggal lampau, wajib sertakan waktunya (misal: pagi, siang, sore, malem, atau jam 20.00) agar tidak ada data jam kosong.",
          },
          { status: 400 }
        );
      }

      const selectedWallet = body.walletId ? resolveWallet(profile, body.walletId) : null;
      const defaultDaily = wallets.find((w) => w.role === "daily" && !w.locked) || wallets[0] || null;

      const savedItems = [];
      for (const it of parsedItems) {
        const itemWallet = selectedWallet || (it.walletId ? resolveWallet(profile, it.walletId) : null) || defaultDaily;
        const res = await addTransaction(userId, {
          ...it,
          walletId: itemWallet?.id || "",
          walletName: itemWallet?.name || "",
          paymentMethod: itemWallet?.name || it.paymentMethod || "QRIS",
          createdAt: body.createdAt || it.createdAt || new Date().toISOString(),
          timeKnown: true,
          source: body.source || "web-chat",
        });
        savedItems.push(res);
      }
      return NextResponse.json({ ok: true, count: savedItems.length, items: savedItems });
    }

    if (action === "parse_receipt") {
      const { base64Data, mimeType, caption, walletId } = body;
      if (!base64Data) return NextResponse.json({ error: "Gambar struk tidak ditemukan" }, { status: 400 });

      const profile = await getUserProfile(userId);
      const wallets = profile.wallets || [];
      const parsedItems = await parseReceiptImage(base64Data, mimeType || "image/jpeg", caption || "", wallets);
      const selectedWallet = walletId ? resolveWallet(profile, walletId) : null;

      const savedItems = [];
      for (const it of parsedItems) {
        const w = selectedWallet || (it.walletId ? resolveWallet(profile, it.walletId) : null);
        const res = await addTransaction(userId, {
          ...it,
          walletId: w?.id || "",
          walletName: w?.name || "",
          source: "web-receipt",
        });
        savedItems.push(res);
      }
      return NextResponse.json({ ok: true, count: savedItems.length, items: savedItems });
    }

    if (action === "ask_advisor") {
      const question = body.question || "";
      if (!question.trim()) return NextResponse.json({ error: "Pertanyaan kosong" }, { status: 400 });

      const profile = await getUserProfile(userId);
      const transactions = await getTransactions(userId, 150);
      const analytics = computeAnalytics(profile, transactions);

      const advResult = await askFinancialAdvisor(question, profile, analytics, transactions);
      await addAdvisorHistory(userId, { question, reply: advResult.reply, verdict: advResult.verdict });

      return NextResponse.json({ ok: true, result: advResult });
    }

    if (action === "toggle_intent") {
      const updated = await toggleTransactionIntent(userId, body.txId);
      return NextResponse.json({ ok: true, transaction: updated });
    }

    if (action === "change_wallet") {
      const result = await changeTransactionWallet(userId, body.txId, body.walletId);
      if (!result) return NextResponse.json({ error: "Transaksi atau dompet tidak ditemukan" }, { status: 404 });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "undo_last") {
      const removed = await undoLastTransaction(userId);
      return NextResponse.json({ ok: true, removed });
    }

    if (action === "delete_tx") {
      await deleteTransaction(userId, body.txId);
      return NextResponse.json({ ok: true });
    }

    if (action === "set_webhook") {
      const token = body.botToken || process.env.TELEGRAM_BOT_TOKEN;
      const webhookUrl = body.webhookUrl;
      if (!token || !webhookUrl) {
        return NextResponse.json({ error: "Bot Token dan URL Webhook wajib diisi." }, { status: 400 });
      }
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const tgJson = await tgRes.json();
      if (!tgJson.ok) {
        return NextResponse.json({ error: tgJson.description || "Gagal menyetel webhook Telegram" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, description: tgJson.description });
    }

    return NextResponse.json({ error: "Aksi tidak dikenali" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

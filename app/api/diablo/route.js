import { NextResponse } from "next/server";
import {
  getUserProfile,
  saveUserProfile,
  getTransactions,
  addTransaction,
  toggleTransactionIntent,
  undoLastTransaction,
  deleteTransaction,
  computeAnalytics,
  getAdvisorHistory,
  addAdvisorHistory,
  addToPot,
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

    const profile = await getUserProfile(userId);
    const transactions = await getTransactions(userId, 250);
    const advisorHistory = await getAdvisorHistory(userId, 30);
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

    if (action === "log_expense") {
      const text = body.text || "";
      if (!text.trim()) return NextResponse.json({ error: "Teks kosong" }, { status: 400 });

      const parsedItems = await parseExpenseMessage(text);
      const customDate = body.createdAt || new Date().toISOString();
      const savedItems = [];
      for (const it of parsedItems) {
        const res = await addTransaction(userId, {
          ...it,
          createdAt: customDate,
          source: body.source || "web-chat",
        });
        savedItems.push(res);
      }
      return NextResponse.json({ ok: true, count: savedItems.length, items: savedItems });
    }

    if (action === "parse_receipt") {
      const { base64Data, mimeType, caption } = body;
      if (!base64Data) return NextResponse.json({ error: "Gambar struk tidak ditemukan" }, { status: 400 });

      const parsedItems = await parseReceiptImage(base64Data, mimeType || "image/jpeg", caption || "");
      const savedItems = [];
      for (const it of parsedItems) {
        const res = await addTransaction(userId, { ...it, source: "web-receipt" });
        savedItems.push(res);
      }
      return NextResponse.json({ ok: true, count: savedItems.length, items: savedItems });
    }

    if (action === "ask_advisor") {
      const question = body.question || "";
      if (!question.trim()) return NextResponse.json({ error: "Pertanyaan kosong" }, { status: 400 });

      const profile = await getUserProfile(userId);
      const transactions = await getTransactions(userId, 100);
      const analytics = computeAnalytics(profile, transactions);

      const advResult = await askFinancialAdvisor(question, profile, analytics, transactions);
      await addAdvisorHistory(userId, { question, reply: advResult.reply, verdict: advResult.verdict });

      return NextResponse.json({ ok: true, result: advResult });
    }

    if (action === "toggle_intent") {
      const updated = await toggleTransactionIntent(userId, body.txId);
      return NextResponse.json({ ok: true, transaction: updated });
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

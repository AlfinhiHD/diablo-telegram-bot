import { NextResponse } from "next/server";
import {
  listAllUserIds,
  getUserProfile,
  saveUserProfile,
  getTransactions,
  computeAnalytics,
} from "@/lib/store";
import { buildReminderTelegramMessage } from "@/lib/reminders-tg";
import { getConfig } from "@/lib/bundled-config";

async function sendTg(chatId, text, replyMarkup = null) {
  const token = getConfig("TELEGRAM_BOT_TOKEN") || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) return false;
  const payload = { chat_id: chatId, text, parse_mode: "Markdown" };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

function isAuthorizedCron(req) {
  // Vercel Cron mengirimkan header Authorization: Bearer <CRON_SECRET> atau x-vercel-cron: 1
  const cronSecret = process.env.CRON_SECRET || getConfig("CRON_SECRET") || "";
  if (cronSecret) {
    const auth = req.headers.get("authorization") || "";
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  if (req.headers.get("x-vercel-cron")) return true;
  if (process.env.NODE_ENV !== "production") return true;
  return !cronSecret;
}

export async function GET(req) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const force = req.nextUrl.searchParams.get("force") === "1";
    const userIds = await listAllUserIds();
    const results = [];

    for (const uid of userIds) {
      const [profile, transactions] = await Promise.all([
        getUserProfile(uid),
        getTransactions(uid, 200),
      ]);
      const analytics = computeAnalytics(profile, transactions);
      const rem = analytics.reminders;

      if (!force && profile.lastReminderDate === rem.todayKey) {
        results.push({ uid, skipped: "already_sent_today" });
        continue;
      }

      if (!force && !rem.hasUrgentCronAction) {
        results.push({ uid, skipped: "no_urgent_reminders" });
        continue;
      }

      const { text, replyMarkup, hasContent } = buildReminderTelegramMessage(profile, analytics, {
        onlyUrgent: !force,
      });

      if (!hasContent) {
        results.push({ uid, skipped: "empty" });
        continue;
      }

      const sent = await sendTg(uid, text, replyMarkup);
      if (sent) {
        await saveUserProfile(uid, { lastReminderDate: rem.todayKey });
      }
      results.push({ uid, sent });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("[Cron Reminders] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

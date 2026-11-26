import { formatRupiah } from "./format.js";

/**
 * Susun pesan Telegram Reminder + tombol inline interaktif (Tagihan Jatuh Tempo, SPayLater, Utang/Piutang Macet, Gajian/Surplus).
 * @param {object} profile
 * @param {object} analytics
 * @param {{ onlyUrgent?: boolean }} options
 */
export function buildReminderTelegramMessage(profile, analytics, options = {}) {
  const { onlyUrgent = false } = options;
  const rem = analytics?.reminders;
  if (!rem) return { text: "Tidak ada data reminder.", replyMarkup: null, hasContent: false };

  const sections = [];
  const buttons = [];

  // 1. Gajian Hari Ini (Tgl 25)
  if (rem.isPayday) {
    const activeBills = rem.upcomingBills.filter((b) => b.urgency !== "INACTIVE" && b.amount > 0);
    const billLines = activeBills
      .map((b) => `  • ${b.name}: *${formatRupiah(b.amount)}*`)
      .join("\n");
    sections.push(
      `🎉 *Hari Ini Gajian (Tgl ${profile?.paydayDate || 25})!*\n` +
      `Sisihkan dulu kewajiban tetap *${formatRupiah(rem.monthlyFixedNeeded)}* sebelum belanja:\n${billLines}`
    );
  }

  // 2. H-1 Gajian (Cek Surplus Siklus)
  if (rem.isPrePaydaySurplusCheck && rem.surplusDailyNow > 0) {
    sections.push(
      `✨ *Cek Surplus Akhir Siklus (Besok Gajian!)*\n` +
      `Sisa dana harian bersih: *+${formatRupiah(rem.surplusDailyNow)}*.\n` +
      `_Pertimbangkan pindahkan surplus ke Bank Saqu / Investasi setelah besok gajian._`
    );
  }

  // 3. Tagihan Tetap (Urgent untuk Cron, atau semua untuk /reminder)
  const billsToShow = onlyUrgent
    ? rem.urgentBills
    : rem.upcomingBills.filter((b) => b.amount > 0 || b.urgency === "INACTIVE");

  if (billsToShow.length > 0) {
    const lines = billsToShow.map((b) => {
      const icon = b.urgency === "OVERDUE" ? "🚨" : b.urgency === "TODAY" ? "🔔" : b.urgency === "SOON" ? "⏰" : b.urgency === "INACTIVE" ? "💤" : "📅";
      const amt = b.dueAmount > 0 ? formatRupiah(b.dueAmount) : "Lunas";
      return `${icon} *${b.name}*: ${amt} _(${b.dueLabel}${b.nextDueDate ? ` • ${b.nextDueDate}` : ""})_`;
    });
    sections.push(`📌 *Tagihan Tetap & Jadwal:*\n${lines.join("\n")}`);

    // Tombol cepat "Sudah Bayar" untuk tagihan yang sudah dekat / lewat
    for (const b of rem.urgentBills.slice(0, 3)) {
      const shortName = b.name.split("(")[0].trim().slice(0, 18);
      buttons.push([{ text: `✅ Sudah Bayar ${shortName}`, callback_data: `pay_bill:${b.id}` }]);
    }
  }

  // 4. Tagihan SPayLater Aktif
  if (rem.spayReminders.length > 0) {
    const spLines = rem.spayReminders
      .map((s) => `⚠️ *${s.name}*: belum lunas *${formatRupiah(s.unpaid)}*`)
      .join("\n");
    sections.push(`💳 *Tagihan PayLater Berjalan:*\n${spLines}`);
  }

  // 5. Utang & Piutang (overdue >= 3 hari untuk cron, atau semua open untuk /reminder)
  const debtsToShow = onlyUrgent ? rem.overdueDebts : rem.openDebts;
  if (debtsToShow.length > 0) {
    const dLines = debtsToShow.map((d) => {
      const icon = d.type === "utang" ? "🔴" : "🟢";
      const amtStr = d.amount === null ? "nominal ?" : `*${formatRupiah(d.amount)}*`;
      const ageStr = d.ageDays > 0 ? ` • ${d.ageDays} hari` : "";
      const snoozeStr = d.isSnoozed ? " _(snooze)_" : "";
      return `${icon} ${d.type === "utang" ? "Utang" : "Piutang"} *${d.person}*: ${amtStr}${ageStr}${snoozeStr}`;
    });
    sections.push(`🧾 *Utang & Piutang Belum Lunas (${debtsToShow.length}):*\n${dLines.join("\n")}`);

    for (const d of debtsToShow.filter((x) => !x.isSnoozed).slice(0, 3)) {
      buttons.push([
        { text: `✅ Lunas: ${d.person.slice(0, 14)}`, callback_data: `debt_lunas:${d.id}` },
        { text: `⏰ Snooze 3h`, callback_data: `debt_snooze:${d.id}:3` },
      ]);
    }
  }

  // 6. Piutang Cicilan Berjangka (jatuh tempo bulanan, misal tgl 27)
  const instToShow = onlyUrgent
    ? rem.urgentInstallments || []
    : rem.upcomingInstallments || [];
  if (instToShow.length > 0) {
    const iLines = instToShow.map((inst) => {
      const icon =
        inst.urgency === "OVERDUE"
          ? "🚨"
          : inst.urgency === "TODAY"
          ? "🔔"
          : inst.urgency === "SOON"
          ? "⏰"
          : "📆";
      const dueTxt = `${inst.dueLabel}${inst.nextDueDate ? ` • ${inst.nextDueDate}` : ""}`;
      const targetTxt = inst.targetWalletName ? ` → *${inst.targetWalletName}*` : "";
      return `${icon} *${inst.label || inst.person}*: *${formatRupiah(inst.monthlyAmount)}* (${inst.paidCount}/${inst.totalMonths} bln, sisa ${formatRupiah(inst.remaining)})${targetTxt} _(${dueTxt})_`;
    });
    sections.push(`📆 *Piutang Cicilan Bulanan:*\n${iLines.join("\n")}`);

    for (const inst of (rem.urgentInstallments || []).slice(0, 3)) {
      const shortName = (inst.label || inst.person || "Cicilan").slice(0, 18);
      buttons.push([
        {
          text: `✅ Terima Cicilan ${shortName}`,
          callback_data: `inst_pay:${inst.id}`,
        },
      ]);
    }
  }

  if (sections.length === 0) {
    return {
      text: `✨ *Semua Aman, Tuan!*\nTidak ada tagihan jatuh tempo dekat maupun utang/piutang yang mendesak saat ini.`,
      replyMarkup: null,
      hasContent: false,
    };
  }

  const title = onlyUrgent
    ? `🔔 *Pengingat Harian Diablo (${rem.todayKey})*`
    : `🔔 *Ringkasan Tagihan & Pengingat Diablo*`;

  return {
    text: `${title}\n\n${sections.join("\n\n")}`,
    replyMarkup: buttons.length > 0 ? { inline_keyboard: buttons } : null,
    hasContent: true,
  };
}

function compactAmt(n) {
  const abs = Math.abs(Math.round(Number(n) || 0));
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, "").replace(".", ",")}jt`;
  if (abs >= 1_000) return `${Math.round(abs / 1_000)}rb`;
  return String(abs);
}

/**
 * Susun pesan Telegram Checklist Bagi Gaji (Payday To-Do) + tombol 1-tap transfer/bayar & centang.
 */
export function buildPaydayChecklistTelegramMessage(profile, analytics, webUrl = "") {
  const pc = analytics?.paydayChecklist;
  if (!pc || !Array.isArray(pc.items) || pc.items.length === 0) {
    return {
      text: "Template checklist bagi gaji belum diatur Tuan. Atur dulu di menu *Tabungan* web.",
      replyMarkup: webUrl ? { inline_keyboard: [[{ text: "📋 Atur di Web", url: webUrl }]] } : null,
      hasContent: false,
    };
  }

  const lines = pc.items.map((it, idx) => {
    const icon = it.done ? "✅" : "⬜";
    const route =
      it.type === "transfer" && it.fromWalletName && it.toWalletName
        ? ` _(${it.fromWalletName} → ${it.toWalletName})_`
        : it.type === "bill" && it.fromWalletName
        ? ` _(${it.fromWalletName})_`
        : "";
    const noteStr = it.note ? `\n    ↳ _${it.note}_` : "";
    return `${idx + 1}. ${icon} *${it.label}*${route}: *${formatRupiah(it.amount)}*${noteStr}`;
  });

  const wishHint = pc.nearestWishlist
    ? `\n\n🛍️ *Wishlist Terdekat:* ${pc.nearestWishlist.name} (*${formatRupiah(pc.nearestWishlist.price)}*)`
    : "";

  const text =
    `💸 *Checklist Bagi Gaji (${pc.periodShort})*\n` +
    `🗓️ _${pc.periodRange}_ • Progres: *${pc.doneCount}/${pc.totalCount} selesai*\n\n` +
    `${lines.join("\n")}\n\n` +
    `• Gaji Rutinan: *${formatRupiah(pc.monthlyIncome)}*\n` +
    `• Total Alokasi: *${formatRupiah(pc.totalPlanned)}*\n` +
    `• Sisa Dana Harian: *${formatRupiah(pc.remainingForDaily)}* (~${formatRupiah(pc.dailyEstimate)}/hari)` +
    wishHint +
    `\n\n_Klik tombol di bawah setelah transfer di m-banking agar saldo dompet otomatis ikut tercatat:_`;

  const buttons = pc.items
    .filter((it) => !it.done)
    .slice(0, 6)
    .map((it) => [
      {
        text: `✅ ${it.label.slice(0, 22)} (${compactAmt(it.amount)})`,
        callback_data: `payday_done:${it.id}`,
      },
    ]);

  if (webUrl) {
    buttons.push([{ text: "📋 Buka Checklist di Web", url: webUrl }]);
  }

  return {
    text,
    replyMarkup: buttons.length > 0 ? { inline_keyboard: buttons } : null,
    hasContent: true,
  };
}

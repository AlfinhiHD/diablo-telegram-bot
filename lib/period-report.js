import { toWibParts, fromWib, startOfWibDay, formatRupiah } from "./format.js";

const FULL_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const DAY_MS = 86_400_000;

export const VARIABLE_BUCKETS = [
  { key: "kuota", label: "Kuota & Pulsa", re: /\b(?:kuota|pulsa|paket\s*data|happy\s*\d+gb)\b/i },
  { key: "listrik", label: "Listrik / PLN", re: /\b(?:listrik|token|pln)\b/i },
  { key: "bensin", label: "Bensin", re: /\b(?:bensin|pertamax|pertalite|shell|pertamina)\b/i },
  { key: "laundry", label: "Laundry", re: /\b(?:laundry|londri)\b/i },
  {
    key: "rokok",
    label: "Rokok",
    re: /\b(?:rokok|roko|udud|udut|sebat|vape|liquid|pods?|cartridge|sampoerna|marlboro|malboro|gudang\s*garam|surya|esse|camel|dunhill|djarum|la\s*(?:bold|ice|lights?)|magnum\s*(?:mild|filter|blue)|a\s*mild|class\s*mild|avolution|kretek|djisamsoe|samsu|gg\s*(?:mild|surya|signature|move)|garfit|garpit)\b/i,
  },
];

/**
 * Hitung rentang siklus gajian (WIB) untuk key "YYYY-MM" atau sebuah tanggal.
 * Jika payday >= 15 (misal 25), "2026-11" = Periode November 2026 (25 Okt - 25 Nov 2026).
 */
export function getCycleBounds(periodKeyOrDate = new Date(), paydayDate = 25) {
  const payday = Math.min(28, Math.max(1, Number(paydayDate) || 25));
  let start;
  let end;

  if (typeof periodKeyOrDate === "string" && /^\d{4}-\d{2}$/.test(periodKeyOrDate.trim())) {
    const [y, m1] = periodKeyOrDate.trim().split("-").map(Number);
    const m0 = m1 - 1;
    if (payday >= 15) {
      start = fromWib(y, m0 - 1, payday, 0, 0);
      end = fromWib(y, m0, payday, 0, 0);
    } else {
      start = fromWib(y, m0, payday, 0, 0);
      end = fromWib(y, m0 + 1, payday, 0, 0);
    }
  } else {
    const d = periodKeyOrDate instanceof Date ? periodKeyOrDate : new Date(periodKeyOrDate || Date.now());
    const safeDate = isNaN(d.getTime()) ? new Date() : d;
    const p = toWibParts(safeDate);
    const startMonth = p.date < payday ? p.month - 1 : p.month;
    start = fromWib(p.year, startMonth, payday, 0, 0);
    end = fromWib(p.year, startMonth + 1, payday, 0, 0);
  }

  const startP = toWibParts(start);
  const endP = toWibParts(end);
  const refP = payday >= 15 ? endP : startP;
  const key = `${refP.year}-${String(refP.month + 1).padStart(2, "0")}`;

  return {
    key,
    label: `Periode ${FULL_MONTHS[refP.month]} ${refP.year}`,
    shortLabel: `${SHORT_MONTHS[refP.month]} ${refP.year}`,
    rangeLabel: `${startP.date} ${SHORT_MONTHS[startP.month]} – ${endP.date} ${SHORT_MONTHS[endP.month]} ${endP.year}`,
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

/** Kurangi key periode "YYYY-MM" sebanyak 1 bulan. */
export function getPreviousPeriodKey(periodKey) {
  const [y, m1] = String(periodKey || "").split("-").map(Number);
  if (!y || !m1) return getCycleBounds(new Date()).key;
  const d = new Date(Date.UTC(y, m1 - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Daftar semua periode siklus yang tersedia (selalu menyertakan siklus aktif & siklus sebelumnya). */
export function listAvailablePeriods(transactions = [], paydayDate = 25, now = new Date()) {
  const curr = getCycleBounds(now, paydayDate);
  const prev = getCycleBounds(getPreviousPeriodKey(curr.key), paydayDate);
  const map = new Map();

  for (const seed of [curr, prev]) {
    map.set(seed.key, {
      key: seed.key,
      label: seed.label,
      shortLabel: seed.shortLabel,
      rangeLabel: seed.rangeLabel,
      startIso: seed.startIso,
      endIso: seed.endIso,
      isCurrent: seed.key === curr.key,
      txCount: 0,
      expenseCount: 0,
      totalExpense: 0,
      totalIncome: 0,
    });
  }

  for (const tx of transactions || []) {
    if (!tx?.createdAt) continue;
    const b = getCycleBounds(tx.createdAt, paydayDate);
    if (!map.has(b.key)) {
      map.set(b.key, {
        key: b.key,
        label: b.label,
        shortLabel: b.shortLabel,
        rangeLabel: b.rangeLabel,
        startIso: b.startIso,
        endIso: b.endIso,
        isCurrent: b.key === curr.key,
        txCount: 0,
        expenseCount: 0,
        totalExpense: 0,
        totalIncome: 0,
      });
    }
    const item = map.get(b.key);
    const amt = Number(tx.amount) || 0;
    item.txCount += 1;
    if (tx.type === "income") {
      item.totalIncome += amt;
    } else {
      item.expenseCount += 1;
      item.totalExpense += amt;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

/** Bangun laporan lengkap untuk 1 periode siklus (dashboard, halaman /laporan, CSV sheet, & Telegram). */
export function computePeriodReport(profile, transactions = [], periodKey = null, now = new Date()) {
  const payday = Math.min(28, Math.max(1, Number(profile?.paydayDate) || 25));
  const bounds = periodKey ? getCycleBounds(periodKey, payday) : getCycleBounds(now, payday);
  const isCurrent = now >= bounds.start && now < bounds.end;

  const totalDays = Math.max(1, Math.round((bounds.end - bounds.start) / DAY_MS));
  const daysElapsed = isCurrent
    ? Math.max(1, Math.ceil((now - bounds.start) / DAY_MS))
    : totalDays;
  const daysRemaining = isCurrent
    ? Math.max(1, Math.round((bounds.end - startOfWibDay(now)) / DAY_MS))
    : 0;

  const periodTx = (transactions || [])
    .filter((t) => {
      const d = new Date(t?.createdAt);
      return !isNaN(d.getTime()) && d >= bounds.start && d < bounds.end;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const expenses = periodTx.filter((t) => (t.type || "expense") !== "income");
  const incomes = periodTx.filter((t) => t.type === "income");

  const wallets = Array.isArray(profile?.wallets) ? profile.wallets : [];
  const dailyAndCreditIds = new Set(
    wallets.filter((w) => w.role === "daily" || w.role === "credit").map((w) => w.id)
  );
  const hasDailyWallets = wallets.some((w) => w.role === "daily");

  const totalIncome = incomes.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const totalExpense = expenses.reduce((a, t) => a + (Number(t.amount) || 0), 0);
  const dailyExpense = hasDailyWallets
    ? expenses
        .filter((t) => !t.walletId || dailyAndCreditIds.has(t.walletId))
        .reduce((a, t) => a + (Number(t.amount) || 0), 0)
    : totalExpense;

  const netCashflow = totalIncome - totalExpense;
  const avgDailyExpense = Math.round(totalExpense / daysElapsed);
  const expectedIncome = Number(profile?.monthlyIncome) || 0;
  const fixedTotal = (profile?.fixedCosts || []).reduce((a, c) => a + (Number(c.amount) || 0), 0);

  // Intents breakdown
  let needsTotal = 0;
  let wantsTotal = 0;
  let giftsTotal = 0;
  let assetsTotal = 0;
  const catMap = {};

  for (const t of expenses) {
    const amt = Number(t.amount) || 0;
    const cat = t.category || "Lainnya";
    if (!catMap[cat]) catMap[cat] = { category: cat, spent: 0, count: 0 };
    catMap[cat].spent += amt;
    catMap[cat].count += 1;

    const intent = String(t.intent || "WANT").toUpperCase();
    if (intent === "NEED") needsTotal += amt;
    else if (intent === "GIFT") giftsTotal += amt;
    else if (intent === "ASSET") assetsTotal += amt;
    else wantsTotal += amt;
  }

  const pct = (part) => (totalExpense > 0 ? Math.round((part / totalExpense) * 100) : 0);
  const wantsPercent = pct(wantsTotal);
  const giftsPercent = pct(giftsTotal);
  const assetsPercent = pct(assetsTotal);
  const needsPercent = totalExpense > 0 ? Math.max(0, 100 - wantsPercent - giftsPercent - assetsPercent) : 0;

  const categories = Object.values(catMap)
    .map((c) => ({ ...c, percent: pct(c.spent) }))
    .sort((a, b) => b.spent - a.spent);

  // Hourly spending pattern across all expenses in this period
  const slots = [
    { key: "diniHari", label: "Dini Hari", hours: "00:00 - 05:00", spent: 0, count: 0, percent: 0 },
    { key: "pagi", label: "Pagi", hours: "05:00 - 11:00", spent: 0, count: 0, percent: 0 },
    { key: "siang", label: "Siang", hours: "11:00 - 15:00", spent: 0, count: 0, percent: 0 },
    { key: "sore", label: "Sore", hours: "15:00 - 18:00", spent: 0, count: 0, percent: 0 },
    { key: "malam", label: "Malam", hours: "18:00 - 24:00", spent: 0, count: 0, percent: 0 },
  ];

  let timedSpent = 0;
  let untimedSpent = 0;
  let untimedCount = 0;

  for (const t of expenses) {
    const amt = Number(t.amount) || 0;
    if (t.timeKnown === false) {
      untimedSpent += amt;
      untimedCount += 1;
      continue;
    }
    timedSpent += amt;
    const hour = toWibParts(t.createdAt).hour;
    const idx = hour < 5 ? 0 : hour < 11 ? 1 : hour < 15 ? 2 : hour < 18 ? 3 : 4;
    slots[idx].spent += amt;
    slots[idx].count += 1;
  }

  for (const s of slots) {
    s.percent = timedSpent > 0 ? Math.round((s.spent / timedSpent) * 100) : 0;
  }
  const topSlot = [...slots].sort((a, b) => b.spent - a.spent)[0];
  const peakSlot = topSlot?.spent > 0 ? topSlot : null;

  // Per-wallet activity in this period
  const byWallet = wallets.map((w) => {
    const wTx = periodTx.filter((t) => t.walletId === w.id);
    const expenseTotal = wTx
      .filter((t) => (t.type || "expense") !== "income")
      .reduce((a, t) => a + (Number(t.amount) || 0), 0);
    const incomeTotal = wTx
      .filter((t) => t.type === "income")
      .reduce((a, t) => a + (Number(t.amount) || 0), 0);
    return {
      id: w.id,
      name: w.name,
      role: w.role,
      currentBalance: w.balance,
      expenseTotal,
      incomeTotal,
      txCount: wTx.length,
    };
  });

  // Top 5 largest expenses
  const topExpenses = [...expenses]
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
    .slice(0, 5);

  // Daily trend (WIB days)
  const dayMap = new Map();
  for (const t of periodTx) {
    const p = toWibParts(t.createdAt);
    const key = `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.date).padStart(2, "0")}`;
    if (!dayMap.has(key)) {
      dayMap.set(key, {
        dateKey: key,
        label: `${p.date} ${SHORT_MONTHS[p.month]}`,
        expense: 0,
        income: 0,
        count: 0,
      });
    }
    const row = dayMap.get(key);
    const amt = Number(t.amount) || 0;
    row.count += 1;
    if (t.type === "income") row.income += amt;
    else row.expense += amt;
  }
  const dailyTrend = Array.from(dayMap.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const peakDay =
    [...dailyTrend].filter((d) => d.expense > 0).sort((a, b) => b.expense - a.expense)[0] || null;

  // Variable routine breakdown
  const variableBreakdown = VARIABLE_BUCKETS.map((b) => {
    const matched = expenses.filter((t) => b.re.test(`${t.item || ""} ${t.notes || ""}`));
    const total = matched.reduce((a, t) => a + (Number(t.amount) || 0), 0);
    return { key: b.key, label: b.label, total, count: matched.length };
  });

  // Previous period comparison
  const prevKey = getPreviousPeriodKey(bounds.key);
  const prevBounds = getCycleBounds(prevKey, payday);
  const prevExpenses = (transactions || []).filter((t) => {
    if (t?.type === "income") return false;
    const d = new Date(t?.createdAt);
    return !isNaN(d.getTime()) && d >= prevBounds.start && d < prevBounds.end;
  });
  let comparison = null;
  if (prevExpenses.length > 0) {
    const prevExpense = prevExpenses.reduce((a, t) => a + (Number(t.amount) || 0), 0);
    const diff = totalExpense - prevExpense;
    const diffPercent = prevExpense > 0 ? Math.round((diff / prevExpense) * 100) : 0;
    comparison = {
      prevKey,
      prevLabel: prevBounds.shortLabel,
      prevExpense,
      diff,
      diffPercent,
    };
  }

  // Diagnostic insights
  const insights = [];
  if (expenses.length === 0 && incomes.length === 0) {
    insights.push("Belum ada transaksi tercatat pada periode ini.");
  } else {
    if (categories[0]) {
      insights.push(
        `Pos paling boros: ${categories[0].category} sebesar ${formatRupiah(categories[0].spent)} (${categories[0].percent}% dari pengeluaran).`
      );
    }
    if (totalExpense > 0) {
      if (wantsPercent > 30) {
        insights.push(
          `Porsi WANT cukup tinggi (${wantsPercent}% / ${formatRupiah(wantsTotal)}). Pertimbangkan rem jajan & keinginan siklus berikutnya.`
        );
      } else {
        insights.push(
          `Kontrol keinginan cukup terjaga: WANT ${wantsPercent}% (${formatRupiah(wantsTotal)}) dan NEED ${needsPercent}%.`
        );
      }
    }
    if (peakSlot) {
      insights.push(
        `Jam paling boros terjadi di waktu ${peakSlot.label} (${peakSlot.hours}) dengan total ${formatRupiah(peakSlot.spent)} (${peakSlot.percent}%).`
      );
    }
    if (peakDay) {
      insights.push(
        `Pengeluaran harian tertinggi pada ${peakDay.label}: ${formatRupiah(peakDay.expense)}.`
      );
    }
    if (comparison) {
      const dir = comparison.diff > 0 ? "naik" : comparison.diff < 0 ? "turun" : "sama dengan";
      insights.push(
        comparison.diff === 0
          ? `Total pengeluaran sama persis dengan periode ${comparison.prevLabel}.`
          : `Total pengeluaran ${dir} ${Math.abs(comparison.diffPercent)}% (${formatRupiah(Math.abs(comparison.diff))}) dibanding ${comparison.prevLabel}.`
      );
    }
  }

  return {
    period: {
      key: bounds.key,
      label: bounds.label,
      shortLabel: bounds.shortLabel,
      rangeLabel: bounds.rangeLabel,
      startIso: bounds.startIso,
      endIso: bounds.endIso,
      isCurrent,
      totalDays,
      daysElapsed,
      daysRemaining,
    },
    summary: {
      totalIncome,
      totalExpense,
      dailyExpense,
      netCashflow,
      txCount: periodTx.length,
      expenseCount: expenses.length,
      incomeCount: incomes.length,
      avgDailyExpense,
      expectedIncome,
      fixedTotal,
    },
    intents: {
      needsTotal,
      wantsTotal,
      giftsTotal,
      assetsTotal,
      needsPercent,
      wantsPercent,
      giftsPercent,
      assetsPercent,
    },
    categories,
    hourlyStats: {
      slots,
      peakSlot: peakSlot || { label: "Belum terdeteksi", hours: "-", spent: 0, percent: 0, count: 0 },
      untimedSpent,
      untimedCount,
    },
    byWallet,
    topExpenses,
    dailyTrend,
    peakDay,
    variableBreakdown,
    comparison,
    insights,
    transactions: periodTx,
  };
}

function csvEscape(val) {
  const s = String(val ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Generate UTF-8 BOM CSV compatible with Google Sheets & Microsoft Excel. */
export function buildPeriodCsv(report) {
  const rows = [];
  const push = (...cols) => rows.push(cols.map(csvEscape).join(","));

  push("LAPORAN KEUANGAN DIABLO FINANCE");
  push("Periode", report.period.label);
  push("Rentang Siklus", report.period.rangeLabel);
  push("Total Pemasukan", report.summary.totalIncome);
  push("Total Pengeluaran", report.summary.totalExpense);
  push("Arus Kas Bersih", report.summary.netCashflow);
  push("Rata-Rata Pengeluaran/Hari", report.summary.avgDailyExpense);
  push(
    "Kategori Paling Boros",
    report.categories[0] ? `${report.categories[0].category} (${report.categories[0].spent})` : "-"
  );
  push(
    "Jam Paling Boros",
    report.hourlyStats.peakSlot?.spent > 0
      ? `${report.hourlyStats.peakSlot.label} (${report.hourlyStats.peakSlot.hours})`
      : "-"
  );
  push("");

  push("RINGKASAN PER KATEGORI");
  push("Kategori", "Total (Rp)", "Jumlah Transaksi", "Persentase (%)");
  for (const c of report.categories) {
    push(c.category, c.spent, c.count, `${c.percent}%`);
  }
  push("");

  push("POLA JAM BELANJA");
  push("Slot Waktu", "Rentang Jam", "Total (Rp)", "Jumlah Transaksi", "Persentase (%)");
  for (const s of report.hourlyStats.slots) {
    push(s.label, s.hours, s.spent, s.count, `${s.percent}%`);
  }
  push("");

  push("DAFTAR TRANSAKSI");
  push("Tanggal WIB", "Jam WIB", "Tipe", "Item", "Kategori", "Status", "Sumber Dana", "Nominal (Rp)", "Catatan");
  for (const t of report.transactions) {
    const p = toWibParts(t.createdAt);
    const dateStr = `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.date).padStart(2, "0")}`;
    const timeStr =
      t.timeKnown === false
        ? "-"
        : `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
    const tipe = t.type === "income" ? "Pemasukan" : "Pengeluaran";
    push(
      dateStr,
      timeStr,
      tipe,
      t.item,
      t.category || "-",
      t.type === "income" ? "INCOME" : t.intent || "WANT",
      t.walletName || t.paymentMethod || "-",
      Number(t.amount) || 0,
      t.notes || ""
    );
  }

  return "\uFEFF" + rows.join("\r\n");
}

/** Susun pesan ringkas laporan periode untuk Telegram + tombol buka web / download sheet. */
export function buildPeriodTelegramReport(profile, report, webUrl = "") {
  const s = report.summary;
  const i = report.intents;
  const topCats = report.categories
    .slice(0, 3)
    .map((c, idx) => `${idx + 1}. *${c.category}*: ${formatRupiah(c.spent)} (${c.percent}%)`)
    .join("\n");
  const topItems = report.topExpenses
    .slice(0, 3)
    .map((t, idx) => `${idx + 1}. *${t.item}*: ${formatRupiah(t.amount)} _(${t.walletName || t.category})_`)
    .join("\n");

  const deltaLine = report.comparison
    ? `\n• vs ${report.comparison.prevLabel}: *${report.comparison.diff > 0 ? "+" : ""}${report.comparison.diffPercent}%* (${report.comparison.diff >= 0 ? "+" : "-"}${formatRupiah(Math.abs(report.comparison.diff))})`
    : "";

  const netSign = s.netCashflow >= 0 ? "+" : "-";
  const peakSlot = report.hourlyStats.peakSlot;
  const peakSlotLine =
    peakSlot && peakSlot.spent > 0
      ? `⏰ *Jam Paling Boros:* ${peakSlot.label} (${peakSlot.hours}) — *${formatRupiah(peakSlot.spent)}* (${peakSlot.percent}%)`
      : "";
  const peakDayLine = report.peakDay
    ? `📅 *Hari Terboros:* ${report.peakDay.label} — *${formatRupiah(report.peakDay.expense)}*`
    : "";

  const mainInsight = report.insights[0] ? `\n\n💡 _${report.insights[0]}_` : "";

  const text =
    `📊 *Laporan ${report.period.label}*\n` +
    `🗓️ _${report.period.rangeLabel}_\n\n` +
    `💰 *Ringkasan Arus Kas (${s.txCount} transaksi)*\n` +
    `• Pemasukan: *+${formatRupiah(s.totalIncome)}*\n` +
    `• Pengeluaran: *${formatRupiah(s.totalExpense)}*\n` +
    `• Arus Kas Bersih: *${netSign}${formatRupiah(Math.abs(s.netCashflow))}*\n` +
    `• Rata-rata/Hari: *${formatRupiah(s.avgDailyExpense)}*` +
    deltaLine +
    `\n\n🎯 *Komposisi Pengeluaran*\n` +
    `• NEED: *${i.needsPercent}%* (${formatRupiah(i.needsTotal)})\n` +
    `• WANT: *${i.wantsPercent}%* (${formatRupiah(i.wantsTotal)})\n` +
    (i.giftsTotal > 0 ? `• GIFT: *${i.giftsPercent}%* (${formatRupiah(i.giftsTotal)})\n` : "") +
    (i.assetsTotal > 0 ? `• ASSET: *${i.assetsPercent}%* (${formatRupiah(i.assetsTotal)})\n` : "") +
    `\n🔥 *Top Kategori Boros:*\n${topCats || "• _Belum ada pengeluaran._"}` +
    (peakSlotLine || peakDayLine ? `\n\n${[peakSlotLine, peakDayLine].filter(Boolean).join("\n")}` : "") +
    (topItems ? `\n\n💸 *Pengeluaran Terbesar:*\n${topItems}` : "") +
    mainInsight;

  const replyMarkup = webUrl
    ? { inline_keyboard: [[{ text: "📊 Buka Laporan & Download Sheet", url: webUrl }]] }
    : null;

  return { text, replyMarkup };
}

const SINKING_STOP_WORDS = new Set([
  "pos",
  "bank",
  "nabung",
  "bayar",
  "bln",
  "bulan",
  "bulanan",
  "per",
  "dan",
  "dari",
  "untuk",
  "utama",
  "saku",
  "dana",
]);

function extractTopicTokens(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !SINKING_STOP_WORDS.has(w));
}

/** Hitung alokasi tabungan bulanan bersih tanpa memotong ulang pos sinking fund yang sudah tercatat di fixedCosts. */
export function computeNetMonthlySavings(fixedCosts = [], savingsPots = []) {
  const bills = Array.isArray(fixedCosts) ? fixedCosts : [];
  const pots = Array.isArray(savingsPots) ? savingsPots : [];

  const sinkingBills = bills
    .filter((fc) => (fc?.isSinkingFund || Number(fc?.cycleMonths) > 1) && Number(fc?.amount) > 0)
    .map((fc) => ({
      id: fc.id,
      name: fc.name || "",
      amount: Number(fc.amount) || 0,
      tokens: new Set(extractTopicTokens(fc.name)),
    }));

  let totalSavings = 0;
  const excludedSinkingPots = [];

  for (const pot of pots) {
    const monthly = Number(pot?.monthly) || 0;
    if (monthly <= 0) continue;

    const potTokens = extractTopicTokens(pot?.name);
    const matchedBill = sinkingBills.find((b) => {
      if (pot?.fixedCostId && pot.fixedCostId === b.id) return true;
      if (b.amount !== monthly) return false;
      return potTokens.some((tok) => b.tokens.has(tok));
    });

    if (matchedBill) {
      excludedSinkingPots.push({
        potId: pot.id || "",
        potName: pot.name || "",
        monthly,
        billId: matchedBill.id || "",
        billName: matchedBill.name,
      });
    } else {
      totalSavings += monthly;
    }
  }

  return { totalSavings, excludedSinkingPots };
}

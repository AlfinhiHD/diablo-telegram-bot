const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const WIB_OFFSET = 7 * 3600_000;

/** Komponen tanggal & jam dalam WIB (UTC+7), konsisten di server UTC (Vercel) maupun lokal. */
export function toWibParts(date = new Date()) {
  const d = new Date(new Date(date).getTime() + WIB_OFFSET);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    date: d.getUTCDate(),
    day: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Buat Date dari komponen waktu WIB (00:00 WIB = 17:00 UTC hari sebelumnya). */
export function fromWib(year, month, date, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month, date, hour, minute) - WIB_OFFSET);
}

/** Awal hari (00:00 WIB) untuk sebuah Date. */
export function startOfWibDay(date = new Date()) {
  const { year, month, date: day } = toWibParts(date);
  return fromWib(year, month, day, 0, 0);
}

/** Format angka ke Rupiah: 1500000 -> "Rp 1.500.000" */
export function rp(value) {
  const n = Math.round(Number(value) || 0);
  return `${n < 0 ? "-" : ""}Rp ${Math.abs(n).toLocaleString("id-ID")}`;
}

export const formatRupiah = rp;

/** Parse nominal bebas: "25rb", "1,5jt", "Rp 1.500.000", "2jt" -> integer Rupiah */
export function parseAmount(input) {
  const match = String(input || "")
    .toLowerCase()
    .replace(/rp\.?\s*/g, "")
    .match(/([\d.,]+)\s*(jt|juta|rb|ribu|k)?/);
  if (!match) return 0;
  const unit = match[2] || "";
  let num = unit ? parseFloat(match[1].replace(",", ".")) : Number(match[1].replace(/[.,]/g, ""));
  if (unit === "jt" || unit === "juta") num *= 1_000_000;
  else if (unit) num *= 1_000;
  return Math.round(num) || 0;
}

/** "2028-12" -> "Des 2028" */
export function monthLabel(yyyyMm) {
  const [y, m] = String(yyyyMm || "").split("-").map(Number);
  return y && m ? `${MONTHS[m - 1]} ${y}` : "";
}

/** Format ISO String ke "Hari ini, 14:30" atau "22 Okt, 14:30" (WIB) */
export function formatShortDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";

  const p = toWibParts(d);
  const timeStr = `${String(p.hour).padStart(2, "0")}.${String(p.minute).padStart(2, "0")}`;

  const nowP = toWibParts(new Date());
  const yestP = toWibParts(new Date(Date.now() - 86_400_000));

  const ds = `${p.year}-${p.month}-${p.date}`;
  if (ds === `${nowP.year}-${nowP.month}-${nowP.date}`) return `Hari ini, ${timeStr}`;
  if (ds === `${yestP.year}-${yestP.month}-${yestP.date}`) return `Kemarin, ${timeStr}`;

  return `${p.date} ${MONTHS[p.month]}, ${timeStr}`;
}

/** Mengelompokkan transaksi berdasarkan tanggal WIB */
export function groupTransactionsByDate(transactions = []) {
  const groups = {};
  const nowP = toWibParts(new Date());
  const yestP = toWibParts(new Date(Date.now() - 86_400_000));
  const todayStr = `${nowP.year}-${nowP.month}-${nowP.date}`;
  const yestStr = `${yestP.year}-${yestP.month}-${yestP.date}`;

  for (const tx of transactions) {
    const p = toWibParts(tx.createdAt || Date.now());
    const ds = `${p.year}-${p.month}-${p.date}`;
    let label = `${p.date} ${MONTHS[p.month]} ${p.year}`;
    if (ds === todayStr) label = "Hari Ini";
    else if (ds === yestStr) label = "Kemarin";

    if (!groups[label]) groups[label] = [];
    groups[label].push(tx);
  }

  return Object.entries(groups);
}

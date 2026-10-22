const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

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

/** Format ISO String ke "22 Okt, 14:30" */
export function formatShortDate(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const day = d.getDate();
  const m = MONTHS[d.getMonth()];
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${m}, ${hours}:${mins}`;
}

/** Mengelompokkan transaksi berdasarkan tanggal */
export function groupTransactionsByDate(transactions = []) {
  const groups = {};
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const yest = new Date(now.getTime() - 86400000);
  const yestStr = `${yest.getFullYear()}-${yest.getMonth()}-${yest.getDate()}`;

  for (const tx of transactions) {
    const d = new Date(tx.createdAt || Date.now());
    const ds = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let label = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (ds === todayStr) label = "Hari Ini";
    else if (ds === yestStr) label = "Kemarin";

    if (!groups[label]) groups[label] = [];
    groups[label].push(tx);
  }

  return Object.entries(groups);
}

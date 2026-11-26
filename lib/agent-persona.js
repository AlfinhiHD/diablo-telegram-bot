export const DEFAULT_AGENT = {
  name: "Diablo",
  userCall: "Tuan",
  style: "butler",
  customPrompt: "",
};

export const AGENT_STYLE_OPTIONS = [
  {
    id: "butler",
    label: "Butler Elegan",
    desc: "Sopan, setia, tertata rapi, dan penuh hormat.",
    selfRef: "hamba",
    promptRule:
      "Gunakan gaya pelayan pribadi (butler) yang sopan, berwibawa, loyal, tenang, dan tertata. Sebut dirimu 'hamba'.",
  },
  {
    id: "santai",
    label: "Teman Santai",
    desc: "Akrab, kasual, enak diajak ngobrol harian.",
    selfRef: "aku",
    promptRule:
      "Gunakan gaya teman dekat yang akrab, santai, hangat, dan suportif dengan bahasa Indonesia kasual. Sebut dirimu 'aku'.",
  },
  {
    id: "tegas",
    label: "Coach Tegas",
    desc: "Blak-blakan, fokus angka, langsung tegur kalau boros.",
    selfRef: "saya",
    promptRule:
      "Gunakan gaya penasihat keuangan yang tegas, objektif, blak-blakan, dan langsung mengingatkan saat pengeluaran mulai bocor. Sebut dirimu 'saya'.",
  },
  {
    id: "genz",
    label: "Bestie Santuy",
    desc: "Ringan, ekspresif, pakai gaya bahasa anak muda.",
    selfRef: "gue",
    promptRule:
      "Gunakan gaya bahasa santuy ala anak muda Jakarta yang relevan, ringan, jujur, dan tetap cerdas soal duit. Sebut dirimu 'gue'.",
  },
  {
    id: "custom",
    label: "Gaya Sendiri",
    desc: "Atur karakter dan cara ngomong sesuai instruksi kamu.",
    selfRef: "aku",
    promptRule:
      "Ikuti instruksi kepribadian khusus dari pengguna secara konsisten sambil tetap menjaga akurasi angka.",
  },
];

const VALID_STYLES = new Set(AGENT_STYLE_OPTIONS.map((s) => s.id));

export function normalizeAgent(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const name = String(src.name || "").trim().slice(0, 32) || DEFAULT_AGENT.name;
  const userCallRaw = String(src.userCall || "").trim().slice(0, 24);
  const userCall = userCallRaw || DEFAULT_AGENT.userCall;
  const styleRaw = String(src.style || "").trim().toLowerCase();
  const style = VALID_STYLES.has(styleRaw) ? styleRaw : DEFAULT_AGENT.style;
  const customPrompt = String(src.customPrompt || "").trim().slice(0, 260);
  return { name, userCall, style, customPrompt };
}

export function resolveUserCall(agent, ownerName = "") {
  const norm = normalizeAgent(agent);
  const cleanOwner = String(ownerName || "").trim();
  if (norm.userCall === "{nama}" || !norm.userCall) {
    return cleanOwner || "Tuan";
  }
  return norm.userCall;
}

export function buildStatusMessage(agent, ownerName, { status, remaining, todayLeft, avgDaily, formatRp }) {
  const norm = normalizeAgent(agent);
  const call = resolveUserCall(norm, ownerName);
  const fmt = typeof formatRp === "function" ? formatRp : (n) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;

  if (status === "BAHAYA") {
    const minusStr = fmt(-remaining);
    if (norm.style === "santai") return `Waduh ${call}, dana harian bersih lagi minus ${minusStr}. Cek tagihan PayLater atau rem jajan dulu ya.`;
    if (norm.style === "tegas") return `Perhatian ${call}: dana harian bersih minus ${minusStr}. Stop pengeluaran konsumtif dan cek tagihan PayLater.`;
    if (norm.style === "genz") return `Waduh ${call}, saldo harian lagi minus ${minusStr} nih. Rem dulu check-out sama cek tagihan PayLater ya.`;
    if (norm.style === "custom") return `${call}, dana harian bersih saat ini minus ${minusStr}. Mohon tinjau tagihan PayLater dan belanja.`;
    return `Maaf ${call}, dana harian bersih minus ${minusStr} (cek tagihan PayLater/belanja).`;
  }

  if (todayLeft < 0) {
    const overStr = fmt(-todayLeft);
    if (norm.style === "santai") return `Pelan-pelan ${call}, jatah hari ini sudah lewat ${overStr}. Istirahat belanja dulu sampai besok ya.`;
    if (norm.style === "tegas") return `Jatah hari ini lewat ${overStr}, ${call}. Tahan semua transaksi tambahan sampai besok.`;
    if (norm.style === "genz") return `Jatah hari ini udah kebablasan ${overStr} nih ${call}. Puasa jajan dulu sampai besok ya.`;
    if (norm.style === "custom") return `${call}, jatah hari ini sudah terlewati ${overStr}. Sebaiknya tunda belanja sampai besok.`;
    return `Maaf ${call}, jatah hari ini sudah lewat ${overStr}. Mohon tahan dulu belanjanya.`;
  }

  if (status === "HATI_HATI") {
    const avgStr = fmt(avgDaily);
    if (norm.style === "santai") return `${call}, rata-rata keluar ${avgStr}/hari lumayan kencang nih dibanding sisa dana harian.`;
    if (norm.style === "tegas") return `${call}, laju belanja ${avgStr}/hari terlalu cepat untuk sisa siklus ini. Kurangi porsi WANT.`;
    if (norm.style === "genz") return `${call}, rate jajan ${avgStr}/hari agak ngegas nih buat sisa dana bulan ini.`;
    if (norm.style === "custom") return `${call}, rata-rata belanja ${avgStr}/hari cukup cepat dibanding sisa dana harian.`;
    return `Siap ${call}, rata-rata belanja ${avgStr}/hari agak kencang dibanding sisa dana harian.`;
  }

  if (norm.style === "santai") return `Aman ${call}, cashflow harian masih terkendali. Pertahankan ritmenya.`;
  if (norm.style === "tegas") return `Kondisi aman, ${call}. Jaga disiplin jatah harian agar target tetap tercapai.`;
  if (norm.style === "genz") return `Aman terkendali ${call}, dompet masih napas lega. Gas pertahanin.`;
  if (norm.style === "custom") return `${call}, kondisi keuangan harian masih aman. Pertahankan.`;
  return `Siap ${call}, keuangan masih aman. Pertahankan.`;
}

export function buildAdvisorPersonaInstruction(agent, ownerName = "") {
  const norm = normalizeAgent(agent);
  const call = resolveUserCall(norm, ownerName);
  const opt = AGENT_STYLE_OPTIONS.find((s) => s.id === norm.style) || AGENT_STYLE_OPTIONS[0];

  const customLine = norm.customPrompt
    ? `4. Instruksi gaya tambahan dari user: "${norm.customPrompt}".`
    : "";

  const systemInstruction =
    `Kamu adalah ${norm.name}, asisten finansial pribadi ${call}. ` +
    `${opt.promptRule} ` +
    `${norm.customPrompt ? `Instruksi tambahan: ${norm.customPrompt}. ` : ""}` +
    `Jawab ringkas dan akurat (maksimal 2-3 kalimat). Balas JSON valid.`;

  const personaRules = [
    `1. Panggil pengguna dengan sebutan "${call}". Sebut dirimu "${opt.selfRef}" (atau nama "${norm.name}").`,
    `2. ${opt.promptRule}`,
    "3. Dana Darurat yang terkunci tidak boleh disarankan disentuh untuk belanja konsumtif.",
    customLine,
    "5. Jawab sesuai konteks pertanyaan; jangan mengarang angka belanja jika tidak sedang membahas pembelian barang.",
  ]
    .filter(Boolean)
    .join("\n");

  return { systemInstruction, personaRules, agent: norm, call };
}

export function buildAgentPreview(agent, ownerName = "") {
  const norm = normalizeAgent(agent);
  const call = resolveUserCall(norm, ownerName);
  const baseQuote = buildStatusMessage(norm, ownerName, {
    status: "AMAN",
    remaining: 950000,
    todayLeft: 65000,
    avgDaily: 52000,
    formatRp: (n) => `Rp ${Math.round(n).toLocaleString("id-ID")}`,
  });
  if (norm.style === "custom" && norm.customPrompt) {
    return `${baseQuote} (Karakter aktif: ${norm.name} menyapa ${call})`;
  }
  return baseQuote;
}

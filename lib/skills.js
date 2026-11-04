import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INTENTS = ["NEED", "WANT", "GIFT", "ASSET"];

const DEFAULT_SKILLS_MD = `# Diablo Expense Skills

## Kamus

hadiah, kado, hampers, bunga, buket, anniv, anniversary, ultah, traktir pacar, buat cewe, buat cewek, buat pacar, buat doi, buat ayang | Belanja & Barang | GIFT
laptop, hp, handphone, gadget, keyboard, mouse, monitor, headset, earphone, tws, charger, powerbank, ssd, flashdisk, sepatu, jaket, tas, dompet, jam tangan, meja, kursi, rak, helm, alat, tools | Belanja & Barang | ASSET
starbucks, mixue, kopi, kopi susu, boba, es teh, es kopi, latte, americano, matcha, janji jiwa, kenangan, kopi kenangan, fore, tomoro, point coffee, chatime, haus, tuku | Jajan & Kopi | WANT
rokok, vape, liquid, pods, cartridge, sampoerna, marlboro, gudang garam, surya, esse, camel, dunhill | Jajan & Kopi | WANT
snack, jajan, cemilan, camilan, sosis, springles, pringles, chitato, coklat, permen, gorengan, martabak, terang bulan, es krim, kue, roti, donat, croffle, piscok, tahu bulat, cilok, cireng, cimol, seblak, dimsum, takoyaki, indomaret, indomart, alfamart, alfamidi, lawson, familymart, circle k | Jajan & Kopi | WANT
makan, makan siang, makan malam, makan malem, makan pagi, maksi, sarapan, nasi, nasi padang, padang, nasi goreng, nasgor, ayam, sayur, warteg, bakmi, mie, mie ayam, mie gacoan, gacoan, ramen, udon, soto, rawon, sop, bakso, penyetan, pecel, pecel lele, briyani, sushi, marugame, pizza, burger, geprek, lalapan, katsu, seafood, sate, rendang, gado-gado, ketoprak, bubur, batagor, siomay, pempek, solaria, hokben, mcd, kfc, richeese, warung, katering, lunch, dinner | Makan Pokok | NEED
galon, aqua, beras, telur, minyak, gula, garam, kecap, sambal, indomie, sabun, sampo, odol, pasta gigi, sikat gigi, deodorant, skincare, tisu, deterjen, pewangi, obat, vitamin, apotek, klinik, dokter | Makan Pokok | NEED
bensin, pertamax, pertalite, shell, pertamina, gojek, goride, gocar, grab, grabjek, grabcar, maxim, indrive, toll, tol, parkir, kereta, krl, mrt, lrt, transjakarta, busway, damri, travel, ojek, taksi, bluebird, e-toll, etoll, flazz, brizzi, emoney, tambal ban, angin, oli, servis motor | Transport | NEED
listrik, token, pln, wifi, indihome, biznet, kos, kosan, kontrakan, pulsa, paket data, kuota, telkomsel, byu, xl, indosat, tri, smartfren, bpjs, air pdam, pdam, cicilan, pajak, iuran, laundry, cukur, potong rambut, barbershop | Tagihan | NEED
game, skin, diamond, valorant, mlbb, mobile legends, pubg, genshin, steam, psn, roblox, topup, top up, bioskop, xxi, cgv, netflix, spotify, youtube premium, viu, disney, konser, tiket nonton, karaoke, bilyar, billiard, bowling, warnet | Hiburan & Game | WANT
baju, kaos, kemeja, celana, jeans, chino, hoodie, sweater, kaos kaki, topi, parfum, sandal | Belanja & Barang | WANT

## Umum

beli, belanja, tokped, tokopedia, shopee, tiktok shop, lazada, blibli, checkout | Belanja & Barang | WANT

## Aturan

- Nama item cuma nama inti barang atau makanan, misalnya \`rokok\`, \`kopi\`, \`penyetan sm fahri\`. Jangan ada kata kerja transaksi (beli, bayar, pesan), kata waktu (kemarin, malem, tadi), atau filler (oiya, aku, juga).
- Frasa makan umum seperti "makan siang", "makan malam", "sarapan" adalah nama item yang valid jika user tidak menyebutkan nama lauk/makanan spesifik (misal: "makan siang 17.5k" -> "makan siang"). JANGAN memotongnya menjadi cuma "siang" atau "malem".
- Satu pesan boleh berisi banyak item. Pisahkan per nominal dan jangan gabungkan.
- Metode bayar hanya diisi kalau disebut jelas di pesan (cash, tunai, transfer, qris, gopay, paylater). Kalau tidak disebut, isi \`QRIS\`.
- Makan dengan teman tetap NEED kalau makanan pokok. Traktir teman bukan pacar tetap mengikuti jenis makanannya.
- Kalau pesan menyebut pacar, cewe, ultah, atau hadiah, barang pendukungnya (kue, lilin, bunga, kartu) berintent GIFT, sedangkan makan biasa tetap NEED.
- Angka seperti \`36.600\` atau \`36,600\` artinya tiga puluh enam ribu enam ratus rupiah. \`30.5k\` artinya 30.500.
`;

let cache = null;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseSkills(md) {
  const entries = [];
  const rules = [];
  let section = "";

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      continue;
    }

    if (section === "aturan") {
      if (line.startsWith("- ")) rules.push(line.slice(2));
      continue;
    }

    if (section !== "kamus" && section !== "umum") continue;
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length !== 3) continue;
    const intent = parts[2].toUpperCase();
    if (!INTENTS.includes(intent)) continue;

    const keywords = parts[0].split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    entries.push({
      generic: section === "umum",
      category: parts[1],
      intent,
      keywords: keywords.map((k) => ({
        text: k,
        regex: new RegExp(`(?:^|[^a-z0-9])${escapeRegex(k)}(?:nya|ku)?(?=$|[^a-z0-9])`, "i"),
      })),
    });
  }
  return { entries, rules };
}

function readSkillsMarkdown() {
  const candidates = [];
  try {
    candidates.push(fileURLToPath(new URL("./skills/expense-skills.md", import.meta.url)));
  } catch {
    // ignore URL resolution errors in bundled environments
  }
  candidates.push(path.join(process.cwd(), "lib", "skills", "expense-skills.md"));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf-8");
      }
    } catch {
      // try next candidate
    }
  }
  return DEFAULT_SKILLS_MD;
}

function load() {
  if (cache) return cache;
  cache = parseSkills(readSkillsMarkdown());
  return cache;
}

/** Cari entri kamus yang cocok dengan teks, paling spesifik (kata kunci terpanjang) di depan. */
export function searchSkills(text) {
  const lower = String(text || "").toLowerCase();
  const hits = [];
  for (const entry of load().entries) {
    for (const kw of entry.keywords) {
      if (kw.regex.test(lower)) {
        hits.push({ keyword: kw.text, category: entry.category, intent: entry.intent, generic: entry.generic });
      }
    }
  }
  return hits.sort((a, b) => Number(a.generic) - Number(b.generic) || b.keyword.length - a.keyword.length);
}

/** True kalau pesan menyebut konteks hadiah (pacar, ultah, hadiah, dll). */
export function hasGiftContext(text) {
  return searchSkills(text).some((h) => h.intent === "GIFT");
}

/**
 * Tentukan kategori + intent satu item. `isGift` = konteks hadiah dari seluruh pesan.
 * Barang jajan/belanja biasa dalam konteks hadiah jadi GIFT, makan pokok tetap NEED.
 */
export function classifyExpense(text, { isGift = false } = {}) {
  const [best] = searchSkills(text);
  let category = best?.category || "Lainnya";
  let intent = best?.intent || "WANT";

  if (isGift && intent === "WANT") {
    intent = "GIFT";
    category = "Belanja & Barang";
  }
  return { category, intent, matched: Boolean(best) };
}

/** Teks referensi untuk prompt AI: entri yang relevan dengan pesan + aturan dari markdown. */
export function buildSkillsPrompt(text) {
  const seen = new Set();
  const hints = [];
  for (const h of searchSkills(text)) {
    const key = `${h.keyword}|${h.category}|${h.intent}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push(`- "${h.keyword}" => ${h.category} / ${h.intent}`);
  }

  const { rules } = load();
  return (
    (hints.length ? `Referensi kamus untuk pesan ini (wajib diikuti):\n${hints.join("\n")}\n\n` : "") +
    (rules.length ? `Aturan:\n${rules.map((r) => `- ${r}`).join("\n")}` : "")
  );
}

import fs from "node:fs";
import path from "node:path";

const SKILLS_PATH = path.join(process.cwd(), "lib", "skills", "expense-skills.md");
const INTENTS = ["NEED", "WANT", "GIFT", "ASSET"];

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

function load() {
  if (cache) return cache;
  try {
    cache = parseSkills(fs.readFileSync(SKILLS_PATH, "utf-8"));
  } catch (err) {
    console.warn(`[Diablo Skills] gagal membaca ${SKILLS_PATH}: ${err.message}`);
    cache = { entries: [], rules: [] };
  }
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

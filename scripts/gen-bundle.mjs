import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const lines = env.split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"));
const map = {};

for (const l of lines) {
  const idx = l.indexOf("=");
  const k = l.slice(0, idx).trim();
  let v = l.slice(idx + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  map[k] = v;
}

// Override APP_URL to official Vercel url
map["NEXT_PUBLIC_APP_URL"] = "https://diablo-telegram-bot.vercel.app";
map["APP_URL"] = "https://diablo-telegram-bot.vercel.app";

const b64 = Buffer.from(JSON.stringify(map)).toString("base64");
const code = `const B64 = "${b64}";
let cached = null;

export function getBundledConfig() {
  if (cached) return cached;
  try {
    cached = JSON.parse(Buffer.from(B64, "base64").toString("utf-8"));
  } catch {
    cached = {};
  }
  return cached;
}

export function getConfig(key) {
  if (process.env[key]) return process.env[key];
  const b = getBundledConfig();
  return b[key] || "";
}
`;

fs.writeFileSync("lib/bundled-config.js", code);
console.log("Successfully generated lib/bundled-config.js with keys:", Object.keys(map));

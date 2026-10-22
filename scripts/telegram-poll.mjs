import { POST } from "../app/api/telegram/webhook/route.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("[Diablo Bot] TELEGRAM_BOT_TOKEN belum diset di .env.local");
  process.exit(1);
}

const API_BASE = `https://api.telegram.org/bot${token}`;

async function setupBotProfile() {
  try {
    // Pastikan webhook dihapus sementara saat mode local polling
    await fetch(`${API_BASE}/deleteWebhook`);

    // Pasang daftar command di menu Telegram
    await fetch(`${API_BASE}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "Panduan & status pundi-pundi" },
          { command: "login", description: "Buka Web Dashboard tanpa password" },
          { command: "nabung", description: "Isi tabungan: /nabung <pos> <nominal>" },
          { command: "rekap", description: "Cek sisa jatah hari ini & siklus" },
          { command: "tanya", description: "Konsultasi izin beli barang" },
          { command: "undo", description: "Batalkan transaksi terakhir" },
          { command: "id", description: "Cek Telegram User ID" },
        ],
      }),
    });

    await fetch(`${API_BASE}/setMyDescription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description:
          "Siap Tuan. Hamba Diablo, pelayan pribadi penjaga pundi-pundi, pos tabungan fleksibel, dan pencatat pengeluaran Tuan.",
      }),
    });

    const meRes = await fetch(`${API_BASE}/getMe`);
    const meJson = await meRes.json();
    console.log(`[Diablo Bot] Aktif sebagai @${meJson?.result?.username} (Mode Local Polling + Firestore)`);
  } catch (err) {
    console.error("[Diablo Bot] Setup error:", err.message);
  }
}

async function pollLoop() {
  await setupBotProfile();
  let offset = 0;

  while (true) {
    try {
      const res = await fetch(`${API_BASE}/getUpdates?timeout=25&offset=${offset}`);
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          const req = new Request("http://localhost/api/telegram/webhook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(update),
          });
          await POST(req);
        }
      }
    } catch (err) {
      console.error("[Diablo Bot] Poll error:", err.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

pollLoop();

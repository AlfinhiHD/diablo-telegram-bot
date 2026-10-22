# 👹 DIABLO FINANCE — Asisten Finansial Pribadi (Tensura Edition)

> *"Kufufufu... Hamba, Diablo, siap menjaga kemakmuran dan martabat pundi-pundi Tuanku."*

Asisten finansial pribadi berbasis **Telegram Bot (@diablofin_bot)** dan **Web Dashboard Mobile-First** yang didukung oleh **Next.js 15**, **Google Gemini AI**, dan **Firebase Firestore**.

---

## ✨ Fitur Utama

1. **Dashboard Sederhana & Mobile-First (4 Tab):**
   - **Beranda (`/`):** Fokus pada 1 metrik utama: *"Berapa uang yang boleh kupakai hari ini?"*, status siklus gajian, 5 transaksi terakhir, dan tombol catat cepat.
   - **Tabungan (`/tabungan`):** Pos Tabungan Fleksibel (Dana Darurat, Gadget, Liburan, Rumah) lengkap dengan target, progres, dan tombol top-up.
   - **Riwayat (`/riwayat`):** Daftar transaksi yang dikelompokkan per tanggal, filter Needs vs Wants, dan pencarian cepat.
   - **Atur (`/atur`):** Konfigurasi gaji bulanan, tanggal gajian, daftar tagihan tetap (fixed costs), simulasi budget bebas, dan keamanan akun.

2. **Login Tanpa Password (Telegram Magic Link):**
   - Cukup ketik `/login` di bot Telegram.
   - Diablo mengirimkan link rahasia (berlaku 10 menit) yang langsung mengautentikasi sesi cookie (HMAC signed) selama 30 hari.

3. **Interaksi Telegram Bot:**
   - **Catat Pengeluaran:** Cukup ketik `kopi 25k qris` atau kirim foto struk/nota.
   - **Nabung Pos Fleksibel:** `/nabung <nama pos> <nominal>` (contoh: `/nabung darurat 200rb`).
   - **Konsultasi Belanja:** `/tanya beli sepatu 1jt aman ga?`
   - **Rekap Siklus:** `/rekap`
   - **Batal Catatan:** `/undo`

---

## 🚀 Panduan Deploy ke Vercel

### 1. Push ke GitHub
Project ini sudah siap di-push ke repository:
```bash
git remote add origin https://github.com/AlfinhiHD/diablo-telegram-bot.git
git branch -M main
git push -u origin main
```

### 2. Import Project di Vercel
1. Buka [vercel.com](https://vercel.com) dan login.
2. Klik **Add New...** -> **Project**.
3. Pilih repository `AlfinhiHD/diablo-telegram-bot`.
4. Di bagian **Environment Variables**, masukkan variabel berikut:
   - `GEMINI_API_KEY`: API Key dari [Google AI Studio](https://aistudio.google.com/app/apikey)
   - `TELEGRAM_BOT_TOKEN`: Token bot dari `@BotFather`
   - `ALLOWED_TELEGRAM_USER_IDS`: Telegram User ID Anda (dapatkan dengan ketik `/id` di bot)
   - `FIREBASE_PROJECT_ID`: Project ID Firebase Anda
   - `FIREBASE_CLIENT_EMAIL`: Service account email Firebase
   - `FIREBASE_PRIVATE_KEY`: Private key Firebase (pastikan format `\n` utuh)
   - `SESSION_SECRET`: Kunci acak 32-karakter (misal: hex string)
   - `NEXT_PUBLIC_APP_URL`: URL Vercel produksi Anda (misal: `https://diablo-telegram-bot.vercel.app`)
5. Klik **Deploy**.

### 3. Aktifkan Webhook Telegram di Vercel
Setelah Vercel selesai melakukan deploy, daftarkan webhook dengan membuka URL berikut di browser:
```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<DOMAIN-VERCEL-ANDA>/api/telegram/webhook
```
Bot langsung aktif 24/7 di cloud tanpa perlu menjalankan komputer Anda!

---

## 💻 Jalankan Lokal (Development)

1. Pastikan dependensi terpasang:
   ```bash
   npm install
   ```
2. Jalankan bot polling lokal:
   ```bash
   npm run bot
   ```
3. Di terminal terpisah, jalankan web development:
   ```bash
   npm run dev
   ```
4. Buka [http://localhost:3000](http://localhost:3000).

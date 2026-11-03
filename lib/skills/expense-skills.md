# Diablo Expense Skills

File ini dibaca parser pengeluaran. Edit di sini untuk mengajari Diablo barang baru, tanpa menyentuh kode.

Format baris kamus: `kata kunci, kata kunci | Kategori | INTENT`

- Kata kunci dicocokkan sebagai kata utuh (akhiran `nya`/`ku` boleh), bukan potongan kata.
- Kata kunci yang lebih panjang menang kalau beberapa cocok (`starbucks` mengalahkan `makan`).
- Kategori valid: Makan Pokok, Jajan & Kopi, Transport, Belanja & Barang, Hiburan & Game, Tagihan, Lainnya
- INTENT valid: NEED, WANT, GIFT, ASSET

## Kamus

hadiah, kado, hampers, bunga, buket, anniv, anniversary, ultah, traktir pacar, buat cewe, buat cewek, buat pacar, buat doi | Belanja & Barang | GIFT
laptop, hp, handphone, gadget, keyboard, mouse, monitor, headset, earphone, charger, powerbank, sepatu, jaket, tas, meja, kursi, rak, alat, tools | Belanja & Barang | ASSET
starbucks, mixue, kopi, kopi susu, boba, es teh, es kopi, latte, americano, matcha, janji jiwa, kenangan, chatime | Jajan & Kopi | WANT
rokok, vape, liquid, sampoerna, marlboro, gudang garam, surya | Jajan & Kopi | WANT
snack, jajan, cemilan, camilan, sosis, springles, pringles, chitato, coklat, permen, gorengan, martabak, es krim, kue, roti | Jajan & Kopi | WANT
makan, nasi, ayam, sayur, warteg, sarapan, bakmi, mie, soto, bakso, penyetan, pecel, briyani, sushi, marugame, pizza, burger, geprek, lalapan, katsu, seafood, sate, rendang, gado-gado, lunch, dinner | Makan Pokok | NEED
galon, beras, telur, minyak, gula, sabun, sampo, pasta gigi, tisu, deterjen | Makan Pokok | NEED
bensin, pertamax, pertalite, gojek, grab, maxim, toll, tol, parkir, kereta, krl, mrt, transjakarta, busway, ojek, taksi, e-toll, etoll | Transport | NEED
listrik, token, wifi, indihome, kos, kontrakan, pulsa, paket data, bpjs, air pdam, pdam, cicilan | Tagihan | NEED
game, skin, bioskop, steam, roblox, topup, top up, netflix, spotify, youtube premium, konser, tiket nonton | Hiburan & Game | WANT
baju, kaos, kemeja, celana, hoodie | Belanja & Barang | WANT

## Umum

Dipakai hanya kalau tidak ada yang cocok di Kamus.

beli, belanja, tokped, tokopedia, shopee, lazada, checkout | Belanja & Barang | WANT

## Aturan

Bagian ini dikirim apa adanya ke AI parser.

- Nama item cuma nama inti barang atau makanan, misalnya `rokok`, `kopi`, `penyetan sm fahri`. Jangan ada kata kerja transaksi (beli, bayar, pesan), kata waktu (kemarin, malem, tadi), atau filler (oiya, aku, juga).
- Satu pesan boleh berisi banyak item. Pisahkan per nominal dan jangan gabungkan.
- Metode bayar hanya diisi kalau disebut jelas di pesan (cash, tunai, transfer, qris, gopay, paylater). Kalau tidak disebut, isi `QRIS`.
- Makan dengan teman tetap NEED kalau makanan pokok. Traktir teman bukan pacar tetap mengikuti jenis makanannya.
- Kalau pesan menyebut pacar, cewe, ultah, atau hadiah, barang pendukungnya (kue, lilin, bunga, kartu) berintent GIFT, sedangkan makan biasa tetap NEED.
- Angka seperti `36.600` atau `36,600` artinya tiga puluh enam ribu enam ratus rupiah. `30.5k` artinya 30.500.

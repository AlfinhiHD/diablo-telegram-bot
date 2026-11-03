# Diablo Expense Skills

File ini dibaca parser pengeluaran. Edit di sini untuk mengajari Diablo barang baru, tanpa menyentuh kode.

Format baris kamus: `kata kunci, kata kunci | Kategori | INTENT`

- Kata kunci dicocokkan sebagai kata utuh (akhiran `nya`/`ku` boleh), bukan potongan kata.
- Kata kunci yang lebih panjang menang kalau beberapa cocok (`starbucks` mengalahkan `makan`).
- Kategori valid: Makan Pokok, Jajan & Kopi, Transport, Belanja & Barang, Hiburan & Game, Tagihan, Lainnya
- INTENT valid: NEED, WANT, GIFT, ASSET

## Kamus

hadiah, kado, hampers, bunga, buket, anniv, anniversary, ultah, traktir pacar, buat cewe, buat cewek, buat pacar, buat doi, buat ayang | Belanja & Barang | GIFT
laptop, hp, handphone, gadget, keyboard, mouse, monitor, headset, earphone, tws, charger, powerbank, ssd, flashdisk, sepatu, jaket, tas, dompet, jam tangan, meja, kursi, rak, helm, alat, tools | Belanja & Barang | ASSET
starbucks, mixue, kopi, kopi susu, boba, es teh, es kopi, latte, americano, matcha, janji jiwa, kenangan, kopi kenangan, fore, tomoro, point coffee, chatime, haus, tuku | Jajan & Kopi | WANT
rokok, vape, liquid, pods, cartridge, sampoerna, marlboro, gudang garam, surya, esse, camel, dunhill | Jajan & Kopi | WANT
snack, jajan, cemilan, camilan, sosis, springles, pringles, chitato, coklat, permen, gorengan, martabak, terang bulan, es krim, kue, roti, donat, croffle, piscok, tahu bulat, cilok, cireng, cimol, seblak, dimsum, takoyaki, indomaret, indomart, alfamart, alfamidi, lawson, familymart, circle k | Jajan & Kopi | WANT
makan, nasi, nasi padang, padang, nasi goreng, nasgor, ayam, sayur, warteg, sarapan, bakmi, mie, mie ayam, mie gacoan, gacoan, ramen, udon, soto, rawon, sop, bakso, penyetan, pecel, pecel lele, briyani, sushi, marugame, pizza, burger, geprek, lalapan, katsu, seafood, sate, rendang, gado-gado, ketoprak, bubur, batagor, siomay, pempek, solaria, hokben, mcd, kfc, richeese, warung, katering, lunch, dinner | Makan Pokok | NEED
galon, aqua, beras, telur, minyak, gula, garam, kecap, sambal, indomie, sabun, sampo, odol, pasta gigi, sikat gigi, deodorant, skincare, tisu, deterjen, pewangi, obat, vitamin, apotek, klinik, dokter | Makan Pokok | NEED
bensin, pertamax, pertalite, shell, pertamina, gojek, goride, gocar, grab, grabJek, grabcar, maxim, indrive, toll, tol, parkir, kereta, krl, mrt, lrt, transjakarta, busway, damri, travel, ojek, taksi, bluebird, e-toll, etoll, flazz, brizzi, emoney, tambal ban, angin, oli, servis motor | Transport | NEED
listrik, token, pln, wifi, indihome, biznet, kos, kosan, kontrakan, pulsa, paket data, kuota, telkomsel, byu, xl, indosat, tri, smartfren, bpjs, air pdam, pdam, cicilan, pajak, iuran, laundry, cukur, potong rambut, barbershop | Tagihan | NEED
game, skin, diamond, valorant, mlbb, mobile legends, pubg, genshin, steam, psn, roblox, topup, top up, bioskop, xxi, cgv, netflix, spotify, youtube premium, viu, disney, konser, tiket nonton, karaoke, bilyar, billiard, bowling, warnet | Hiburan & Game | WANT
baju, kaos, kemeja, celana, jeans, chino, hoodie, sweater, kaos kaki, topi, parfum, sandal | Belanja & Barang | WANT

## Umum

Dipakai hanya kalau tidak ada yang cocok di Kamus.

beli, belanja, tokped, tokopedia, shopee, tiktok shop, lazada, blibli, checkout | Belanja & Barang | WANT

## Aturan

Bagian ini dikirim apa adanya ke AI parser.

- Nama item cuma nama inti barang atau makanan, misalnya `rokok`, `kopi`, `penyetan sm fahri`. Jangan ada kata kerja transaksi (beli, bayar, pesan), kata waktu (kemarin, malem, tadi), atau filler (oiya, aku, juga).
- Satu pesan boleh berisi banyak item. Pisahkan per nominal dan jangan gabungkan.
- Metode bayar hanya diisi kalau disebut jelas di pesan (cash, tunai, transfer, qris, gopay, paylater). Kalau tidak disebut, isi `QRIS`.
- Makan dengan teman tetap NEED kalau makanan pokok. Traktir teman bukan pacar tetap mengikuti jenis makanannya.
- Kalau pesan menyebut pacar, cewe, ultah, atau hadiah, barang pendukungnya (kue, lilin, bunga, kartu) berintent GIFT, sedangkan makan biasa tetap NEED.
- Angka seperti `36.600` atau `36,600` artinya tiga puluh enam ribu enam ratus rupiah. `30.5k` artinya 30.500.

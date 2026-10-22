# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-and-dashboard.spec.js >> Diablo Finance E2E Testing >> 3. Navigation: can navigate between 4 main tabs
- Location: tests\e2e\auth-and-dashboard.spec.js:40:3

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - 'link "D Diablo Finance ID: 1128526190" [ref=e5] [cursor=pointer]':
          - /url: /
          - generic [ref=e6]: D
          - generic [ref=e8]:
            - generic [ref=e9]: Diablo Finance
            - generic [ref=e10]: "ID: 1128526190"
        - button "Keluar / Ganti Akun" [ref=e13]
    - navigation [ref=e17]:
      - link "Beranda" [ref=e18] [cursor=pointer]:
        - /url: /
      - link "Tabungan" [ref=e23] [cursor=pointer]:
        - /url: /tabungan
      - link "Riwayat" [ref=e28] [cursor=pointer]:
        - /url: /riwayat
      - link "Atur" [ref=e34] [cursor=pointer]:
        - /url: /atur
      - button "+ Catat" [ref=e37]
    - main [ref=e39]:
      - generic [ref=e40]:
        - generic [ref=e41]:
          - generic [ref=e42]:
            - generic [ref=e43]: Boleh Dipakai Hari Ini
            - generic [ref=e44]: Aman
          - generic [ref=e45]: 3 hari ke gajian (tgl 25)
        - heading "Rp 0" [level=1] [ref=e50]
        - generic [ref=e51]:
          - generic [ref=e52]:
            - generic [ref=e53]:
              - text: "Jatah normal:"
              - strong [ref=e54]: Rp 0/hari
            - generic [ref=e55]: •
            - generic [ref=e56]:
              - text: "Keluar hari ini:"
              - strong [ref=e57]: Rp 0
          - button "Catat Pengeluaran" [ref=e58]
      - generic [ref=e60]:
        - generic [ref=e61]:
          - generic [ref=e62]: Sisa Budget Siklus
          - generic [ref=e67]:
            - generic [ref=e68]: Rp 0
            - paragraph [ref=e69]: Dari alokasi bebas pakai Rp 0
          - generic [ref=e70]:
            - generic [ref=e71]: Terpakai siklus ini
            - generic [ref=e72]: Rp 0
        - link "Pos Tabungan Terkumpul Rp 0 Tersebar di 0 pos tabungan aktif Kelola pos tabungan Buka Tabungan" [ref=e73] [cursor=pointer]:
          - /url: /tabungan
          - generic [ref=e74]: Pos Tabungan Terkumpul
          - generic [ref=e82]:
            - generic [ref=e83]: Rp 0
            - paragraph [ref=e84]: Tersebar di 0 pos tabungan aktif
          - generic [ref=e85]:
            - generic [ref=e86]: Kelola pos tabungan
            - generic [ref=e87]: Buka Tabungan
      - generic [ref=e96]:
        - strong [ref=e97]: "Komentar Diablo:"
        - generic [ref=e98]: “Pundi-pundi Tuan masih aman dan terkendali. Kebutuhan pokok Tuan berada di porsi 0%, dan keinginan di 0%. Pertahankan disiplin ini.”
      - generic [ref=e99]:
        - generic [ref=e100]:
          - heading "5 Transaksi Terakhir" [level=3] [ref=e101]
          - link "Lihat Semua" [ref=e102] [cursor=pointer]:
            - /url: /riwayat
        - generic [ref=e105]: Belum ada transaksi tercatat. Ketik di bot Telegram atau klik “+ Catat”.
  - alert [ref=e106]
```
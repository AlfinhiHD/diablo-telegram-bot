import { test, expect } from "@playwright/test";
import { createLoginToken } from "../../lib/store.js";
import { signSession, SESSION_COOKIE } from "../../lib/auth.js";

test.describe("Diablo Finance E2E Testing", () => {
  test("1. Login Page: renders brand, instructions, and Telegram CTA", async ({ page }) => {
    await page.goto("/login");

    // Check title and header
    await expect(page.locator("h1")).toContainText("Diablo Finance");
    await expect(page.locator("text=Masuk Tanpa Password")).toBeVisible();

    // Check 3-step instructions
    await expect(page.getByText("@diablofin_bot").first()).toBeVisible();
    await expect(page.locator("text=/login").first()).toBeVisible();

    // Check Telegram CTA button
    const cta = page.locator("a[href='https://t.me/diablofin_bot']");
    await expect(cta).toBeVisible();
  });

  test("2. Auth Flow: exchanges token and logs into dashboard", async ({ page, context }) => {
    // Generate valid HMAC login token
    const token = await createLoginToken("1128526190");
    expect(token).toBeTruthy();

    // Visit verification URL
    await page.goto(`/auth/verify?token=${token}`);

    // Should redirect to /atur or /
    await expect(page).toHaveURL(/\/(atur|\?first=1)?$/);

    // Cookie session should be present
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === SESSION_COOKIE);
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.value).toContain(".");
  });

  test("3. Navigation: can navigate between 4 main tabs", async ({ page, context }) => {
    // Inject valid session cookie directly for speed
    const sessionValue = signSession("1128526190");
    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: sessionValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
      },
    ]);

    // Beranda
    await page.goto("/");
    await expect(page.locator("text=Boleh Dipakai Hari Ini")).toBeVisible();

    // Tabungan
    await page.locator("a[href='/tabungan']").locator("visible=true").click();
    await expect(page).toHaveURL("/tabungan");
    await expect(page.locator("h1")).toContainText("Pos Tabungan Fleksibel");

    // Riwayat
    await page.locator("a[href='/riwayat']").locator("visible=true").click();
    await expect(page).toHaveURL("/riwayat");
    await expect(page.locator("h1")).toContainText("Riwayat Transaksi");

    // Atur
    await page.locator("a[href='/atur']").locator("visible=true").click();
    await expect(page).toHaveURL("/atur");
    await expect(page.locator("h1")).toContainText("Pengaturan Pundi-pundi");
  });

  test("4. Quick Log Modal: opens and closes properly", async ({ page, context }) => {
    const sessionValue = signSession("1128526190");
    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: sessionValue,
        domain: "localhost",
        path: "/",
        httpOnly: true,
      },
    ]);

    await page.goto("/");
    // Click visible + Catat button (desktop or mobile)
    const catatBtn = page.locator("button:has-text('+ Catat')").locator("visible=true");
    await catatBtn.click();

    // Modal should be visible
    await expect(page.locator("text=Catat Pengeluaran Cepat")).toBeVisible();

    // Close modal
    await page.click("button:has-text('Batal')");
    await expect(page.locator("text=Catat Pengeluaran Cepat")).not.toBeVisible();
  });
});

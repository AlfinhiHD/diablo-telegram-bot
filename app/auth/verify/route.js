import { NextResponse } from "next/server";
import { consumeLoginToken, getUserProfile } from "@/lib/store";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", req.url));
  }

  const telegramUserId = await consumeLoginToken(token);
  if (!telegramUserId) {
    return NextResponse.redirect(new URL("/login?error=expired", req.url));
  }

  const sessionValue = signSession(telegramUserId);
  const profile = await getUserProfile(telegramUserId);

  const targetPath = profile && profile.monthlyIncome > 0 ? "/" : "/atur?first=1";
  const res = NextResponse.redirect(new URL(targetPath, req.url));

  res.cookies.set(SESSION_COOKIE, sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return res;
}

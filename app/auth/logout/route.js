import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

function clearSessionCookie(res) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    expires: new Date(0),
    path: "/",
  });
  return res;
}

export async function POST(req) {
  const accept = req.headers.get("accept") || "";
  if (accept.includes("application/json")) {
    return clearSessionCookie(NextResponse.json({ ok: true }));
  }
  const res = NextResponse.redirect(new URL("/login?logged_out=1", req.url), { status: 303 });
  return clearSessionCookie(res);
}

export async function GET(req) {
  const res = NextResponse.redirect(new URL("/login?logged_out=1", req.url));
  return clearSessionCookie(res);
}

// src/app/api/send-otp/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { captchaToken, ...payload } = body;

  if (!captchaToken) {
    return NextResponse.json({ success: false, message: "Missing captcha" }, { status: 400 });
  }

  try {
    // ✅ ตรวจสอบ token กับ Google reCAPTCHA
    const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY!, // ต้องเก็บไว้ใน .env
        response: captchaToken,
      }),
    });

    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return NextResponse.json({ success: false, message: "Captcha verification failed" }, { status: 400 });
    }

    // ✅ ผ่าน captcha → ส่งไปที่ n8n webhook ต่อ
    const res = await fetch("https://n8n-three.nn-dev.me/webhook/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    let message = "Unknown error";
    if (err instanceof Error) {
      message = err.message;
    }
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

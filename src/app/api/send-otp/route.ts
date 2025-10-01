// src/app/api/send-otp/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { captchaToken, ...payload } = body;

    if (!captchaToken) {
      return NextResponse.json(
        { success: false, message: "Missing captcha token" },
        { status: 400 }
      );
    }

    // ✅ ตรวจสอบ token กับ Google reCAPTCHA
    const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY ?? "",
        response: captchaToken,
      }),
    });

    const verifyData = await verifyRes.json();

    // Debug log (เฉพาะ dev)
    console.log("🔍 reCAPTCHA verify:", verifyData);

    if (!verifyData.success) {
      return NextResponse.json(
        { success: false, message: "Captcha verification failed", details: verifyData["error-codes"] },
        { status: 400 }
      );
    }

    // ✅ ถ้า captcha ผ่าน → ยิงไปที่ n8n webhook
    const res = await fetch("https://n8n-three.nn-dev.me/webhook/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { success: false, message: "n8n webhook error", details: text },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ success: true, ...data });
  } catch (err: unknown) {
    console.error("❌ send-otp error:", err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// src/app/api/meeting/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 🔹 Forward ไปที่ n8n webhook
    const res = await fetch(
      "https://n8n-three.nn-dev.me/webhook/3095d286-5486-4d33-8e31-7216c63e4f68",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw new Error(`n8n error: ${res.status}`);
    }

    // ✅ อ่าน response JSON ที่ n8n ส่งกลับมา
    const result = await res.json();

    // ✅ ส่งต่อให้ frontend ได้ใช้ต่อ
    return NextResponse.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    console.error("❌ Meeting API Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unexpected error",
      },
      { status: 500 }
    );
  }
}

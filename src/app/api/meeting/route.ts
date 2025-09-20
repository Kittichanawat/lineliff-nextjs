import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ส่งต่อไปที่ n8n webhook
    const res = await fetch(
      "https://n8n-three.nn-dev.me/webhook-test/fc963919-2417-4225-990b-01c2b6f2d78c",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw new Error(`n8n error: ${res.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    // ✅ แปลง err ก่อนใช้
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

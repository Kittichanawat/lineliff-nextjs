import { NextResponse } from "next/server";

let cachedGroupId: string | null = null;

// ✅ รับ groupId จาก n8n
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.groupId) {
      return NextResponse.json({ error: "❌ ต้องส่ง groupId" }, { status: 400 });
    }

    cachedGroupId = body.groupId;
    return NextResponse.json({ success: true, groupId: cachedGroupId });
  } catch {
    return NextResponse.json({ error: "❌ Invalid JSON" }, { status: 400 });
  }
}

// ✅ ให้ frontend มาดึง groupId
export async function GET() {
  if (!cachedGroupId) {
    return NextResponse.json({ error: "❌ ยังไม่มี groupId" }, { status: 404 });
  }
  return NextResponse.json({ groupId: cachedGroupId });
}

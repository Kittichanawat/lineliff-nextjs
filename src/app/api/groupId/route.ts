import { NextResponse } from "next/server";

let latestGroupId: string | null = null;

// ⬅️ POST จาก n8n
export async function POST(req: Request) {
    try {
      const { groupId } = await req.json();
      latestGroupId = groupId;
      return NextResponse.json({ ok: true, saved: groupId });
    } catch (err) {
      console.error("❌ Error in POST /api/groupId:", err);
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }
  }
  

// ⬅️ GET ให้ frontend เอา groupId ล่าสุด
export async function GET() {
  return NextResponse.json({ groupId: latestGroupId });
}

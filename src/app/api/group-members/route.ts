// src/app/api/group-members/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json({ error: "groupId required" }, { status: 400 });
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "LINE token missing" }, { status: 500 });
  }

  // 1. ดึง userId ทั้งหมดในกลุ่ม
  const resIds = await fetch(
    `https://api.line.me/v2/bot/group/${groupId}/members/ids`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const { memberIds } = await resIds.json();

  // 2. ดึง profile ทีละ userId
  const members = await Promise.all(
    memberIds.map(async (uid: string) => {
      const res = await fetch(`https://api.line.me/v2/bot/profile/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    })
  );

  return NextResponse.json(members.filter(Boolean));
}

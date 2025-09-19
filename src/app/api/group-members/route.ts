import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");

  if (!groupId) {
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

  // 1. Get all memberIds
  const idsRes = await fetch(
    `https://api.line.me/v2/bot/group/${groupId}/members/ids`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!idsRes.ok) {
    return NextResponse.json(
      { error: "Failed to fetch member IDs" },
      { status: 500 }
    );
  }

  const idsData = await idsRes.json();

  // 2. Fetch each member profile
  const profiles = await Promise.all(
    idsData.memberIds.map(async (userId: string) => {
      const res = await fetch(
        `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!res.ok) return null;
      return res.json();
    })
  );

  return NextResponse.json(profiles.filter(Boolean));
}

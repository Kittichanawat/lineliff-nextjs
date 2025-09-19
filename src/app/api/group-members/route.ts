import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");

  if (!groupId) {
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
  }

  try {
    // 🔑 ใช้ LINE Messaging API
    const res = await fetch(
      `https://api.line.me/v2/bot/group/${groupId}/members/ids`,
      {
        headers: {
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );

    const ids = await res.json();

    // Map userId → profile
    const members: unknown[] = [];
    for (const uid of ids.memberIds || []) {
      const profileRes = await fetch(
        `https://api.line.me/v2/bot/profile/${uid}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          },
        }
      );
      const profile = await profileRes.json();
      members.push(profile);
    }

    return NextResponse.json({ members });
} catch (err) {
    console.error("❌ Failed to fetch group members:", err);
    return NextResponse.json(
      { error: "Failed to fetch members" },
      { status: 500 }
    );
  }
}

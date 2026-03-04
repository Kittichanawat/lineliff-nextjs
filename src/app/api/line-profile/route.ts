import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const groupId = searchParams.get("groupId");

  if (!userId || !groupId) {
    return new Response(
      JSON.stringify({ error: "Missing userId or groupId" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing LINE_CHANNEL_ACCESS_TOKEN" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // ✅ ดึงโปรไฟล์สมาชิกในกลุ่ม
    const url = `https://api.line.me/v2/bot/group/${encodeURIComponent(
      groupId
    )}/member/${encodeURIComponent(userId)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return new Response(
        JSON.stringify({
          error: "Failed to fetch group member profile from LINE API",
          details: errorText,
          status: res.status,
        }),
        { status: res.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();

    return new Response(
      JSON.stringify({
        userId: data.userId,
        displayName: data.displayName,
        pictureUrl: data.pictureUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        details: (err as Error).message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
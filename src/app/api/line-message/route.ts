import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { groupId, calendarData, participants, meetingLink } = body;

    if (!groupId || !calendarData) {
      throw new Error("Missing groupId or calendarData");
    }

    const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN is missing");
    }

    // ✅ Flex Message
    const flexMessage = {
        to: groupId,
        messages: [
          {
            type: "flex",
            altText: calendarData.summary || "📅 Meeting",
            contents: {
              type: "bubble",
              size: "giga",
              body: {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "text",
                    text: calendarData.summary || "📌 ไม่มีหัวข้อ",
                    size: "xl",
                    weight: "bold",
                    wrap: true,
                  },
                  {
                    type: "text",
                    text: calendarData.description || "ไม่มีรายละเอียด",
                    size: "sm",
                    color: "#555555",
                    wrap: true,
                    margin: "md",
                  },
                  {
                    type: "text",
                    text: `⏰ ${calendarData.startDate || "-"} ${calendarData.startTime || ""} - ${calendarData.endDate || "-"} ${calendarData.endTime || ""}`,
                    size: "sm",
                    color: "#333333",
                    margin: "md",
                  },
                  {
                    type: "text",
                    text: participants.length > 0 ? `👥 ${participants.join(", ")}` : "👥 ไม่มีผู้เข้าร่วม",
                    size: "sm",
                    color: "#111111",
                    wrap: true,
                    margin: "md",
                  },
                ],
              },
              footer: {
                type: "box",
                layout: "vertical",
                contents: [
                  meetingLink
                    ? {
                        type: "button",
                        style: "primary",
                        color: "#6C63FF",
                        action: {
                          type: "uri",
                          label: "เข้าร่วมประชุม",
                          uri: meetingLink,
                        },
                      }
                    : {
                        type: "text",
                        text: "❌ ไม่มีลิงก์ประชุม",
                        color: "#999999",
                        align: "center",
                      },
                  {
                    type: "button",
                    style: "link",
                    action: {
                      type: "uri",
                      label: "📅 เปิดใน Google Calendar",
                      uri: calendarData.calendarLink || "https://calendar.google.com",
                    },
                  },
                ],
              },
            },
          },
        ],
      };
      

    // ✅ Call LINE Messaging API
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(flexMessage),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LINE API error: ${res.status} - ${text}`);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("❌ LINE Message Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

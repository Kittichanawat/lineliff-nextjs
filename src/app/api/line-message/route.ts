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
                    type: "box",
                    layout: "horizontal",
                    contents: [
                      {
                        type: "box",
                        layout: "vertical",
                        contents: [
                          {
                            type: "text",
                            text: calendarData.summary || "📌 ไม่มีหัวข้อ",
                            size: "xl",
                            weight: "bold",
                            color: "#333333",
                            wrap: true,
                          },
                          {
                            type: "text",
                            text: `${calendarData.startDate || "-"} | ${calendarData.startTime || ""} - ${calendarData.endTime || ""}`,
                            size: "xxl",
                            weight: "bold",
                            color: "#333333",
                            margin: "sm",
                            adjustMode: "shrink-to-fit",
                          },
                          {
                            type: "text",
                            text: calendarData.description || "ไม่มีรายละเอียด",
                            size: "sm",
                            color: "#aaaaaa",
                            margin: "md",
                            wrap: true,
                          },
                        ],
                        flex: 2,
                      },
                      {
                        type: "box",
                        layout: "vertical",
                        contents: [
                          {
                            type: "image",
                            url: "https://raw.githubusercontent.com/Kittichanawat/LineOA/refs/heads/main/codelabss.png",
                            size: "full",
                            aspectRatio: "1:1",
                            aspectMode: "fit",
                          },
                        ],
                        flex: 1,
                        paddingAll: "10px",
                      },
                    ],
                    paddingAll: "20px",
                    backgroundColor: "#D8F3E4",
                    cornerRadius: "md",
                  },
                  {
                    type: "box",
                    layout: "vertical",
                    contents: [
                      {
                        type: "text",
                        text: "ผู้เข้าร่วมประชุม",
                        weight: "bold",
                        size: "md",
                        align: "center",
                        margin: "lg",
                        color: "#555555",
                      },
                      {
                        type: "separator",
                        margin: "md",
                        color: "#eeeeee",
                      },
                      {
                        type: "text",
                        text: participants.length > 0
                          ? `👥 ${participants.join(", ")}`
                          : "👥 ไม่มีผู้เข้าร่วม",
                        size: "sm",
                        color: "#111111",
                        wrap: true,
                        margin: "md",
                      },
                    ],
                    paddingAll: "20px",
                    paddingTop: "0px",
                  },
                ],
                spacing: "lg",
              },
              footer: {
                type: "box",
                layout: "vertical",
                contents: [
                  meetingLink
                    ? {
                        type: "button",
                        action: {
                          type: "uri",
                          label: "เข้าร่วมประชุม (Meet)",
                          uri: meetingLink,
                        },
                        style: "primary",
                        color: "#76D7C4",
                        height: "sm",
                      }
                    : {
                        type: "text",
                        text: "❌ ไม่มีลิงก์ประชุม",
                        color: "#999999",
                        align: "center",
                      },
                  {
                    type: "button",
                    action: {
                      type: "uri",
                      label: "เปิดใน Google Calendar",
                      uri: calendarData.calendarLink || "https://calendar.google.com",
                    },
                    style: "link",
                    height: "sm",
                    color: "#6C63FF",
                  },
                ],
                paddingAll: "20px",
                paddingTop: "10px",
                spacing: "sm",
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

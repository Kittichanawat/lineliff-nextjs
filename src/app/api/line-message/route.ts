import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { groupId, calendarData, participants, meetingLink } = body;

    const flexMessage = {
      to: groupId,
      messages: [
        {
          type: "flex",
          altText: calendarData.summary,
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
                          text: calendarData.summary,
                          size: "xl",
                          weight: "bold",
                          color: "#333333",
                          wrap: true,
                        },
                        {
                          type: "text",
                          text: `${calendarData.startDate} | ${calendarData.startTime} - ${calendarData.endTime}`,
                          size: "md",
                          color: "#555555",
                          margin: "sm",
                        },
                        {
                          type: "text",
                          text: calendarData.description,
                          size: "sm",
                          color: "#aaaaaa",
                          wrap: true,
                        },
                      ],
                      flex: 2,
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
                    { type: "text", text: "ผู้เข้าร่วมประชุม", weight: "bold", align: "center", margin: "lg" },
                    {
                      type: "box",
                      layout: "vertical",
                      contents: participants.map((p: string) => ({
                        type: "text",
                        text: p,
                        size: "md",
                        color: "#555555",
                      })),
                    },
                  ],
                  paddingAll: "20px",
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
                      action: { type: "uri", label: "เข้าร่วมประชุม", uri: meetingLink },
                      style: "primary",
                      color: "#76D7C4",
                    }
                  : {
                      type: "text",
                      text: "❌ ไม่มีลิงก์ประชุม",
                      align: "center",
                      color: "#999999",
                    },
                {
                  type: "button",
                  action: {
                    type: "uri",
                    label: "เปิดใน Google Calendar",
                    uri: calendarData.calendarLink,
                  },
                  style: "link",
                  color: "#6C63FF",
                },
              ],
            },
          },
        },
      ],
    };

    // 🔹 ส่งไปยัง LINE Messaging API
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(flexMessage),
    });

    if (!res.ok) {
      throw new Error(`LINE API error: ${res.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("❌ LINE Message Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

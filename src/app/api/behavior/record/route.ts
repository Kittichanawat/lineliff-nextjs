// src/app/api/behavior/record/route.ts
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// --- 1. Interfaces Definition ---
interface BehaviorRule {
  score: number;
  severity: string;
  category: string;
  description: string;
}

interface FlexMessageData {
  category: string;
  score: number;
  total_deducted: number;
  reason: string;
}

interface UserSocialLoginData {
  provider_id: string;
}

interface BehaviorRecordRow {
  score_snapshot: number;
}

interface RequestBody {
  user_id: number;
  rule_id: number;
  reason: string;
  hr_id: number;
}

const supabaseAdmin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// --- 3. LINE Messaging Function ---
async function sendLineFlex(lineUserId: string, flexContents: object): Promise<void> {
  const LINE_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{
          type: "flex",
          altText: "แจ้งเตือนสถานะพฤติกรรม ✨",
          contents: flexContents
        }],
      }),
    });
  } catch (error: unknown) {
    console.error("LINE Messaging Error:", error);
  }
}

// --- 4. Flex Message Templates ---

// 4.1 Normal Flex (คะแนน 0-7)
function getNormalFlex(data: FlexMessageData): object {
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "DEDUCTION NOTICE", weight: "bold", color: "#ffffff", size: "xs" }],
      backgroundColor: "#4F46E5",
      paddingAll: "md",
      paddingStart: "xl"
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "แจ้งเตือนการหักคะแนนพฤติกรรม", weight: "bold", size: "md", color: "#1F2937" },
        {
          type: "box",
          layout: "vertical",
          margin: "lg",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "สาเหตุ", size: "sm", color: "#6B7280", flex: 2 },
                { type: "text", text: data.category, size: "sm", color: "#1F2937", flex: 4, wrap: true, weight: "bold" }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "จำนวนที่หัก", size: "sm", color: "#6B7280", flex: 2 },
                { type: "text", text: `-${data.score} คะแนน`, size: "sm", color: "#EF4444", flex: 4, weight: "bold" }
              ]
            }
          ]
        },
        { type: "separator", margin: "xl" },
        {
          type: "box",
          layout: "vertical",
          margin: "xl",
          contents: [
            { type: "text", text: "สถานะคะแนนเสียสะสม", size: "xs", color: "#9CA3AF", weight: "bold" },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: `${data.total_deducted} / 16`, size: "xxl", weight: "bold", color: "#4F46E5" },
                { type: "text", text: "คะแนน", size: "xs", color: "#6B7280", gravity: "bottom", margin: "sm" }
              ],
              alignItems: "flex-end"
            },
            {
              type: "box",
              layout: "vertical",
              margin: "md",
              backgroundColor: "#F5F3FF",
              cornerRadius: "md",
              paddingAll: "md",
              contents: [
                { type: "text", text: "⚠️ ระบบจะแจ้งเตือนใบแดงทันทีหากคะแนนเสียสะสมครบ 16 คะแนน", size: "xxs", color: "#4338CA", wrap: true }
              ]
            }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#4F46E5",
          cornerRadius: "md",
          height: "35px",
          justifyContent: "center",
          action: { type: "uri", label: "Check", uri: "https://lineliff-nextjs.vercel.app/history" },
          contents: [
            { type: "text", text: "ตรวจสอบรายละเอียด", color: "#FFFFFF", align: "center", size: "sm", weight: "bold" }
          ]
        }
      ]
    }
  };
}

// 4.2 Yellow Card Flex (คะแนน 8-15)
function getYellowCardFlex(data: FlexMessageData): object {
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "WARNING: YELLOW CARD", weight: "bold", color: "#1F2937", size: "xs" }],
      backgroundColor: "#FFD700",
      paddingAll: "md",
      paddingStart: "xl"
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "image", url: "https://cdn-icons-png.flaticon.com/512/2817/2817867.png", size: "xs", aspectMode: "fit", flex: 1 },
            { type: "text", text: "ได้รับใบเหลืองตักเตือน", weight: "bold", size: "md", color: "#1F2937", flex: 4, gravity: "center", margin: "md" }
          ]
        },
        {
          type: "box",
          layout: "vertical",
          margin: "lg",
          backgroundColor: "#FFFBEB",
          paddingAll: "md",
          cornerRadius: "md",
          contents: [
            { type: "text", text: `แต้มเสียสะสมปัจจุบัน: ${data.total_deducted} / 16`, size: "sm", color: "#92400E", weight: "bold" },
            { type: "text", text: "กรุณาปรับปรุงพฤติกรรม หากสะสมครบ 16 แต้ม จะต้องเข้าพบฝ่ายบุคคล", size: "xs", color: "#B45309", wrap: true, margin: "sm" }
          ]
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "รายการล่าสุด", size: "xs", color: "#6B7280", flex: 2 },
                { type: "text", text: data.category, size: "xs", color: "#1F2937", flex: 4, weight: "bold", wrap: true }
              ]
            },
            {
              type: "box",
              layout: "horizontal",
              contents: [
                { type: "text", text: "รายละเอียด", size: "xs", color: "#6B7280", flex: 2 },
                { type: "text", text: data.reason || "-", size: "xs", color: "#1F2937", flex: 4, wrap: true }
              ]
            }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1F2937",
          cornerRadius: "md",
          height: "35px",
          justifyContent: "center",
          action: { type: "uri", label: "Check", uri: "https://lineliff-nextjs.vercel.app/history" },
          contents: [
            { type: "text", text: "ตรวจสอบรายละเอียด", color: "#FFFFFF", align: "center", size: "sm", weight: "bold" }
          ]
        }
      ]
    }
  };
}

// 4.3 Red Card Flex (คะแนน 16+)
function getRedCardFlex(data: FlexMessageData): object {
  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      contents: [{ type: "text", text: "CRITICAL: RED CARD", weight: "bold", color: "#ffffff", size: "xs" }],
      backgroundColor: "#EF4444",
      paddingAll: "md",
      paddingStart: "xl"
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            { type: "image", url: "https://cdn-icons-png.flaticon.com/512/12691/12691750.png", size: "xs", aspectMode: "fit", flex: 1 },
            { type: "text", text: "ใบแดง: สถานะวิกฤต", weight: "bold", size: "md", color: "#EF4444", flex: 4, gravity: "center", margin: "md" }
          ]
        },
        {
          type: "box",
          layout: "vertical",
          margin: "lg",
          backgroundColor: "#FEF2F2",
          paddingAll: "md",
          cornerRadius: "md",
          contents: [
            { type: "text", text: `แต้มเสียสะสมครบ ${data.total_deducted} / 16`, size: "sm", color: "#991B1B", weight: "bold" },
            { type: "text", text: `สาเหตุ: ${data.category}`, size: "xs", color: "#B91C1C", weight: "bold", margin: "sm" },
            { type: "text", text: `รายละเอียด: ${data.reason || "-"}`, size: "xs", color: "#B91C1C", wrap: true, margin: "xs" },
            { type: "separator", margin: "md", color: "#FECACA" },
            { type: "text", text: "ขณะนี้คะแนนของคุณถึงจุดตัดสูงสุดแล้ว ระบบได้แจ้งเรื่องไปยังฝ่ายที่เกี่ยวข้องเพื่อพิจารณาบทลงโทษ", size: "xs", color: "#B91C1C", wrap: true, margin: "md" }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "md",
      contents: [
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#1F2937",
          cornerRadius: "md",
          height: "35px",
          justifyContent: "center",
          action: { type: "uri", label: "Check", uri: "https://lineliff-nextjs.vercel.app/history" },
          contents: [
            { type: "text", text: "ตรวจสอบรายละเอียด", color: "#FFFFFF", align: "center", size: "sm", weight: "bold" }
          ]
        }
      ]
    }
  };
}

// --- Main API Route ---
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { user_id, rule_id, reason, hr_id }: RequestBody = await req.json();

    const { data: rule, error: ruleError } = await supabaseAdmin
      .from("behavior_rules")
      .select("score, severity, category, description")
      .eq("id", rule_id)
      .returns<BehaviorRule[]>()
      .single();

    if (ruleError || !rule) throw new Error("ไม่พบข้อมูลกฎพฤติกรรม");

    const { error: insertError } = await supabaseAdmin.from("behavior_records").insert({
      user_id,
      rule_id,
      reason,
      score_snapshot: rule.score,
      severity_snapshot: rule.severity,
      category_snapshot: rule.category,
      created_by: hr_id,
    });

    if (insertError) throw insertError;

    const { data: socialData, error: userError } = await supabaseAdmin
      .from("user_social_logins")
      .select("provider_id")
      .eq("user_id", user_id)
      .eq("provider", "line")
      .returns<UserSocialLoginData[]>()
      .single();

    if (userError) console.warn("User has no LINE linked");

    const { data: records, error: recordsError } = await supabaseAdmin
      .from("behavior_records")
      .select("score_snapshot")
      .eq("user_id", user_id)
      .returns<BehaviorRecordRow[]>();

    if (recordsError) throw recordsError;

    const totalDeducted: number = records?.reduce((sum: number, r: BehaviorRecordRow) => sum + r.score_snapshot, 0) || 0;

    if (socialData?.provider_id) {
      const msgData: FlexMessageData = {
        category: rule.description,
        score: rule.score,
        total_deducted: totalDeducted,
        reason: reason // ข้อมูลหมายเหตุจาก HR
      };

      let flexPayload: object;
      if (totalDeducted >= 16) {
        flexPayload = getRedCardFlex(msgData);
      } else if (totalDeducted >= 8) {
        flexPayload = getYellowCardFlex(msgData);
      } else {
        flexPayload = getNormalFlex(msgData);
      }

      await sendLineFlex(socialData.provider_id, flexPayload);
    }

    return NextResponse.json({ success: true, total: totalDeducted });
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
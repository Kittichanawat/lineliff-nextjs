// src/app/api/behavior/history/route.ts
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

interface SocialLogin {
  provider: string;
  provider_id: string;
}

interface RecorderData {
  flname: string | null;
  user_social_logins: SocialLogin[] | null;
}

interface BehaviorRecordRow {
  id: number;
  reason: string | null;
  score_snapshot: number;
  category_snapshot: string;
  created_at: string;
  behavior_rules: { description: string };
  recorder: RecorderData | null;
}

interface UserSocialLoginData {
  user_id: number;
  user: {
    flname: string | null;
  } | null;
}

const supabaseAdmin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = authHeader.replace("Bearer ", "");

    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const profile = await profileRes.json();
    if (profile.error) throw new Error("Invalid LINE Token");

    const lineUid = String(profile.userId);

    // เพิ่ม join user เพื่อดึง flname ของตัวเอง
    const { data: userData, error: userError } = await supabaseAdmin
      .from("user_social_logins")
      .select(`
        user_id,
        user ( flname )
      `)
      .eq("provider", "line")
      .eq("provider_id", lineUid)
      .returns<UserSocialLoginData[]>()
      .single();

    if (userError || !userData) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const myName = userData.user?.flname || "ไม่ระบุชื่อ";

    const { data: records, error: recordsError } = await supabaseAdmin
      .from("behavior_records")
      .select(`
        id, reason, score_snapshot, category_snapshot, created_at,
        behavior_rules ( description ),
        recorder:user!fk_behavior_created_by (
          flname,
          user_social_logins ( provider, provider_id )
        )
      `)
      .eq("user_id", userData.user_id)
      .order("created_at", { ascending: false })
      .returns<BehaviorRecordRow[]>();

    if (recordsError) throw recordsError;

    const linePicCache = new Map<string, string | null>();
    const lineBotToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    const formattedRecords = await Promise.all((records || []).map(async (r: BehaviorRecordRow) => {
      let pictureUrl: string | null = null;
      let providerId: string | null = null;

      if (r.recorder?.user_social_logins) {
        const lineLogin = r.recorder.user_social_logins.find((login: SocialLogin) => login.provider === 'line');
        if (lineLogin) providerId = lineLogin.provider_id;
      }

      if (providerId && lineBotToken) {
        if (linePicCache.has(providerId)) {
          pictureUrl = linePicCache.get(providerId) || null;
        } else {
          try {
            const res = await fetch(`https://api.line.me/v2/bot/profile/${providerId}`, {
              headers: { Authorization: `Bearer ${lineBotToken}` }
            });
            if (res.ok) {
              const lineData = await res.json();
              pictureUrl = lineData.pictureUrl ? String(lineData.pictureUrl) : null;
            }
            linePicCache.set(providerId, pictureUrl);
          } catch (err: unknown) {
            console.error("Error fetching line profile:", err);
            linePicCache.set(providerId, null);
          }
        }
      }

      return {
        id: r.id,
        reason: r.reason,
        score_snapshot: r.score_snapshot,
        category_snapshot: r.category_snapshot,
        created_at: r.created_at,
        behavior_rules: r.behavior_rules,
        recorder: {
          flname: r.recorder?.flname || "ฝ่ายบุคคล",
          picture_url: pictureUrl
        }
      };
    }));

    const totalDeducted: number = formattedRecords.reduce((sum: number, r) => sum + r.score_snapshot, 0);

    return NextResponse.json({
      success: true,
      data: formattedRecords,
      total_deducted: totalDeducted,
      my_name: myName  // ส่งชื่อตัวเองกลับไปด้วย
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// --- กำหนด Interface ให้ตรงกับโครงสร้าง Database และการ Join ---

interface LineProfile {
  userId: number;
  uline_id: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  email: string;
}

interface BehaviorRule {
  id: number;
  category: string;
  severity: string;
  score: number;
  description: string;
  is_active: boolean;
}

// โครงสร้างที่ได้จากการ Join 5 ตาราง
interface AuthResponse {
  user_id: number;
  user: {
    id: number;
    dep_pos: {
      departments: {
        dep_name: string;
      } | null;
      position: {
        p_name: string;
      } | null;
    } | null;
  } | null;
}

interface UserQueryResponse {
  id: number;
  flname: string;
  email: string;
  user_social_logins: {
    provider_id: string;
  }[];
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const { uline_id }: { uline_id: string } = await req.json();

    if (!uline_id) {
      return NextResponse.json({ success: false, error: "Missing LINE ID" }, { status: 400 });
    }

    // 1. ตรวจสอบสิทธิ์ (Join: user_social_logins -> user -> dep_pos -> departments -> position)
    const { data: authData, error: authError } = await supabaseAdmin
      .from("user_social_logins")
      .select(`
        user_id,
        user!inner (
          id,
          dep_pos!user_position_fkey (
            departments!dep_pos_dep_id_fkey ( dep_name ),
            position!dep_pos_p_id_fkey ( p_name )
          )
        )
      `)
      .eq("provider", "line")
      .eq("provider_id", uline_id)
      .single();

    // 🛠️ แก้ไขปัญหา Property 'user' does not exist on type 'never' โดยการทำ Type Assertion
    const typedAuthData = (authData as unknown) as AuthResponse;

    if (authError || !typedAuthData?.user?.dep_pos?.departments) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: ไม่พบข้อมูลพนักงานหรือแผนก" },
        { status: 403 }
      );
    }

    const depName = typedAuthData.user.dep_pos.departments.dep_name;

    // ตรวจสอบว่าต้องเป็นแผนก Administration (HR) เท่านั้น
    if (depName !== "Administration") {
      return NextResponse.json(
        { success: false, error: `Unauthorized: เฉพาะแผนก HR เท่านั้น (คุณอยู่แผนก ${depName})` },
        { status: 403 }
      );
    }

    // 2. ดึงข้อมูล Rules และ พนักงานทั้งหมด
    const [rulesRes, usersRes] = await Promise.all([
      supabaseAdmin
        .from("behavior_rules")
        .select("*")
        .eq("is_active", true)
        .returns<BehaviorRule[]>(),
      supabaseAdmin
        .from("user")
        .select(`
          id, 
          flname, 
          email,
          user_social_logins!user_social_logins_user_id_fkey (
            provider_id
          )
        `)
        .order("id")
        .returns<UserQueryResponse[]>()
    ]);

    if (rulesRes.error || usersRes.error) {
      throw new Error("Failed to fetch internal data");
    }

    // 3. จัดการข้อมูลพนักงานและดึงโปรไฟล์ LINE
    const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const formattedUsers: LineProfile[] = await Promise.all(
      (usersRes.data || []).map(async (u) => {
        const lineLogin = u.user_social_logins?.find((s) => s.provider_id.startsWith("U"));
        const targetUlineId = lineLogin?.provider_id || null;

        let displayName = u.flname;
        let pictureUrl: string | null = null;

        if (targetUlineId && CHANNEL_ACCESS_TOKEN) {
          try {
            const lineRes = await fetch(`https://api.line.me/v2/bot/profile/${targetUlineId}`, {
              headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
            });
            if (lineRes.ok) {
              const profile = await lineRes.json();
              displayName = profile.displayName;
              pictureUrl = profile.pictureUrl;
            }
          } catch (err) {
            console.error("Line fetch error", err);
          }
        }

        return {
          userId: u.id,
          uline_id: targetUlineId,
          displayName,
          pictureUrl,
          email: u.email
        };
      })
    );

    return NextResponse.json({
      success: true,
      rules: rulesRes.data || [],
      users: formattedUsers,
      hrId: typedAuthData.user.id
    });

  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Internal Error" },
      { status: 500 }
    );
  }
}
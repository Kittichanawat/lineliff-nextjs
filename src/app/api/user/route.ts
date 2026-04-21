// src/app/api/user/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Type สำหรับโครงสร้างที่ต้องการ Return
export type LineProfile = {
  userId: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  email: string;
};

// Type ช่วยในการ Query
type SocialLogin = {
  provider: string;
  provider_id: string;
};

type UserWithSocial = {
  email: string;
  user_social_logins: SocialLogin[];
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET() {
  try {
    // 1. ดึงข้อมูลอีเมล และผูกกับ LINE ID จากฐานข้อมูล
    const { data, error } = await supabaseAdmin
      .from("user")
      .select(`
        email,
        user_social_logins (
          provider,
          provider_id
        )
      `)
      .order("id", { ascending: true });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    // 2. Map ข้อมูลและยิงดึง Profile จาก LINE 
    const formattedUsers: LineProfile[] = await Promise.all(
      (data as UserWithSocial[]).map(async (u) => {
        const lineLogin = u.user_social_logins?.find((social) => social.provider === "line");
        const uline_id = lineLogin ? lineLogin.provider_id : null;

        let displayName = null;
        let pictureUrl = null;

        // ดึงชื่อและรูปจาก LINE API
        if (uline_id && CHANNEL_ACCESS_TOKEN) {
          try {
            const lineRes = await fetch(`https://api.line.me/v2/bot/profile/${uline_id}`, {
              headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
            });
            if (lineRes.ok) {
              const profile = await lineRes.json();
              displayName = profile.displayName;
              pictureUrl = profile.pictureUrl;
            }
          } catch { // 🟢 ไม่ต้องมี (err)
            console.error("Failed to fetch LINE profile for", uline_id);
          }
        }

        // 3. Return โครงสร้างข้อมูลตามที่คุณระบุเป๊ะๆ
        return {
          userId: uline_id,
          displayName: displayName,
          pictureUrl: pictureUrl,
          email: u.email,
        } as LineProfile;
      })
    );

    // ผมส่งกลับเป็น Array ตรงๆ เลย จะได้ใช้ง่ายๆ 
    // หรือถ้า UI ของคุณยังคาดหวัง { success: true, users: [...] } อยู่ แจ้งผมแก้ได้นะครับ
    return NextResponse.json({ success: true, users: formattedUsers });
    
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
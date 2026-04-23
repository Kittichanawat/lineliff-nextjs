import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// --- Interfaces ---
interface BehaviorRecordRow {
  id: number;
  reason: string;
  score_snapshot: number;
  category_snapshot: string;
  created_at: string;
  behavior_rules: { description: string };
}

interface UserSocialLoginData {
  user_id: number;
}

// Initialize Supabase Admin (Service Role Key)
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

    // 1. Verify LINE Token & Get Profile
    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const profile = await profileRes.json();
    if (profile.error) throw new Error("Invalid LINE Token");

    const lineUid = profile.userId;

    // 2. Find internal user_id from provider_id
    const { data: userData, error: userError } = await supabaseAdmin
      .from("user_social_logins")
      .select("user_id")
      .eq("provider_id", lineUid)
      .returns<UserSocialLoginData[]>()
      .single();

    if (userError || !userData) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 3. Fetch Records with Join (Bypass RLS via Service Role Key)
    const { data: records, error: recordsError } = await supabaseAdmin
      .from("behavior_records")
      .select(`
        id, reason, score_snapshot, category_snapshot, created_at,
        behavior_rules ( description )
      `)
      .eq("user_id", userData.user_id)
      .order("created_at", { ascending: false })
      .returns<BehaviorRecordRow[]>();

    if (recordsError) throw recordsError;

    const totalDeducted = records?.reduce((sum, r) => sum + r.score_snapshot, 0) || 0;

    return NextResponse.json({
      success: true,
      data: records,
      total_deducted: totalDeducted
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
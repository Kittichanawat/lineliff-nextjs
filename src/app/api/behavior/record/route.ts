import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const { user_id, rule_id, reason, hr_id }: { 
      user_id: number; 
      rule_id: number; 
      reason: string; 
      hr_id: number 
    } = await req.json();

    // 1. ดึงข้อมูล Rule ปัจจุบันเพื่อทำ Snapshot (ป้องกันข้อมูลเปลี่ยนภายหลัง)
    const { data: rule, error: ruleError } = await supabaseAdmin
      .from("behavior_rules")
      .select("score, severity, category")
      .eq("id", rule_id)
      .single();

    if (ruleError || !rule) throw new Error("ไม่พบข้อมูลกฎพฤติกรรม");

    // 2. บันทึก Record ลงในตาราง behavior_records
    const { error: insertError } = await supabaseAdmin
      .from("behavior_records")
      .insert({
        user_id,
        rule_id,
        reason,
        score_snapshot: rule.score,
        severity_snapshot: rule.severity,
        category_snapshot: rule.category,
        created_by: hr_id
      });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
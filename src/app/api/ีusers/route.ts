import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type UserRow = {
  uline_id: string;
  email: string;
};

// ใช้ service role (ห้าม NEXT_PUBLIC)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("user")
      .select("uline_id, email")
      .order("id", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      users: (data ?? []) as UserRow[],
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
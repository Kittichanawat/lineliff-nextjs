// src/app/api/departments/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Position = { p_id: string; p_name: string };
type Department = { dep_id: string; dep_name: string; positions: Position[] };

type RawDepartment = { dep_id: number; dep_name: string };
type RawPosition = { p_id: number; p_name: string };
type RawDepPos = { dep_id: number; p_id: number };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET() {
  try {
    // 1) ดึง departments + positions + relations (dep_pos)
    const [{ data: deps, error: depErr }, { data: poss, error: posErr }, { data: rels, error: relErr }] =
      await Promise.all([
        supabaseAdmin.from("departments").select("dep_id, dep_name").order("dep_id"),
        supabaseAdmin.from("position").select("p_id, p_name").order("p_id"),
        supabaseAdmin.from("dep_pos").select("dep_id, p_id"),
      ]);

    if (depErr || posErr || relErr) {
      return NextResponse.json(
        {
          message: "supabase_error",
          details: depErr?.message || posErr?.message || relErr?.message,
        },
        { status: 500 }
      );
    }

    const departments = (deps ?? []) as RawDepartment[];
    const positions = (poss ?? []) as RawPosition[];
    const depPos = (rels ?? []) as RawDepPos[];

    // 2) ทำ map: p_id -> position
    const posById = new Map<number, RawPosition>();
    for (const p of positions) posById.set(p.p_id, p);

    // 3) ทำ map: dep_id -> p_id[]
    const depToPosIds = new Map<number, number[]>();
    for (const r of depPos) {
      if (!depToPosIds.has(r.dep_id)) depToPosIds.set(r.dep_id, []);
      depToPosIds.get(r.dep_id)!.push(r.p_id);
    }

    // 4) สร้างผลลัพธ์ตาม format ที่ page.tsx ต้องการ
    const result: Department[] = departments.map((d) => {
      const ids = depToPosIds.get(d.dep_id) ?? [];

      // กันซ้ำ + เรียงตาม p_id (เพื่อ UI สวยและ stable)
      const uniqueSortedIds = Array.from(new Set(ids)).sort((a, b) => a - b);

      const mappedPositions: Position[] = uniqueSortedIds
        .map((pid) => posById.get(pid))
        .filter((p): p is RawPosition => Boolean(p))
        .map((p) => ({ p_id: String(p.p_id), p_name: p.p_name }));

      return {
        dep_id: String(d.dep_id),
        dep_name: d.dep_name,
        positions: mappedPositions,
      };
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error("❌ /api/departments error:", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
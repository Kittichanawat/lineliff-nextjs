// src/app/api/verify-otp/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// ---------- Types ----------
type VerifyResp = { message: "success" | "duplicate" | "otp_invalid" | "otp_expired" | "otp_locked" | string };

// form จาก page.tsx
const formSchema = z.object({
  flname: z.string().min(1),
  nname: z.string().min(1),
  dob: z.string().min(1), // "YYYY-MM-DD"
  department: z.string().min(1),
  position: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5),
});

const bodySchema = z.object({
  idToken: z.string().min(10),
  otp: z.string().regex(/^\d{6}$/),
  form: formSchema,
  // แนะนำให้ส่ง captchaToken มาด้วย (optional เผื่อคุณยังไม่แก้ page.tsx)
  captchaToken: z.string().min(1).optional(),
});

type RecaptchaVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

type LineVerifyOk = { ok: true; sub: string };
type LineVerifyFail = { ok: false; message: "missing_line_channel_id" | "line_token_invalid" | "line_sub_missing" };
type LineVerifyResult = LineVerifyOk | LineVerifyFail;

type LineVerifyResponse = { sub?: string };

// ---------- Supabase Admin ----------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
if (!SERVICE_KEY) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------- Helpers ----------
function hashOtp(otp: string) {
  const pepper = process.env.OTP_PEPPER || "";
  return crypto.createHash("sha256").update(otp + pepper).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function parseIso(s: string) {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

async function verifyRecaptcha(token: string, ip?: string) {
  const secret = process.env.RECAPTCHA_SECRET_KEY ?? "";
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret,
      response: token,
      ...(ip ? { remoteip: ip } : {}),
    }),
  });

  const data = (await res.json()) as RecaptchaVerifyResponse;
  return data;
}

async function verifyLineIdToken(idToken: string): Promise<LineVerifyResult> {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID?.trim();
  if (!clientId) return { ok: false, message: "missing_line_channel_id" };

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }).toString(),
  });

  if (!res.ok) return { ok: false, message: "line_token_invalid" };

  const data = (await res.json()) as LineVerifyResponse;
  const sub = typeof data.sub === "string" ? data.sub : "";
  if (!sub) return { ok: false, message: "line_sub_missing" };
  return { ok: true, sub };
}

function getIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

// ---------- DB row types ----------
type OtpRow = {
  id: number; // ถ้าของคุณชื่อไม่ใช่ id ให้แก้เป็นชื่อ PK จริง เช่น otp_id
  email: string;
  line_sub: string;
  otp_hash: string;
  expires_at: string;
  used: boolean;
  attempts: number;
  locked_until: string | null;
  created_at: string;
};

export async function POST(req: Request) {
  const ip = getIp(req);

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "bad_request" } satisfies VerifyResp, { status: 400 });
    }

    const { idToken, otp, form, captchaToken } = parsed.data;

    // (optional) captcha check
    if (captchaToken) {
      const rc = await verifyRecaptcha(captchaToken, ip);
      if (!rc.success) {
        return NextResponse.json({ message: "captcha_failed" } satisfies VerifyResp, { status: 400 });
      }
    }

    // LINE verify
    const line = await verifyLineIdToken(idToken);
    if (!line.ok) {
      return NextResponse.json({ message: line.message } satisfies VerifyResp, { status: 401 });
    }

    const email = form.email.trim().toLowerCase();

    // duplicate check: ถ้ามี user อยู่แล้วให้ตอบ duplicate
    const { data: existed, error: existErr } = await supabaseAdmin
      .from("user")
      .select("id")
      .eq("uline_id", line.sub)
      .limit(1)
      .maybeSingle();

    if (existErr) {
      return NextResponse.json({ message: "supabase_error" } satisfies VerifyResp, { status: 500 });
    }
    if (existed) {
      return NextResponse.json({ message: "duplicate" } satisfies VerifyResp, { status: 200 });
    }

    // หา OTP ล่าสุดของ email + line_sub
    const { data: otpRow, error: otpErr } = await supabaseAdmin
      .from("otp_requests")
      .select("id,email,line_sub,otp_hash,expires_at,used,attempts,locked_until,created_at")
      .eq("email", email)
      .eq("line_sub", line.sub)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<OtpRow>();

    if (otpErr) {
      return NextResponse.json({ message: "supabase_error" } satisfies VerifyResp, { status: 500 });
    }
    if (!otpRow) {
      return NextResponse.json({ message: "otp_invalid" } satisfies VerifyResp, { status: 200 });
    }

    // ถ้า used ไปแล้ว (เคสกดย้อน/รีเฟรช) ให้ถือว่า invalid
    if (otpRow.used) {
      return NextResponse.json({ message: "otp_invalid" } satisfies VerifyResp, { status: 200 });
    }

    // locked?
    if (otpRow.locked_until) {
      const lockTs = parseIso(otpRow.locked_until);
      if (lockTs && lockTs > Date.now()) {
        return NextResponse.json({ message: "otp_locked" } satisfies VerifyResp, { status: 200 });
      }
    }

    // expired?
    const expTs = parseIso(otpRow.expires_at);
    if (!expTs || expTs <= Date.now()) {
      return NextResponse.json({ message: "otp_expired" } satisfies VerifyResp, { status: 200 });
    }

    // compare hash
    const incomingHash = hashOtp(otp);
    const ok = crypto.timingSafeEqual(Buffer.from(incomingHash), Buffer.from(otpRow.otp_hash));

    // policy: attempts เกิน 5 ครั้งให้ lock 5 นาที
    const MAX_ATTEMPTS = 5;
    const LOCK_MINUTES = 5;

    if (!ok) {
      const nextAttempts = (otpRow.attempts ?? 0) + 1;

      const updates: Record<string, unknown> = { attempts: nextAttempts };
      if (nextAttempts >= MAX_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
        updates.locked_until = lockedUntil;
      }

      await supabaseAdmin.from("otp_requests").update(updates).eq("id", otpRow.id);

      if (nextAttempts >= MAX_ATTEMPTS) {
        return NextResponse.json({ message: "otp_locked" } satisfies VerifyResp, { status: 200 });
      }
      return NextResponse.json({ message: "otp_invalid" } satisfies VerifyResp, { status: 200 });
    }

    // ผ่าน → mark used
    const { error: usedErr } = await supabaseAdmin
      .from("otp_requests")
      .update({ used: true, used_at: nowIso() })
      .eq("id", otpRow.id);

    if (usedErr) {
      return NextResponse.json({ message: "supabase_error" } satisfies VerifyResp, { status: 500 });
    }

    // insert user
    const insertPayload = {
      fname: form.flname,
      nname: form.nname,
      dob: form.dob,
      position: Number(form.position), // ในตาราง user ของคุณ position เป็น FK int8
      uline_id: line.sub,
      email,
      phone: form.phone,
      verified: true,
      status: "active",
      // emp_id: ... ถ้าคุณมีระบบ running number ต้องจัดต่ออีก step
    };

    const { error: insUserErr } = await supabaseAdmin.from("user").insert(insertPayload);
    if (insUserErr) {
      // ถ้า insert ชน unique (uline_id) ก็ถือว่า duplicate
      // (บางทีเกิด race condition: verify พร้อมกัน)
      const msg = insUserErr.message.toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return NextResponse.json({ message: "duplicate" } satisfies VerifyResp, { status: 200 });
      }
      return NextResponse.json({ message: "supabase_error" } satisfies VerifyResp, { status: 500 });
    }

    return NextResponse.json({ message: "success" } satisfies VerifyResp, { status: 200 });
  } catch (err: unknown) {
    console.error("❌ verify-otp error:", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Unknown error" } satisfies VerifyResp,
      { status: 500 }
    );
  }
}
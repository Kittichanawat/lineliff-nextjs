// src/app/api/verify-otp/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

type VerifyMessage =
  | "success"
  | "duplicate"
  | "otp_invalid"
  | "otp_expired"
  | "otp_locked"
  | "supabase_error"
  | "bad_request"
  | "captcha_failed"
  | "missing_line_channel_id"
  | "line_token_invalid"
  | "line_sub_missing";

type VerifyResp = { message: VerifyMessage; details?: unknown };

type RecaptchaVerifyResponse = { success: boolean; "error-codes"?: string[] };
type LineVerifyResponse = { sub?: string };

type LineVerifyOk = { ok: true; sub: string };
type LineVerifyFail = {
  ok: false;
  message: "missing_line_channel_id" | "line_token_invalid" | "line_sub_missing";
};
type LineVerifyResult = LineVerifyOk | LineVerifyFail;

// --------------------
// Schemas
// --------------------
const formSchema = z.object({
  flname: z.string().min(1),
  nname: z.string().min(1),
  dob: z.string().min(1), // YYYY-MM-DD
  department: z.string().min(1),
  position: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(5),
});

const bodySchema = z.object({
  idToken: z.string().min(10),
  otp: z.string().regex(/^\d{6}$/),
  form: formSchema,
  captchaToken: z.string().min(1).optional(),
});

// --------------------
// Supabase Admin
// --------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
if (!SERVICE_KEY) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// --------------------
// Debug helpers
// --------------------
function allowDebug(req: Request) {
  // ตั้งใน Vercel: DEBUG_API_KEY=xxx
  const envKey = process.env.DEBUG_API_KEY?.trim();
  if (!envKey) return false;
  const key = req.headers.get("x-debug-key")?.trim();
  return Boolean(key && key === envKey);
}

function toErrorDetails(e: unknown) {
  // พยายามดึงข้อมูลจาก supabase error / fetch error / thrown error
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack };
  }
  if (e && typeof e === "object") {
    // supabase error มักมี message / details / hint / code
    const obj = e as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of ["message", "details", "hint", "code", "status", "name"]) {
      if (k in obj) out[k] = obj[k];
    }
    return Object.keys(out).length ? out : obj;
  }
  return e;
}

function respondError(req: Request, status: number, message: VerifyMessage, err?: unknown) {
  const debug = allowDebug(req);
  return NextResponse.json(
    {
      message,
      ...(debug && err !== undefined ? { details: toErrorDetails(err) } : {}),
    } satisfies VerifyResp,
    { status }
  );
}

// --------------------
// Other helpers
// --------------------
function getIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined
  );
}

function hashOtp(otp: string) {
  const pepper = process.env.OTP_PEPPER || "";
  return crypto.createHash("sha256").update(otp + pepper).digest("hex");
}

function parseIso(s: string | null | undefined) {
  if (!s) return null;
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
  return (await res.json()) as RecaptchaVerifyResponse;
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

// --------------------
// DB row types
// --------------------
type OtpRow = {
  id: number;
  email: string;
  line_sub: string;
  otp_hash: string;
  expires_at: string;
  used: boolean;
  attempts: number;
  created_at: string;
  locked_until: string | null;
};

// --------------------
// Route
// --------------------
export async function POST(req: Request) {
  const ip = getIp(req);

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: "bad_request", details: allowDebug(req) ? parsed.error.flatten() : undefined } satisfies VerifyResp,
        { status: 400 }
      );
    }

    const { idToken, otp, form, captchaToken } = parsed.data;
    const email = form.email.trim().toLowerCase();

    // optional reCAPTCHA
    if (captchaToken) {
      const rc = await verifyRecaptcha(captchaToken, ip);
      if (!rc.success) {
        return respondError(req, 400, "captcha_failed", rc);
      }
    }

    // LINE verify
    const line = await verifyLineIdToken(idToken);
    if (!line.ok) {
      return respondError(req, 401, line.message);
    }

    // duplicate check
    const dup = await supabaseAdmin.from("user").select("id").eq("uline_id", line.sub).limit(1).maybeSingle();
    if (dup.error) {
      console.error("user duplicate check error:", dup.error);
      return respondError(req, 500, "supabase_error", dup.error);
    }
    if (dup.data) {
      return NextResponse.json({ message: "duplicate" } satisfies VerifyResp, { status: 200 });
    }

    // latest otp
    const otpRes = await supabaseAdmin
      .from("otp_requests")
      .select("id,email,line_sub,otp_hash,expires_at,used,attempts,created_at,locked_until")
      .eq("email", email)
      .eq("line_sub", line.sub)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<OtpRow>();

    if (otpRes.error) {
      console.error("otp_requests select error:", otpRes.error);
      return respondError(req, 500, "supabase_error", otpRes.error);
    }
    if (!otpRes.data) {
      return NextResponse.json({ message: "otp_invalid" } satisfies VerifyResp, { status: 200 });
    }

    const row = otpRes.data;

    if (row.used) {
      return NextResponse.json({ message: "otp_invalid" } satisfies VerifyResp, { status: 200 });
    }

    const lockTs = parseIso(row.locked_until);
    if (lockTs && lockTs > Date.now()) {
      return NextResponse.json({ message: "otp_locked" } satisfies VerifyResp, { status: 200 });
    }

    const expTs = parseIso(row.expires_at);
    if (!expTs || expTs <= Date.now()) {
      return NextResponse.json({ message: "otp_expired" } satisfies VerifyResp, { status: 200 });
    }

    // constant-time compare
    const incomingHash = hashOtp(otp);
    const ok = crypto.timingSafeEqual(Buffer.from(incomingHash), Buffer.from(row.otp_hash));

    const MAX_ATTEMPTS = 5;
    const LOCK_MINUTES = 5;

    if (!ok) {
      const nextAttempts = (row.attempts ?? 0) + 1;
      const updates: Record<string, unknown> = { attempts: nextAttempts };

      if (nextAttempts >= MAX_ATTEMPTS) {
        updates.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
      }

      const up = await supabaseAdmin.from("otp_requests").update(updates).eq("id", row.id);
      if (up.error) {
        console.error("otp_requests update attempts error:", up.error);
        return respondError(req, 500, "supabase_error", up.error);
      }

      return NextResponse.json(
        { message: nextAttempts >= MAX_ATTEMPTS ? "otp_locked" : "otp_invalid" } satisfies VerifyResp,
        { status: 200 }
      );
    }

    // mark used
    const usedUp = await supabaseAdmin
      .from("otp_requests")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", row.id);

    if (usedUp.error) {
      console.error("otp_requests update used error:", usedUp.error);
      return respondError(req, 500, "supabase_error", usedUp.error);
    }

    // insert user
    const userPayload = {
      fname: form.flname,
      nname: form.nname,
      dob: form.dob,
      position: Number(form.position),
      uline_id: line.sub,
      email,
      phone: form.phone,
      verified: true,
      status: "active",
      // emp_id: ถ้า NOT NULL ต้องใส่ค่าเพิ่มที่นี่
    };

    const ins = await supabaseAdmin.from("user").insert(userPayload);
    if (ins.error) {
      console.error("user insert error:", ins.error);
      return respondError(req, 500, "supabase_error", ins.error);
    }

    return NextResponse.json({ message: "success" } satisfies VerifyResp, { status: 200 });
  } catch (err: unknown) {
    console.error("❌ verify-otp error:", err);
    return respondError(req, 500, "supabase_error", err);
  }
}
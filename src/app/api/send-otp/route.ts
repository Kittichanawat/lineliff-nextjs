// src/app/api/send-otp/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { createClient as createRedisClient } from "redis";
import {
  RateLimiterAbstract,
  RateLimiterMemory,
  RateLimiterRedis,
} from "rate-limiter-flexible";
import { z } from "zod";

type ApiResp = {
  success: boolean;
  message: string;
  retryAfter?: number;
  details?: string[] | string;
};

// --------------------
// Supabase Admin
// --------------------
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// --------------------
// Redis (optional)
// --------------------
const REDIS_URL = process.env.REDIS_URL?.trim();
const redis = REDIS_URL ? createRedisClient({ url: REDIS_URL }) : null;

let redisReady = false;
if (redis) {
  redis.on("error", () => {
    redisReady = false;
  });
  redis
    .connect()
    .then(() => {
      redisReady = true;
    })
    .catch(() => {
      redisReady = false;
    });
}

function makeLimiter(points: number, durationSec: number): RateLimiterAbstract {
  if (redis && redisReady) {
    return new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: "rl",
      points,
      duration: durationSec,
    });
  }
  return new RateLimiterMemory({ points, duration: durationSec });
}

const limiterIp = makeLimiter(10, 10 * 60); // 10 req / 10 min / ip
const limiterEmail = makeLimiter(3, 10 * 60); // 3 req / 10 min / email
const limiterCooldown = makeLimiter(1, 60); // 1 req / 60 sec / email

type RateLimitRej = { msBeforeNext: number };
function isRateLimitRej(e: unknown): e is RateLimitRej {
  return (
    typeof e === "object" &&
    e !== null &&
    "msBeforeNext" in e &&
    typeof (e as { msBeforeNext?: unknown }).msBeforeNext === "number"
  );
}

async function consumeOr429(limiter: RateLimiterAbstract, key: string) {
  try {
    await limiter.consume(key);
    return null;
  } catch (e: unknown) {
    const ms = isRateLimitRej(e) ? e.msBeforeNext : 1000;
    const retryAfter = Math.ceil(ms / 1000);

    return NextResponse.json(
      { message: "rate_limited" },  // ✅ เหลือแค่ message
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) }, // ยังส่ง header ได้
      }
    );
  }
}

// --------------------
// Mailer
// --------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || "true") === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function sendOtpEmail(to: string, otp: string) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER!;
  await transporter.sendMail({
    from,
    to,
    subject: "รหัส OTP สำหรับยืนยันตัวตน",
    text: `รหัส OTP ของคุณคือ: ${otp}\nรหัสมีอายุ 5 นาที\nหากไม่ได้ทำรายการ กรุณาละเว้นอีเมลนี้`,
    html: `
      <div style="font-family:sans-serif">
        <h2>รหัส OTP ของคุณ</h2>
        <div style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</div>
        <p>รหัสมีอายุ 5 นาที</p>
        <p style="color:#666">หากไม่ได้ทำรายการ กรุณาละเว้นอีเมลนี้</p>
      </div>
    `,
  });
}

// --------------------
// Helpers
// --------------------
function getIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function genOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp: string) {
  const pepper = process.env.OTP_PEPPER || "";
  return crypto.createHash("sha256").update(otp + pepper).digest("hex");
}

type RecaptchaVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  // v2 ไม่มี score แต่เผื่ออนาคต
  score?: number;
};

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

type LineVerifyOk = { ok: true; sub: string };
type LineVerifyFail = { ok: false; message: "missing_line_channel_id" | "line_token_invalid" | "line_sub_missing" };
type LineVerifyResult = LineVerifyOk | LineVerifyFail;

type LineVerifyResponse = {
  sub?: string;
  // field อื่น ๆ ไม่จำเป็นต้องใช้
};

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
// Request schema
// --------------------
const sendOtpSchema = z.object({
  captchaToken: z.string().min(1),
  idToken: z.string().min(10),
  email: z.string().email(),
});

// --------------------
// Route
// --------------------
export async function POST(req: Request) {
  const ip = getIp(req);

  try {
    const parsed = sendOtpSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "bad_request", details: parsed.error.issues.map((i) => i.message) } satisfies ApiResp,
        { status: 400 }
      );
    }

    const { captchaToken, idToken } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();

    // --- Rate limit ---
    const rl1 = await consumeOr429(limiterIp, `otp_req_ip:${ip}`);
    if (rl1) return rl1;

    const rl2 = await consumeOr429(limiterEmail, `otp_req_email:${email}`);
    if (rl2) return rl2;

    const rl3 = await consumeOr429(limiterCooldown, `otp_cooldown:${email}`);
    if (rl3) return rl3;

    // --- reCAPTCHA ---
    const rc = await verifyRecaptcha(captchaToken, ip);
    if (!rc.success) {
      return NextResponse.json(
        { success: false, message: "captcha_failed", details: rc["error-codes"] } satisfies ApiResp,
        { status: 400 }
      );
    }

    // --- LINE verify ---
    const line = await verifyLineIdToken(idToken);
    if (!line.ok) {
      return NextResponse.json({ success: false, message: line.message } satisfies ApiResp, { status: 401 });
    }

    // --- duplicate check (LINE เดิม) ---
    const { data: existed, error: existErr } = await supabaseAdmin
      .from("user")
      .select("id")
      .eq("uline_id", line.sub)
      .limit(1)
      .maybeSingle();

    if (existErr) {
      return NextResponse.json(
        { success: false, message: "supabase_error", details: existErr.message } satisfies ApiResp,
        { status: 500 }
      );
    }
    if (existed) {
      return NextResponse.json({ success: false, message: "duplicate" } satisfies ApiResp, { status: 200 });
    }

    // --- create otp + insert otp_requests ---
    const otp = genOtp6();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: insErr } = await supabaseAdmin.from("otp_requests").insert({
      email,
      otp_hash: otpHash,
      line_sub: line.sub,
      expires_at: expiresAt,
      used: false,
      attempts: 0,
    });

    if (insErr) {
      return NextResponse.json(
        { success: false, message: "supabase_insert_failed", details: insErr.message } satisfies ApiResp,
        { status: 500 }
      );
    }

    // --- send email ---
    await sendOtpEmail(email, otp);

    return NextResponse.json({ success: true, message: "ok" } satisfies ApiResp, { status: 200 });
  } catch (err: unknown) {
    console.error("❌ send-otp error:", err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Unknown error" } satisfies ApiResp,
      { status: 500 }
    );
  }
}
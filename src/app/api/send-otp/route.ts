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
      { success: false, message: "rate_limited", retryAfter } satisfies ApiResp,
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
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
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <div style="background:#1a1a2e;padding:1.25rem 1.5rem;display:flex;align-items:center;gap:10px;">
          <div style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;">
            🔐
          </div>
          <span style="color:white;font-weight:500;font-size:15px;">การยืนยันตัวตน</span>
        </div>

        <div style="padding:2rem;background:#ffffff;">
          <p style="color:#374151;font-size:15px;margin:0 0 1.5rem;line-height:1.6;">
            กรุณาใช้รหัส OTP ด้านล่างเพื่อยืนยันตัวตน และผูกบัญชี LINE เข้ากับอีเมลองค์กรของคุณ
          </p>

          <div style="background:#f9fafb;border-radius:10px;padding:1.5rem;text-align:center;border:1px solid #e5e7eb;margin-bottom:1.5rem;">
            <p style="font-size:12px;color:#6b7280;margin:0 0 0.75rem;letter-spacing:0.08em;text-transform:uppercase;">รหัส OTP</p>
            <div style="font-size:36px;font-weight:600;letter-spacing:12px;color:#111827;margin-bottom:0.75rem;">${otp}</div>
            <div style="display:flex;align-items:center;justify-content:center;gap:5px;color:#6b7280;font-size:13px;">
              ⏱ รหัสหมดอายุใน 5 นาที
            </div>
          </div>

          <div style="background:#fff8ed;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0;padding:0.875rem 1rem;margin-bottom:1.5rem;">
            <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6;">
              หากคุณไม่ได้ทำรายการนี้ กรุณาละเว้นอีเมลฉบับนี้
            </p>
          </div>

          <hr style="border:none;border-top:1px solid #f3f4f6;margin:0 0 1.25rem;">
          <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
            อีเมลนี้ถูกส่งโดยอัตโนมัติ กรุณาอย่าตอบกลับ
          </p>
        </div>
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

    // --- เช็คว่าบัญชี LINE นี้เคยผูกไว้หรือยัง (เช็คในตาราง user_social_logins) ---
    const { data: existedLine, error: existLineErr } = await supabaseAdmin
      .from("user_social_logins")
      .select("id")
      .eq("provider", "line")
      .eq("provider_id", line.sub)
      .limit(1)
      .maybeSingle();

    if (existLineErr) {
      return NextResponse.json(
        { success: false, message: "supabase_error", details: existLineErr.message } satisfies ApiResp,
        { status: 500 }
      );
    }

    if (existedLine) {
      // ถ้าเจอ แสดงว่า LINE นี้ผูกกับพนักงานคนใดคนหนึ่งไปแล้ว
      return NextResponse.json(
        { success: false, message: "duplicate_line" } satisfies ApiResp,
        { status: 200 }
      );
    }

    // --- เช็คว่ามี อีเมล นี้ในระบบพนักงานหรือไม่ ---
    // เราต้องมั่นใจว่าอีเมลที่กรอกมา เป็นอีเมลของพนักงานที่มีอยู่ในตาราง user แล้วจริงๆ (status ต้องไม่เป็น deleted)
    const { data: existedEmail, error: existEmailErr } = await supabaseAdmin
      .from("user")
      .select("id")
      .eq("email", email)
      .neq("status", "deleted") // ไม่นับพนักงานที่ลบไปแล้ว
      .limit(1)
      .maybeSingle();

    if (existEmailErr) {
      return NextResponse.json(
        { success: false, message: "supabase_error", details: existEmailErr.message } satisfies ApiResp,
        { status: 500 }
      );
    }

    if (!existedEmail) {
      // ถ้าไม่เจออีเมลนี้ในระบบ (ตรงข้ามกับแบบเก่า)
      return NextResponse.json(
        { success: false, message: "email_not_found" } satisfies ApiResp,
        { status: 200 }
      );
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
// src/app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import toast, { Toaster } from "react-hot-toast";
import axios from "axios";
import Modal from "@/components/modal";
import liff from "@line/liff";
import ReCAPTCHA from "react-google-recaptcha";
import { decodeJwt } from "jose";

type ApiErrorBody = { message?: string };

type Position = { p_id: string; p_name: string };
type Department = { dep_id: string; dep_name: string; positions: Position[] };

type FormData = {
  flname: string;
  nname: string;
  dob: string;
  department: string;
  position: string;
  email: string;
  phone: string;
};

type OtpRequestResponse = { success?: boolean; message?: string };
type RegisterVerifyResponse = { message?: string };

function getAxiosMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const serverMsg = error.response?.data?.message;
    if (typeof serverMsg === "string" && serverMsg.trim().length > 0) return serverMsg;
    if (typeof error.message === "string" && error.message.trim().length > 0) return error.message;
    return fallback;
  }

  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

function isIdTokenExpired(token: string) {
  try {
    const { exp } = decodeJwt(token);
    if (!exp) return false;
    return Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}



async function getFreshIdToken(): Promise<string> {
  // ถ้ายังไม่ init หรือยังไม่ login
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return "";
  }

  // ลองดึง token ล่าสุดก่อน
  const t = liff.getIDToken();
  if (t && t.length > 10) return t;

  // ถ้าไม่ได้จริง ๆ ให้ login ใหม่ (ใน in-app จะกลับมาให้เอง)
  liff.login({ redirectUri: window.location.href });
  return "";
}

export default function RegisterForm() {
  // ---------- Branding ----------
  const LOGO_SRC = "/logo.webp";
  const LIFF_ID = "2007772610-2rjPV8NG";

  // ---------- refs ----------
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  // ---------- data ----------
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);

  // ---------- UI state ----------
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // ---------- LIFF ----------
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [idToken, setIdToken] = useState<string>("");

  // ---------- OTP modal ----------
  const [isOtpOpen, setIsOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const OTP_TTL = 5 * 60;
  const [otpSeconds, setOtpSeconds] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);

  const startOtpTimer = (sec = OTP_TTL) => setOtpSeconds(sec);
  const formatTime = (s: number) => {
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    return `${minutes}.${String(seconds).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!isOtpOpen || otpSeconds <= 0) return;
    const t = setInterval(() => setOtpSeconds((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [isOtpOpen, otpSeconds]);

  // ---------- form ----------
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      flname: "",
      nname: "",
      dob: "",
      department: "",
      position: "",
      email: "",
      phone: "",
    },
    mode: "onSubmit",
  });

  const selectedDep = watch("department");

  // ---------- Init LIFF ----------
  useEffect(() => {
    const init = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const token = liff.getIDToken();
        if (!token) {
          toast.error("ไม่พบ idToken จาก LINE (กรุณาลองใหม่)");
          return;
        }

        setIdToken(token);
        setIsLiffReady(true);
      } catch (e: unknown) {
        console.error(e);
        toast.error("เปิดผ่าน LIFF ไม่สำเร็จ");
      }
    };

    void init();
  }, []);

  // ---------- Load departments via server API (ไม่ยิง supabase ตรงจาก client) ----------
  useEffect(() => {
    const loadDeps = async () => {
      try {
        const res = await axios.get<Department[]>("/api/departments");
        setDepartments(Array.isArray(res.data) ? res.data : []);
      } catch (e: unknown) {
        console.error(e);
        toast.error("โหลดข้อมูลแผนก/ตำแหน่งไม่สำเร็จ");
      }
    };

    void loadDeps();
  }, []);

  // ---------- Update positions by department ----------
  useEffect(() => {
    if (!selectedDep) {
      setPositions([]);
      return;
    }
    const dep = departments.find((d) => d.dep_id === selectedDep);
    setPositions(dep?.positions ?? []);
  }, [selectedDep, departments]);

  // ---------- captcha helper ----------
  const execCaptcha = async (): Promise<string> => {
    const token = await recaptchaRef.current?.executeAsync();
    recaptchaRef.current?.reset();
    return token ?? "";
  };

  // ---------- Submit (request OTP) ----------
  const callSendOtp = async (token: string, email: string) => {
    const captchaToken = await execCaptcha();
    if (!captchaToken) throw new Error("captcha_failed");

    return axios.post<OtpRequestResponse>("/api/send-otp", {
      idToken: token,
      email,
      captchaToken,
    });
  };

  const onSubmit = async (data: FormData) => {
    if (!isLiffReady) {
      toast.error("LIFF ยังไม่พร้อม กรุณารอสักครู่");
      return;
    }

    try {
      setIsLoading(true);

      // 1) ใช้ token ปัจจุบันก่อน
      let token = idToken;
      if (!token || isIdTokenExpired(token)) {
        token = await getFreshIdToken();
        if (!token) return;
        setIdToken(token);
      }

      let res = await callSendOtp(token, data.email);

      // 2) ถ้า token invalid → รีเฟรช แล้ว retry 1 ครั้ง
      if (res.data?.success === false && res.data?.message === "line_token_invalid") {
        toast("LINE session หมดอายุ กำลังขอ token ใหม่...", { icon: "🔄" });

        const newToken = await getFreshIdToken();
        if (!newToken) return; // redirect ไป login แล้ว
        setIdToken(newToken);

        res = await callSendOtp(newToken, data.email);
      }

      // handle response
      if (res.data?.success === false) {
        // กรณี rate limit / duplicate / อื่น ๆ
        toast.error(res.data.message ?? "ส่ง OTP ไม่สำเร็จ");
        return;
      }

      setOtp("");
      setIsOtpOpen(true);
      startOtpTimer();
      toast.success("ส่ง OTP ไปยังอีเมลแล้ว กรุณาตรวจสอบกล่องจดหมาย");
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "captcha_failed") {
        toast.error("ยืนยัน reCAPTCHA ไม่สำเร็จ กรุณาลองใหม่");
      } else {
        toast.error(getAxiosMessage(e, "ส่ง OTP ไม่สำเร็จ"));
      }
    } finally {
      setIsLoading(false);
    }
  };
  const ensureFreshIdToken = async (): Promise<string> => {
    let token = idToken;
    if (!token || isIdTokenExpired(token)) {
      token = await getFreshIdToken();
      if (!token) return "";
      setIdToken(token);
    }
    return token;
  };
  const handleResendOtp = async () => {
    if (otpSeconds > 0 || resendLoading) return;

    if (!isLiffReady ) {
      toast.error("LIFF ยังไม่พร้อม กรุณารอสักครู่");
      return;
    }

    const email = watch("email");
    if (!email || email.trim().length === 0) {
      toast.error("ไม่พบอีเมล");
      return;
    }

    try {
      setResendLoading(true);

      const captchaToken = await execCaptcha();
      if (captchaToken.length === 0) {
        toast.error("ยืนยัน reCAPTCHA ไม่สำเร็จ กรุณาลองใหม่");
        return;
      }

      const token = await ensureFreshIdToken();
      if (!token) return;
      const res = await axios.post<OtpRequestResponse>("/api/send-otp", {
        idToken: token,  
        email,
        captchaToken,
      });

      if (res.data?.success === false) {
        toast.error(res.data.message ?? "ส่งรหัสใหม่ไม่สำเร็จ");
        return;
      }

      setOtp("");
      startOtpTimer();
      toast.success("ส่งรหัสใหม่แล้ว กรุณาตรวจสอบอีเมล");
    } catch (e: unknown) {
      toast.error(getAxiosMessage(e, "ส่งรหัสใหม่ไม่สำเร็จ"));
    } finally {
      setResendLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (isVerifying) return;

    if (!isLiffReady || idToken.length === 0) {
      toast.error("LIFF ยังไม่พร้อม กรุณารอสักครู่");
      return;
    }

    const form = watch();

    try {
      setIsVerifying(true);

      const token = await ensureFreshIdToken();
      if (!token) return;
      const res = await axios.post<RegisterVerifyResponse>("/api/verify-otp", {
        idToken: token,
        otp,
        form,
      });

      const msg = res.data?.message;

      if (msg === "success") {
        toast.success("บันทึกข้อมูลสำเร็จ");
        setIsOtpOpen(false);
        return;
      }

      if (msg === "duplicate") {
        toast.error("บัญชี LINE นี้มีข้อมูลอยู่แล้ว กรุณาอย่าลงทะเบียนซ้ำ");
        setIsOtpOpen(false);
        return;
      }

      if (msg === "otp_invalid") {
        toast.error("OTP ไม่ถูกต้อง");
        return;
      }

      if (msg === "otp_expired") {
        toast.error("OTP หมดอายุ กรุณาขอรหัสใหม่");
        return;
      }

      if (msg === "otp_locked") {
        toast.error("ใส่รหัสผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่");
        return;
      }

      toast.error(msg ?? "ยืนยันไม่สำเร็จ");
    } catch (e: unknown) {
      toast.error(getAxiosMessage(e, "ยืนยัน OTP ไม่สำเร็จ"));
    } finally {
      setIsVerifying(false);
    }
  };

  // ---------- UI ----------
  return (
    <main className="page-shell">
      <Toaster position="top-center" />

      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="brand-badge">
            <Image src={LOGO_SRC} alt="Company Logo" width={180} height={180} className="object-contain" priority />
          </span>
        </div>
        <small className="text-[color:var(--text-2)]">Secure Onboarding</small>
      </header>

      <div className="glass-card card-pad animate-in">
        <h1 className="hero-title flex items-center gap-2">
          <i className="fa-solid fa-id-card" /> ฟอร์มลงทะเบียนพนักงาน
        </h1>
        <p className="hero-sub mb-6">กรอกข้อมูลให้ครบถ้วนเพื่อยืนยันตัวตนผ่าน OTP ทางอีเมล</p>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-section-title">ชื่อนามสกุล</label>
            <input
              {...register("flname", { required: "กรุณากรอกชื่อ-นามสกุล" })}
              className="form-input"
              autoComplete="name"
            />
            {errors.flname && <p className="text-red-500 text-sm mt-1">{errors.flname.message}</p>}
          </div>

          <div>
            <label className="form-section-title">ชื่อเล่น</label>
            <input {...register("nname", { required: "กรุณากรอกชื่อเล่น" })} className="form-input" />
            {errors.nname && <p className="text-red-500 text-sm mt-1">{errors.nname.message}</p>}
          </div>

          <div>
            <label className="form-section-title">วันเดือนปีเกิด</label>
            <input type="date" {...register("dob", { required: "กรุณาเลือกวันเกิด" })} className="form-input" />
            {errors.dob && <p className="text-red-500 text-sm mt-1">{errors.dob.message}</p>}
          </div>

          <div>
            <label className="form-section-title">แผนก</label>
            <select {...register("department", { required: "กรุณาเลือกแผนก" })} className="form-select">
              <option value="">-- กรุณาเลือกแผนก --</option>
              {departments.map((d) => (
                <option key={d.dep_id} value={d.dep_id}>
                  {d.dep_name}
                </option>
              ))}
            </select>
            {errors.department && <p className="text-red-500 text-sm mt-1">{errors.department.message}</p>}
          </div>

          <div>
            <label className="form-section-title">ตำแหน่ง</label>
            <select
              {...register("position", { required: "กรุณาเลือกตำแหน่ง" })}
              className="form-select"
              disabled={positions.length === 0}
            >
              <option value="">-- กรุณาเลือกตำแหน่ง --</option>
              {positions.map((p) => (
                <option key={p.p_id} value={p.p_id}>
                  {p.p_name}
                </option>
              ))}
            </select>
            {errors.position && <p className="text-red-500 text-sm mt-1">{errors.position.message}</p>}
          </div>

          <div>
            <label className="form-section-title">อีเมล</label>
            <input
              type="email"
              {...register("email", {
                required: "กรุณากรอกอีเมล",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "รูปแบบอีเมลไม่ถูกต้อง",
                },
              })}
              className="form-input"
              autoComplete="email"
              inputMode="email"
            />
            {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="form-section-title">เบอร์โทรศัพท์</label>
            <input
              type="tel"
              {...register("phone", {
                required: "กรุณากรอกเบอร์โทรศัพท์",
                minLength: { value: 9, message: "เบอร์โทรสั้นเกินไป" },
                maxLength: { value: 15, message: "เบอร์โทรยาวเกินไป" },
              })}
              className="form-input"
              autoComplete="tel"
              inputMode="tel"
            />
            {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>}
          </div>

          <div className="md:col-span-2">
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}
              size="invisible"
              badge="inline"
            />

            <button
              type="submit"
              disabled={isLoading || !isLiffReady}
              className="btn-gradient mt-3 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? "กำลังส่ง..." : "ส่งข้อมูล"}
            </button>

            {!isLiffReady && (
              <p className="text-xs mt-2 text-yellow-500">กำลังเตรียม LIFF... (ถ้าไม่ขึ้น อาจไม่ได้เปิดผ่าน LINE)</p>
            )}
          </div>
        </form>
      </div>

      {/* OTP Modal */}
      <Modal
        isOpen={isOtpOpen}
        onClose={() => {
          // ปิดไม่ได้ด้วยการกด backdrop/esc (กันหลุด flow)
          // ถ้าต้องการให้ปิดได้ ให้เปลี่ยนไป setIsOtpOpen(false)
          setIsOtpOpen(false)
        }}
        title="ยืนยันรหัส OTP"
        closeOnBackdrop={false}
        closeOnEsc={false}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleVerifyOtp();
          }}
        >
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            placeholder="______"
            className="otp-input"
            required
            inputMode="numeric"
          />

          <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="fa-regular fa-clock text-purple-500" />
                <span>
                  รหัสจะหมดอายุใน{" "}
                  <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                    {formatTime(otpSeconds)}
                  </span>
                </span>
              </div>

              <button
                type="button"
                onClick={() => void handleResendOtp()}
                disabled={otpSeconds > 0 || resendLoading}
                className="btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
                title={otpSeconds > 0 ? "กดได้เมื่อหมดเวลา" : "ส่งรหัสใหม่"}
              >
                {resendLoading ? "กำลังส่ง..." : "ส่งรหัสใหม่"}
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              ส่งรหัสไปที่{" "}
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {watch("email") || "ไม่พบอีเมล"}
              </span>
            </p>
          </div>

          <button
            type="submit"
            disabled={isVerifying}
            className="btn-gradient w-full mt-4 disabled:opacity-60 disabled:cursor-not-allowed"
            aria-busy={isVerifying}
          >
            {isVerifying ? "กำลังยืนยัน..." : "ยืนยัน"}
          </button>
        </form>
      </Modal>
    </main>
  );
}
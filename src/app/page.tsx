"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import toast, { Toaster } from "react-hot-toast";
import axios from "axios";
import Modal from "@/components/modal";
import { supabase } from "@/lib/supabaseClient";
import liff from "@line/liff";
import ReCAPTCHA from "react-google-recaptcha";


type Position = { p_id: string; p_name: string };
type Department = { dep_id: string; dep_name: string; positions: Position[] };
type DepPosRow = {
  dep_id: number | string;
  p_id: number | string;
  departments: { dep_id: number | string; dep_name: string };
  position: { p_id: number | string; p_name: string };
};

type FormData = {
  flname: string;
  nname: string;
  dob: string;
  department: string;
  position: string;
  email: string;
  phone: string;
};

export default function RegisterForm() {
  // ---------- Branding ----------
  const LOGO_SRC = "/logo.webp";


  // ---------- state ----------
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [userId, setUserId] = useState("");
  const [displayName, setDisplayName] = useState("");

  // ---------- OTP ----------
  const [isOtpOpen, setIsOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const OTP_TTL = 60;
  const [otpSeconds, setOtpSeconds] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);

  const startOtpTimer = (sec = OTP_TTL) => setOtpSeconds(sec);
  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(
      2,
      "0"
    )}`;

  useEffect(() => {
    if (!isOtpOpen || otpSeconds <= 0) return;
    const t = setInterval(() => setOtpSeconds((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [isOtpOpen, otpSeconds]);

  // ---------- Init LIFF ----------
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: "2007772610-2rjPV8NG" });
        if (!liff.isLoggedIn()) liff.login();
        const profile = await liff.getProfile();
        setUserId(profile.userId);
        setDisplayName(profile.displayName);
      } catch {
        // ข้ามถ้าไม่ได้รันใน LIFF
      }
    };
    initLiff();
  }, []);

  // ---------- โหลด Department ----------
  useEffect(() => {
    const loadDeps = async () => {
      const { data, error } = await supabase
        .from("dep_pos")
        .select("dep_id, p_id, departments(dep_id,dep_name), position(p_id,p_name)")
        .returns<DepPosRow[]>();

      if (error) {
        console.error("Supabase error:", error);
        return;
      }

      const map: Record<string, Department> = {};
      (data ?? []).forEach((row) => {
        const depId = String(row.departments.dep_id);
        if (!map[depId]) {
          map[depId] = {
            dep_id: depId,
            dep_name: String(row.departments.dep_name),
            positions: [],
          };
        }
        map[depId].positions.push({
          p_id: String(row.position.p_id),
          p_name: String(row.position.p_name),
        });
      });

      setDepartments(Object.values(map));
    };
    loadDeps();
  }, []);

  // ---------- React Hook Form ----------
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>();

  const selectedDep = watch("department");
  useEffect(() => {
    if (!selectedDep) {
      setPositions([]);
      return;
    }
    const dep = departments.find((d) => d.dep_id === selectedDep);
    setPositions(dep?.positions ?? []);
  }, [selectedDep, departments]);


// ---------- Handlers ----------
const onSubmit = async (data: FormData) => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    toast.error("กรุณากรอกอีเมลให้ถูกต้อง");
    return;
  }

  try {
    setIsLoading(true);
    const payload = { ...data, userId, displayName, captchaToken };
    const res = await axios.post("/api/send-otp", payload);
    if (res.data?.success) {
      setOtp("");
      setIsOtpOpen(true);
      startOtpTimer();
      toast.success("ส่ง OTP ไปยังอีเมลเรียบร้อยแล้ว กรุณาตรวจสอบกล่องจดหมาย");
    } else {
      toast.error(res.data?.message ?? "ส่ง OTP ไม่ได้");
    }
  } catch (err) {
    toast.error("เกิดข้อผิดพลาดในการส่ง OTP");
  } finally {
    setIsLoading(false);
  }
};


  const handleResendOtp = async () => {
    if (otpSeconds > 0 || resendLoading) return;
    try {
      setResendLoading(true);
      // ใช้ข้อมูลเต็มจากฟอร์ม
      const payload = { ...watch(), userId, displayName };
      const res = await axios.post("/api/send-otp", payload);
  
      if (res.data?.success) {
        setOtp("");
        startOtpTimer(); // เริ่มนับถอยหลังใหม่
        toast.success("ส่งรหัสใหม่แล้ว กรุณาตรวจสอบ SMS");
      } else {
        toast.error(res.data?.message ?? "ส่งรหัสใหม่ไม่ได้");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาดในการส่งรหัสใหม่");
    } finally {
      setResendLoading(false);
    }
  };
  
  const handleVerifyOtp = async () => {
    if (isVerifying) return;
    try {
      setIsVerifying(true);
  
      // ตรวจสอบ OTP โดยใช้ email
      const res = await axios.post("/api/verify-otp", { email: watch("email"), otp });
  
      if (res.data?.message === "success") {
        // รวม payload ฟอร์มทั้งหมด
        const payload = {
          ...watch(),
          userId,
          displayName,
          otp,
          captchaToken,
        };
  
        // 📌 เรียก /api/save-form แยก
        const saveRes = await axios.post("/api/save-form", payload);
  
        if (saveRes.data?.message === "success") {
          toast.success("บันทึกข้อมูลสำเร็จ");
          setIsOtpOpen(false);
        } else if (saveRes.data?.message === "duplicate") {
          toast.error("มีข้อมูลอยู่ในระบบแล้ว กรุณาอย่าลงทะเบียนซ้ำ");
          setIsOtpOpen(false);
        } else {
          toast.error(saveRes.data?.message ?? "บันทึกข้อมูลไม่สำเร็จ");
          setIsOtpOpen(false);
        }
      } else if (res.data?.message === "duplicate") {
        toast.error("มีข้อมูลอยู่ในระบบแล้ว กรุณาอย่าลงทะเบียนซ้ำ");
      } else {
        toast.error("OTP ไม่ถูกต้อง");
      }
    } catch (err) {
      toast.error("เกิดข้อผิดพลาดในการยืนยัน OTP");
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
            <Image
              src={LOGO_SRC}
              alt="Company Logo"
              width={180}
              height={180}
              className="object-contain"
              priority
            />
         
          </span>
        </div>
        <small className="text-[color:var(--text-2)]">Secure Onboarding</small>
      </header>

      <div className="glass-card card-pad animate-in">
        <h1 className="hero-title flex items-center gap-2">
          <i className="fa-solid fa-id-card" /> ฟอร์มลงทะเบียนพนักงาน
        </h1>
        <p className="hero-sub mb-6">
          กรอกข้อมูลให้ครบถ้วนเพื่อยืนยันตัวตนผ่านเบอร์โทร (OTP)
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-section-title">ชื่อนามสกุล</label>
            <input {...register("flname", { required: "กรุณากรอกชื่อ-นามสกุล" })} className="form-input" />
            {errors.flname && <span className="text-red-500 text-sm">{errors.flname.message}</span>}
          </div>

          <div>
            <label className="form-section-title">ชื่อเล่น</label>
            <input {...register("nname", { required: "กรุณากรอกชื่อเล่น" })} className="form-input" />
            {errors.nname && <span className="text-red-500 text-sm">{errors.nname.message}</span>}
          </div>

          <div>
            <label className="form-section-title">วันเดือนปีเกิด</label>
            <input type="date" {...register("dob", { required: "กรุณาเลือกวันเกิด" })} className="form-input" />
            {errors.dob && <span className="text-red-500 text-sm">{errors.dob.message}</span>}
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
            {errors.department && <span className="text-red-500 text-sm">{errors.department.message}</span>}
          </div>

          {positions.length > 0 && (
            <div>
              <label className="form-section-title">ตำแหน่ง</label>
              <select {...register("position", { required: "กรุณาเลือกตำแหน่ง" })} className="form-select">
                <option value="">-- กรุณาเลือกตำแหน่ง --</option>
                {positions.map((p) => (
                  <option key={p.p_id} value={p.p_id}>
                    {p.p_name}
                  </option>
                ))}
              </select>
              {errors.position && <span className="text-red-500 text-sm">{errors.position.message}</span>}
            </div>
          )}

          <div>
            <label className="form-section-title">อีเมล</label>
            <input
              type="email"
              {...register("email", { required: "กรุณากรอกอีเมล" })}
              className="form-input"
            />
            {errors.email && <span className="text-red-500 text-sm">{errors.email.message}</span>}
          </div>

          <div>
            <label className="form-section-title">เบอร์โทรศัพ</label>
            <input
              type="tel"
              {...register("phone", { required: "กรุณากรอกเบอร์โทรศัพท์" })}
              className="form-input"
            />
            {errors.phone && <span className="text-red-500 text-sm">{errors.phone.message}</span>}
          </div>

          <div className="md:col-span-2">
  {/* ✅ Google reCAPTCHA */}
  <ReCAPTCHA
    sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}
    onChange={(token) => setCaptchaToken(token ?? "")}
  />

  {/* ✅ Submit Button */}
  <button
    type="submit"
    disabled={isLoading || !captchaToken} // ปิดปุ่มถ้าไม่มี token
    className="btn-gradient mt-3 disabled:opacity-60 disabled:cursor-not-allowed"
  >
    {isLoading ? (
      <>
        <svg
          className="animate-spin h-5 w-5 mr-2 text-white"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        กำลังส่ง...
      </>
    ) : (
      <>
        <i className="fa-solid fa-paper-plane btn-icon" />
        ส่งข้อมูล
      </>
    )}
  </button>
</div>

        </form>
      </div>

    
     {/* OTP Modal */}
<Modal
  isOpen={isOtpOpen}
  onClose={() => setIsOtpOpen(false)}
  title="ยืนยันรหัส OTP"
  closeOnBackdrop={false}
  closeOnEsc={false}
>
  <form
    onSubmit={(e) => {
      e.preventDefault();
      handleVerifyOtp();
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
    />

{/* แสดงเวลาหมดอายุ + อีเมล */}
<div className="mt-3 text-sm text-gray-700 dark:text-gray-300 space-y-1">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <i className="fa-regular fa-clock text-purple-500" />
      <span>
        รหัสที่ส่งไปทางอีเมลจะหมดอายุใน{" "}
        <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
          {formatTime(otpSeconds)}
        </span>
      </span>
    </div>
    <button
      type="button"
      onClick={handleResendOtp}
      disabled={otpSeconds > 0 || resendLoading}
      className="btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
      title={otpSeconds > 0 ? "กดได้เมื่อหมดเวลา" : "ส่งรหัสใหม่"}
    >
      <i className="fa-solid fa-rotate-right mr-2" />
      {resendLoading ? "กำลังส่ง..." : "ส่งรหัสใหม่"}
    </button>
  </div>
</div>

ี<div>
    {/* โชว์ว่า OTP ถูกส่งไปที่อีเมลอะไร */}
<p className="text-xs text-gray-500 dark:text-gray-400">
  <i className="fa-solid fa-envelope mr-1 text-blue-500" />
  ส่งรหัสไปที่อีเมล{" "}
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
      {isVerifying ? (
        <>
          <svg
            className="animate-spin h-5 w-5 mr-2 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          กำลังยืนยัน...
        </>
      ) : (
        <>
          <i className="fa-solid fa-shield-keyhole mr-2" />
          ยืนยัน
        </>
      )}
    </button>
  </form>
</Modal>

    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast, { Toaster } from "react-hot-toast";
import liff from "@line/liff";
import Image from "next/image"; // นำมาใช้งานจริงแล้วครับ
import axios from "axios";

// --- Interfaces ---
interface Rule {
  id: number;
  category: string;
  severity: string;
  score: number;
  description: string;
}

interface Profile {
  userId: number;
  uline_id: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  email: string;
}

interface AdminDataResponse {
  success: boolean;
  rules: Rule[];
  users: Profile[];
  hrId: number;
  hrInfo?: {
    name: string;
    department: string;
  };
}

interface BehaviorForm {
  user_id: string;
  rule_id: string;
  reason: string;
}

export default function BehaviorAdminPage() {
  const [data, setData] = useState<AdminDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<BehaviorForm>();
  
  const selectedUserId = watch("user_id");
  const selectedRuleId = watch("rule_id");

  // ค้นหาข้อมูลพนักงานและกฎที่เลือกเพื่อแสดงผล Preview
  const currentUser = data?.users?.find((u) => u.userId.toString() === selectedUserId);
  const currentRule = data?.rules?.find((r) => r.id.toString() === selectedRuleId);

  useEffect(() => {
    const init = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        // 📡 เรียก API เส้นที่ 1 เพื่อเช็คสิทธิ์ HR และดึงข้อมูล
        const res = await axios.post<AdminDataResponse>("/api/behavior/admin-data", { 
          uline_id: profile.userId 
        });
        
        setData(res.data);
      } catch (err) {
        console.error(err);
        toast.error("เข้าถึงไม่ได้: เฉพาะแผนก HR เท่านั้น");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const onSubmit = async (formData: BehaviorForm) => {
    if (!data?.hrId) return;
    
    setIsSubmitting(true);
    const loadingToast = toast.loading("⏳ กำลังบันทึกข้อมูล...");

    try {
      // 📡 เรียก API เส้นที่ 2 เพื่อบันทึก Record
      const res = await axios.post("/api/behavior/record", {
        user_id: Number(formData.user_id),
        rule_id: Number(formData.rule_id),
        reason: formData.reason,
        hr_id: data.hrId
      });

      if (res.data.success) {
        toast.success("✅ บันทึกการหักคะแนนสำเร็จ", { id: loadingToast });
        reset();
      } else {
        throw new Error(res.data.error);
      }
    } catch (err: unknown) { // 🟢 เปลี่ยนจาก any เป็น unknown
        // ตรวจสอบว่า err เป็นก้อนข้อมูลจาก Axios หรือไม่
        let errorMessage = "เกิดข้อผิดพลาดในการบันทึก";
        
        if (axios.isAxiosError(err)) {
          errorMessage = err.response?.data?.error || errorMessage;
        } else if (err instanceof Error) {
          errorMessage = err.message;
        }
      
        toast.error(errorMessage, { id: loadingToast });
      }finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="page-shell text-center pt-20 text-gray-400 italic">Checking Authorization...</div>;
  if (!data?.success) return (
    <div className="page-shell flex flex-col items-center justify-center pt-20">
      <i className="fa-solid fa-lock text-red-500 text-5xl mb-4" />
      <h1 className="hero-title text-red-400">Access Denied</h1>
      <p className="text-gray-400">ขออภัย เฉพาะพนักงานแผนก HR เท่านั้นที่มีสิทธิ์เข้าถึง</p>
    </div>
  );

  return (
    <main className="page-shell">
      <Toaster position="top-center" />
      
      <div className="glass-card card-pad animate-in">
        <header className="mb-8">
          <div className="brand-badge mb-2">HR Administration</div>
          <h1 className="hero-title flex items-center gap-2">
            <i className="fa-solid fa-gavel text-purple-400" /> ตัดคะแนนพฤติกรรม
          </h1>
          <p className="text-xs text-gray-400 mt-1">ผู้บันทึก: {data.hrInfo?.name} ({data.hrInfo?.department})</p>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* เลือกพนักงาน */}
          <div>
            <label className="form-section-title">เลือกพนักงานที่ทำผิดกฎ</label>
            <div className="field">
              <select {...register("user_id", { required: "กรุณาเลือกพนักงาน" })} className="form-select pl-4">
                <option value="">-- ค้นหารายชื่อพนักงาน --</option>
                {data.users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.displayName || 'No Name'} ({u.email})
                  </option>
                ))}
              </select>
              {errors.user_id && <p className="text-red-400 text-xs mt-1">{errors.user_id.message}</p>}
            </div>
          </div>

          {/* User Preview (โชว์รูปพนักงานเมื่อถูกเลือก) */}
          {currentUser && (
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 animate-in">
              {currentUser.pictureUrl ? (
                <Image 
                  src={currentUser.pictureUrl} 
                  alt={currentUser.displayName || ""} 
                  width={50} 
                  height={50} 
                  className="rounded-full ring-2 ring-purple-500/50"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <i className="fa-solid fa-user text-purple-400" />
                </div>
              )}
              <div>
                <p className="text-sm font-bold text-gray-100">{currentUser.displayName || 'พนักงานไม่มีชื่อ LINE'}</p>
                <p className="text-xs text-gray-400">{currentUser.email}</p>
              </div>
            </div>
          )}

          {/* เลือกกฎ */}
          <div>
            <label className="form-section-title">ประเภทความผิดตามระเบียบ</label>
            <div className="field">
              <select {...register("rule_id", { required: "กรุณาเลือกกฎ" })} className="form-select pl-4">
                <option value="">-- เลือกกฎความผิด --</option>
                {data.rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.severity.toUpperCase()}] {r.category} (-{r.score})
                  </option>
                ))}
              </select>
              {errors.rule_id && <p className="text-red-400 text-xs mt-1">{errors.rule_id.message}</p>}
            </div>
          </div>

          {/* Penalty Preview */}
          {currentRule && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex justify-between items-center animate-in">
              <div className="flex-1">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Detail</p>
                <p className="text-sm text-gray-300 leading-tight">{currentRule.description}</p>
              </div>
              <div className="ml-4 text-right">
                <p className="text-2xl font-bold text-red-500">-{currentRule.score}</p>
                <p className="text-[10px] text-gray-500 uppercase">Points</p>
              </div>
            </div>
          )}

          {/* รายละเอียด */}
          <div>
            <label className="form-section-title">รายละเอียดเหตุการณ์</label>
            <textarea 
              {...register("reason")} 
              className="form-input min-h-[100px] py-3 pl-4" 
              placeholder="ระบุเหตุผล หรือรายละเอียดประกอบการพิจารณา..."
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting} 
            className="btn-gradient"
          >
            {isSubmitting ? "กำลังดำเนินการ..." : "ยืนยันการบันทึกความผิด"}
          </button>
        </form>
      </div>
    </main>
  );
}
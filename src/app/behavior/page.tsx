"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast, { Toaster } from "react-hot-toast";
import liff from "@line/liff";
import Image from "next/image";
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
  userId: number; // ID จากตาราง user
  uline_id: string | null;
  flname: string | null; // เปลี่ยนมาใช้ชื่อ-นามสกุลจริง
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
        // 🟢 Hardcoded LIFF ID
        await liff.init({ liffId: "2007772610-2rjPV8NG" }); 
        
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        
        // 📡 API เส้นที่ 1: เช็คสิทธิ์ HR และดึงข้อมูลพนักงาน
        const res = await axios.post<AdminDataResponse>("/api/behavior/admin-data", { 
          uline_id: profile.userId 
        });
        
        setData(res.data);
      } catch (err: unknown) {
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
      // 📡 API เส้นที่ 2: บันทึก Record ลง DB
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
    } catch (err: unknown) {
      let errorMessage = "เกิดข้อผิดพลาดในการบันทึก";
      if (axios.isAxiosError(err)) {
        errorMessage = err.response?.data?.error || errorMessage;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      toast.error(errorMessage, { id: loadingToast });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="page-shell text-center pt-20 text-gray-400 italic">Checking Authorization...</div>;
  if (!data?.success) return (
    <div className="page-shell flex flex-col items-center justify-center pt-20 text-center">
      <i className="fa-solid fa-lock text-red-500 text-5xl mb-4" />
      <h1 className="hero-title text-red-400">Access Denied</h1>
      <p className="text-gray-400">ขออภัย เฉพาะพนักงานแผนก HR เท่านั้นที่มีสิทธิ์เข้าถึงหน้านี้</p>
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
          <p className="text-xs text-gray-400 mt-1">
            ผู้บันทึก: {data.hrInfo?.name || 'HR'} ({data.hrInfo?.department})
          </p>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* เลือกพนักงาน */}
          <div>
            <label className="form-section-title">เลือกพนักงาน (ชื่อ-นามสกุล)</label>
            <div className="field">
              <select {...register("user_id", { required: "กรุณาเลือกพนักงาน" })} className="form-select pl-4">
                <option value="">-- ค้นหารายชื่อพนักงาน --</option>
                {data.users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.flname || 'ไม่ระบุชื่อ'} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            {errors.user_id && <p className="text-red-400 text-xs mt-1">{errors.user_id.message}</p>}
          </div>

          {/* User Preview Card */}
          {currentUser && (
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 animate-in">
              {currentUser.pictureUrl ? (
                <Image 
                  src={currentUser.pictureUrl} 
                  alt={currentUser.flname || ""} 
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
                <p className="text-sm font-bold text-gray-100">
                  {currentUser.flname || 'ไม่มีข้อมูลชื่อ'}
                </p>
                <p className="text-[10px] text-gray-400 uppercase tracking-tighter">Target Employee</p>
              </div>
            </div>
          )}

          {/* เลือกกฎ */}
          <div>
            <label className="form-section-title">ประเภทความผิด</label>
            <div className="field">
              <select {...register("rule_id", { required: "กรุณาเลือกกฎความผิด" })} className="form-select pl-4">
                <option value="">-- เลือกกฎระเบียบ --</option>
                {data.rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.severity.toUpperCase()}] {r.category} (-{r.score})
                  </option>
                ))}
              </select>
            </div>
            {errors.rule_id && <p className="text-red-400 text-xs mt-1">{errors.rule_id.message}</p>}
          </div>

          {/* Penalty Preview */}
          {currentRule && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex justify-between items-center animate-in">
              <div className="flex-1">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Description</p>
                <p className="text-sm text-gray-300 leading-tight">{currentRule.description}</p>
              </div>
              <div className="ml-4 text-right">
                <p className="text-2xl font-bold text-red-500">-{currentRule.score}</p>
                <p className="text-[10px] text-gray-500 uppercase font-bold">Points</p>
              </div>
            </div>
          )}

          {/* เหตุผลเพิ่มเติม */}
          <div>
            <label className="form-section-title">เหตุผล / รายละเอียดเหตุการณ์</label>
            <textarea 
              {...register("reason")} 
              className="form-input min-h-[100px] py-3 pl-4" 
              placeholder="เช่น ทำผิดวันที่... เวลา... สถานที่..."
            />
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting} 
            className="btn-gradient"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                กำลังบันทึก...
              </span>
            ) : (
              "ยืนยันการบันทึกความผิด"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
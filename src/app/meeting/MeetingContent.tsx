"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Image from "next/image";
import toast, { Toaster } from "react-hot-toast";

// ปรับ Type ให้ตรงกับ API ล่าสุด
type LineProfile = {
  userId: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  email: string;
};

type MeetingForm = {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  participants: string[];
  meetingLink?: string;
};

export default function MeetingContent({ groupId }: { groupId: string }) {
  const [profiles, setProfiles] = useState<LineProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<MeetingForm>();

  // 🟣 โหลดรายชื่อพนักงานที่มี LINE Profile แล้วจาก API เดียว
  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/user", { cache: "no-store" });
        const json = await res.json();
        
        if (!res.ok || !json.success) {
          throw new Error(json?.error || "Failed to fetch users");
        }
        
        // กรองเฉพาะคนที่มี userId (ผูก LINE แล้ว) เพื่อแสดงในรายชื่อผู้เข้าร่วม
        const verifiedUsers = (json.users as LineProfile[]).filter(
          (u) => u.userId !== null
        );

        setProfiles(verifiedUsers);
      } catch (err) {
        console.error("❌ Error fetching profiles:", err);
        toast.error("ไม่สามารถโหลดรายชื่อพนักงานได้");
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, []); // นำ groupId ออกถ้า API /api/user ไม่จำเป็นต้องใช้มัน

  // 🟣 submit form (คงเดิมตาม Logic ของคุณ)
  const onSubmit = async (form: MeetingForm) => {
    const loadingToast = toast.loading("⏳ กำลังส่งข้อมูล...");

    try {
      const cleanForm = {
        ...form,
        title: form.title.replace(/\n/g, " "),
        description: form.description.replace(/\n/g, " "),
      };

      const formatDateTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString("sv-SE", { 
          timeZone: "Asia/Bangkok", 
          hour12: false 
        }).replace(" ", "T") + "+07:00";
      };

      const selectedProfiles = profiles.filter((p) =>
        p.userId && form.participants.includes(p.userId)
      );

      const calendarEvent = {
        summary: cleanForm.title,
        description: cleanForm.description,
        start: {
          dateTime: formatDateTime(form.startTime),
          timeZone: "Asia/Bangkok",
        },
        end: {
          dateTime: formatDateTime(form.endTime),
          timeZone: "Asia/Bangkok",
        },
        attendees: selectedProfiles.map((p) => ({
          displayName: `@${p.displayName}`,
          email: p.email,
        })),
        groupId,
      };

      const res = await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarEvent }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.error || "Meeting API failed");

      const lineRes = await fetch("/api/line-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          calendarData: result,
          participants: selectedProfiles.map((p) => `@${p.displayName}`),
          meetingLink: form.meetingLink,
        }),
      });

      const lineResult = await lineRes.json();
      if (lineRes.ok && lineResult.success) {
        toast.success("ส่งข้อมูลประชุมไปยังกลุ่มเรียบร้อยแล้ว!", { id: loadingToast });
        reset();
      } else {
        throw new Error(lineResult.error || "LINE API failed");
      }
    } catch (err: unknown) {
      toast.error(`${err instanceof Error ? err.message : String(err)}`, { id: loadingToast });
    }
  };

  return (
    <main className="page-shell">
      <div className="glass-card card-pad animate-in">
        <Toaster position="top-center" />
        <h1 className="hero-title flex items-center gap-2">
          <i className="fa-solid fa-calendar-plus text-purple-400" />
          สร้างการประชุมใหม่
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="form-section-title">หัวข้อการประชุม</label>
            <input
              {...register("title", { required: "กรุณากรอกหัวข้อ" })}
              className="form-input"
              placeholder="ประชุมทีมประจำเดือน"
            />
            {errors.title && <span className="text-red-400 text-sm">{errors.title.message}</span>}
          </div>

          <div>
            <label className="form-section-title">รายละเอียด</label>
            <textarea
              {...register("description")}
              className="form-input min-h-[80px]"
              placeholder="วาระสำคัญ..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-section-title">เวลาเริ่ม</label>
              <input type="datetime-local" {...register("startTime", { required: "ระบุเวลาเริ่ม" })} className="form-input" />
            </div>
            <div>
              <label className="form-section-title">เวลาสิ้นสุด</label>
              <input type="datetime-local" {...register("endTime", { required: "ระบุเวลาสิ้นสุด" })} className="form-input" />
            </div>
          </div>

          <div>
            <label className="form-section-title">เลือกผู้เข้าร่วม (เฉพาะผู้ที่ยืนยันตัวตนแล้ว)</label>
            {loading ? (
              <div className="flex items-center gap-2 text-gray-400 italic">
                 <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                 กำลังโหลดรายชื่อ...
              </div>
            ) : profiles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profiles.map((p) => (
                  <label key={p.userId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 cursor-pointer hover:bg-white/10 transition-colors">
                    <input type="checkbox" value={p.userId!} {...register("participants")} className="w-4 h-4 accent-purple-500" />
                    {p.pictureUrl ? (
                      <Image src={p.pictureUrl} alt={p.displayName || ""} width={36} height={36} className="rounded-full ring-2 ring-purple-500/30" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center">
                         <i className="fa-solid fa-user text-purple-400 text-xs"></i>
                      </div>
                    )}
                    <div className="flex flex-col">
                       <span className="text-sm font-semibold text-gray-100">{p.displayName || 'Unknown'}</span>
                       <span className="text-[10px] text-gray-400">{p.email}</span>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-yellow-500 text-sm italic">ไม่พบพนักงานที่ยืนยันตัวตนในระบบ</p>
            )}
          </div>

          <div>
            <label className="form-section-title">ลิงก์การประชุม (ถ้ามี)</label>
            <input type="url" {...register("meetingLink")} className="form-input" placeholder="https://zoom.us/j/..." />
          </div>

          <button type="submit" disabled={loading} className="btn-gradient">
            <i className="fa-solid fa-paper-plane btn-icon" /> สร้างและแจ้งเตือนเข้ากลุ่ม
          </button>
        </form>
      </div>
    </main>
  );
}
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useForm } from "react-hook-form";
import Image from "next/image";
import toast, { Toaster } from "react-hot-toast";

type UserRow = {
  uline_id: string;
  email: string;
};

type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
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

  const { register, handleSubmit, formState: { errors } } = useForm<MeetingForm>();

  // 🟣 โหลดรายชื่อจาก Supabase + LINE Profile
  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const { data: users, error } = await supabase
          .from("user")
          .select("uline_id, email");

        if (error || !users) {
          console.error("❌ Supabase error:", error);
          setProfiles([]);
          return;
        }

        const promises = users.map(async (u: UserRow) => {
          const res = await fetch(`/api/line-profile?userId=${u.uline_id}`);
          if (!res.ok) return null;
          const profile = await res.json();
          return {
            userId: u.uline_id,
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
            email: u.email,
          } as LineProfile;
        });

        const results = (await Promise.all(promises)).filter(
          (p): p is LineProfile => p !== null
        );

        setProfiles(results);
      } catch (err) {
        console.error("❌ Error fetching profiles:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [groupId]);

  // 🟣 submit form
  const onSubmit = async (form: MeetingForm) => {
    const loadingToast = toast.loading("⏳ กำลังส่งข้อมูล...");

    try {
      // ✅ ส่ง event ไป n8n ผ่าน API meeting
      const res = await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: form.title,
          description: form.description,
          start: form.startTime,
          end: form.endTime,
          meetingLink: form.meetingLink,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || "Meeting API failed");
      }

      // ✅ เมื่อ n8n ตอบกลับ → ส่งไป api/line-message
      const lineRes = await fetch("/api/line-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          calendarData: result, // response จาก n8n
          participants: profiles.filter((p) =>
            form.participants.includes(p.userId)
          ).map((p) => `@${p.displayName}`),
          meetingLink: form.meetingLink,
        }),
      });

      const lineResult = await lineRes.json();

      if (lineRes.ok && lineResult.success) {
        toast.success("✅ ส่งข้อมูลประชุมไปยังกลุ่มเรียบร้อยแล้ว!", { id: loadingToast });
      } else {
        throw new Error(lineResult.error || "LINE API failed");
      }
    } catch (err: unknown) {
      console.error("Error:", err);
      toast.error(`❌ ${err instanceof Error ? err.message : String(err)}`, {
        id: loadingToast,
      });
    }
  };

  return (
    <main className="page-shell">
      <div className="glass-card card-pad animate-in">
        <Toaster position="top-right" reverseOrder={false} />
        <h1 className="hero-title flex items-center gap-2">
          <i className="fa-solid fa-people-group text-purple-400" />
          สร้างการประชุมใหม่
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* หัวข้อ */}
          <div>
            <label className="form-section-title">หัวข้อการประชุม</label>
            <input
              {...register("title", { required: "กรุณากรอกหัวข้อ" })}
              className="form-input"
              placeholder="เช่น ประชุมทีมประจำเดือน"
            />
            {errors.title && <span className="text-red-400 text-sm">{errors.title.message}</span>}
          </div>

          {/* รายละเอียด */}
          <div>
            <label className="form-section-title">รายละเอียด</label>
            <textarea
              {...register("description")}
              className="form-input min-h-[100px]"
              placeholder="รายละเอียดวาระการประชุม..."
            />
          </div>

          {/* เวลา */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="form-section-title">เวลาเริ่ม</label>
              <input type="datetime-local" {...register("startTime")} className="form-input" />
            </div>
            <div>
              <label className="form-section-title">เวลาสิ้นสุด</label>
              <input type="datetime-local" {...register("endTime")} className="form-input" />
            </div>
          </div>

          {/* ผู้เข้าร่วม */}
          <div>
            <label className="form-section-title">ผู้เข้าร่วม</label>
            {loading ? (
              <p className="text-gray-400">กำลังโหลดรายชื่อ...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profiles.map((p) => (
                  <label key={p.userId} className="flex items-center gap-3 rounded-lg border bg-white/5 px-4 py-3">
                    <input type="checkbox" value={p.userId} {...register("participants")} />
                    {p.pictureUrl && (
                      <Image src={p.pictureUrl} alt={p.displayName} width={40} height={40} className="rounded-full" />
                    )}
                    <span className="text-sm font-medium text-gray-100">{p.displayName}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ลิงก์ประชุม */}
          <div>
            <label className="form-section-title">ลิงก์การประชุม</label>
            <input type="url" {...register("meetingLink")} className="form-input" />
          </div>

          <button type="submit" className="btn-gradient">
            <i className="fa-solid fa-paper-plane btn-icon" /> สร้างการประชุม
          </button>
        </form>
      </div>
    </main>
  );
}

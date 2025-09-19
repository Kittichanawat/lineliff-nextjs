"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Image from "next/image";

type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

type MeetingForm = {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  participants: string[];
};

export default function MeetingContent({ groupId }: { groupId: string }) {
  const [profiles, setProfiles] = useState<LineProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MeetingForm>();

  // ✅ ดึงรายชื่อสมาชิกจาก LINE API ผ่าน backend
  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/group-members?groupId=${groupId}`);
        const data = await res.json();
        setProfiles(data.members || []);
      } catch (err) {
        console.error("❌ Error fetching profiles:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [groupId]);

  const onSubmit = (form: MeetingForm) => {
    console.log("📌 ข้อมูลการประชุม:", { ...form, groupId });
    alert(JSON.stringify({ ...form, groupId }, null, 2));
  };

  return (
    <main className="page-shell">
      <div className="glass-card card-pad animate-in">
        <h1 className="hero-title flex items-center gap-2">
          <i className="fa-solid fa-people-group text-purple-400" />
          สร้างการประชุมใหม่
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* หัวข้อ */}
          <div>
            <label className="form-section-title">หัวข้อการประชุม</label>
            <input
              {...register("title", { required: "กรุณากรอกหัวข้อ" })}
              className="form-input"
            />
            {errors.title && (
              <span className="text-red-500 text-sm">{errors.title.message}</span>
            )}
          </div>

          {/* รายละเอียด */}
          <div>
            <label className="form-section-title">รายละเอียด</label>
            <textarea {...register("description")} className="form-input" />
          </div>

          {/* เวลาเริ่ม */}
          <div>
            <label className="form-section-title">เวลาเริ่ม</label>
            <input
              type="datetime-local"
              {...register("startTime", { required: "กรุณาเลือกเวลาเริ่ม" })}
              className="form-input"
            />
          </div>

          {/* เวลาสิ้นสุด */}
          <div>
            <label className="form-section-title">เวลาสิ้นสุด</label>
            <input
              type="datetime-local"
              {...register("endTime", { required: "กรุณาเลือกเวลาสิ้นสุด" })}
              className="form-input"
            />
          </div>

          {/* ผู้เข้าร่วม */}
          <div>
            <label className="form-section-title">ผู้เข้าร่วม</label>
            {loading ? (
              <p className="text-gray-400">กำลังโหลดรายชื่อ...</p>
            ) : profiles.length === 0 ? (
              <p className="text-red-500">ไม่พบรายชื่อผู้ใช้</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border border-white/10 rounded-xl p-3 bg-white/5">
                {profiles.map((m) => (
                  <label key={m.userId} className="flex items-center gap-3 text-gray-100">
                    <input
                      type="checkbox"
                      value={m.userId}
                      {...register("participants")}
                      className="form-checkbox"
                    />
                    {m.pictureUrl && (
                      <Image
                        src={m.pictureUrl}
                        alt={m.displayName}
                        width={32}
                        height={32}
                        className="rounded-full"
                      />
                    )}
                    <span>{m.displayName}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ปุ่ม */}
          <button type="submit" className="btn-gradient">
            <i className="fa-solid fa-paper-plane btn-icon" />
            สร้างการประชุม
          </button>
        </form>
      </div>
    </main>
  );
}

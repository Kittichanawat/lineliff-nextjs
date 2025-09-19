"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

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

export default function MeetingPage() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId");

  const [profiles, setProfiles] = useState<LineProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MeetingForm>();

  // ✅ Fetch profiles by groupId
  useEffect(() => {
    if (!groupId) return;

    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/group-members?groupId=${groupId}`);
        if (!res.ok) throw new Error("Failed to fetch profiles");
        const data: LineProfile[] = await res.json();
        setProfiles(data);
      } catch (err) {
        console.error("❌ Fetch members error:", err);
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

        {!groupId ? (
          <p className="text-red-400">
            ❌ ไม่พบ Group ID (ต้องเข้าผ่านลิงก์จาก LINE Group)
          </p>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* หัวข้อ */}
            <div>
              <label className="form-section-title">หัวข้อการประชุม</label>
              <input
                {...register("title", { required: "กรุณากรอกหัวข้อ" })}
                className="form-input"
              />
              {errors.title && (
                <span className="text-red-500 text-sm">
                  {errors.title.message}
                </span>
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
                <p className="text-red-500">ไม่พบรายชื่อผู้ใช้ในกลุ่ม</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto border border-white/10 rounded-xl p-3 bg-white/5">
                  {profiles.map((p) => (
                    <label
                      key={p.userId}
                      className="flex items-center gap-3 text-gray-100"
                    >
                      <input
                        type="checkbox"
                        value={p.userId}
                        {...register("participants")}
                        className="form-checkbox"
                      />
                      {p.pictureUrl && (
                        <Image
                          src={p.pictureUrl}
                          alt={p.displayName}
                          width={32}
                          height={32}
                          className="rounded-full"
                        />
                      )}
                      <span>{p.displayName}</span>
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
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useForm } from "react-hook-form";
import Image from "next/image";
import liff from "@line/liff";

type UserRow = {
  id: number;
  uline_id: string;
};

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
  const [profiles, setProfiles] = useState<LineProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MeetingForm>();

  // ✅ Init LIFF + get groupId
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! });
        if (!liff.isLoggedIn()) liff.login();

        const context = liff.getContext();
        if (context.type === "group" && context.groupId) {
          setGroupId(context.groupId);
          console.log("✅ Group ID:", context.groupId);
        }
      } catch (err) {
        console.error("❌ LIFF init error:", err);
      }
    };
    initLiff();
  }, []);

  // ✅ Fetch profiles by groupId
  useEffect(() => {
    if (!groupId) return;

    const fetchProfiles = async () => {
      setLoading(true);

      // 📌 ตัวอย่าง: สมมติคุณมี table group_members (groupId, uline_id)
      const { data, error } = await supabase
        .from("group_members")
        .select("uline_id")
        .eq("groupId", groupId);

      if (error || !data) {
        console.error("❌ Supabase error:", error);
        setLoading(false);
        return;
      }

      // 📌 ดึง profile จาก LINE
      const promises = data.map(async (row: { uline_id: string }) => {
        const res = await fetch(`/api/line-profile?userId=${row.uline_id}`);
        if (!res.ok) return null;
        const profile: LineProfile = await res.json();
        return profile;
      });

      const results = (await Promise.all(promises)).filter(
        (p): p is LineProfile => p !== null
      );

      setProfiles(results);
      setLoading(false);
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
          <p className="text-red-400">❌ ไม่พบ Group ID (ต้องเปิดผ่านกลุ่ม LINE)</p>
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
                <p className="text-red-500">ไม่พบรายชื่อผู้ใช้ในกลุ่ม</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto border border-white/10 rounded-xl p-3 bg-white/5">
                  {profiles.map((p) => (
                    <label key={p.userId} className="flex items-center gap-3 text-gray-100">
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

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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MeetingForm>();

  // 🟣 ดึงข้อมูล user จาก Supabase + LINE API
  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      try {
        // ✅ ดึง userId + email จาก Supabase
        const { data: users, error } = await supabase
          .from("user")
          .select("uline_id, email");

        if (error || !users) {
          console.error("❌ Supabase error:", error);
          setProfiles([]);
          return;
        }

        // ✅ loop ไปดึงข้อมูลจาก LINE API
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

  // 🟣 Helper: format datetime -> 2025-09-20T11:30:00+07:00
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toISOString().replace("Z", "+07:00");
  };

  // 🟣 submit form
  const onSubmit = async (form: MeetingForm) => {
    const loadingToast = toast.loading("⏳ กำลังส่งข้อมูล...");

    try {
      const selectedProfiles = profiles.filter((p) =>
        form.participants.includes(p.userId)
      );
      const participantNames = selectedProfiles.map((p) => `@${p.displayName}`);

      // ✅ Calendar JSON
      const calendarEvent = {
        summary: form.title,
        description: form.description,
        start: { dateTime: formatDateTime(form.startTime), timeZone: "Asia/Bangkok" },
        end: { dateTime: formatDateTime(form.endTime), timeZone: "Asia/Bangkok" },
        attendees: selectedProfiles.map((p) => ({
          displayName: `@${p.displayName}`,
          email: p.email,
        })),
        location: form.meetingLink || "",
        groupId,
      };

      // ✅ Flex Message JSON
      const flexMessage = {
        type: "flex",
        altText: `📅 เชิญเข้าร่วมประชุม: ${form.title}`,
        contents: {
          type: "bubble",
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: `📅 ${form.title}`, weight: "bold", size: "lg" },
              { type: "text", text: `📝 ${form.description || "ไม่มีรายละเอียด"}`, wrap: true },
              { type: "text", text: `⏰ ${form.startTime} - ${form.endTime}` },
              { type: "text", text: `👥 ${participantNames.join(", ")}` },
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            contents: [
              form.meetingLink
                ? {
                    type: "button",
                    style: "primary",
                    color: "#6C63FF",
                    action: { type: "uri", label: "เข้าร่วมประชุม", uri: form.meetingLink },
                  }
                : {
                    type: "text",
                    text: "❌ ไม่มีลิงก์ประชุม",
                    color: "#999999",
                    size: "sm",
                    align: "center",
                  },
            ],
          },
        },
      };

      const output = { calendarEvent, flexMessage };

      // ✅ ส่งไป API route
      const res = await fetch("/api/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(output),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        toast.success("✅ ส่งข้อมูลการประชุมเรียบร้อยแล้ว!", { id: loadingToast });
      } else {
        toast.error(`❌ Error: ${result.error || "Unknown error"}`, {
          id: loadingToast,
        });
      }
    } catch (err: any) {
      console.error("Error:", err);
      toast.error(`Exception: ${err.message || String(err)}`, { id: loadingToast });
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
              <input
                type="datetime-local"
                {...register("startTime", { required: "กรุณาเลือกเวลาเริ่ม" })}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-section-title">เวลาสิ้นสุด</label>
              <input
                type="datetime-local"
                {...register("endTime", { required: "กรุณาเลือกเวลาสิ้นสุด" })}
                className="form-input"
              />
            </div>
          </div>

          {/* ผู้เข้าร่วม */}
          <div>
            <label className="form-section-title">ผู้เข้าร่วม</label>
            {loading ? (
              <p className="text-gray-400">กำลังโหลดรายชื่อ...</p>
            ) : profiles.length === 0 ? (
              <p className="text-red-500">ไม่พบรายชื่อผู้ใช้</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profiles.map((p) => (
                  <label
                    key={p.userId}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 
                     hover:border-purple-300 hover:bg-white/10 transition cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      value={p.userId}
                      {...register("participants")}
                      className="h-5 w-5 accent-purple-500 rounded-md"
                    />
                    {p.pictureUrl && (
                      <Image
                        src={p.pictureUrl}
                        alt={p.displayName}
                        width={40}
                        height={40}
                        className="rounded-full shadow-md"
                      />
                    )}
                    <span className="text-sm font-medium text-gray-100">{p.displayName}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ลิงก์การประชุม */}
          <div>
            <label className="form-section-title">ลิงก์การประชุม</label>
            <input
              type="url"
              {...register("meetingLink", {
                pattern: {
                  value: /^(https?:\/\/)?([\w.-]+)\.([a-z\.]{2,6})([\/\w .-]*)*\/?$/,
                  message: "กรุณาใส่ลิงก์ให้ถูกต้อง เช่น https://meet.google.com/xxx",
                },
              })}
              className="form-input"
              placeholder="เช่น https://discord.gg/xxx หรือ https://meet.google.com/xxx"
            />
            {errors.meetingLink && (
              <span className="text-red-400 text-sm">{errors.meetingLink.message}</span>
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

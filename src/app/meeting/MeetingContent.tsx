"use client";

import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import Image from "next/image";

type MeetingForm = {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  participants: string[];
};

type LineMember = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

export default function MeetingContent() {
  const params = useSearchParams();
  const groupId = params.get("groupId");

  const [members, setMembers] = useState<LineMember[]>([]);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MeetingForm>();

  // ✅ ดึงรายชื่อสมาชิกใน group จาก API route ของเรา
  useEffect(() => {
    const fetchMembers = async () => {
      if (!groupId) return;
      setLoading(true);

      try {
        const res = await fetch(`/api/group-members?groupId=${groupId}`);
        if (!res.ok) throw new Error("Failed to fetch members");
        const data = await res.json();
        setMembers(data.members || []);
      } catch (err) {
        console.error("❌ Error fetching group members:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [groupId]);

  const onSubmit = (form: MeetingForm) => {
    console.log("📌 ข้อมูลการประชุม:", { ...form, groupId });
    alert(JSON.stringify({ ...form, groupId }, null, 2));
  };

  if (!groupId) {
    return <p className="text-red-500">❌ ไม่พบ Group ID (ต้องส่งมากับ URL)</p>;
  }

  return (
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
        ) : members.length === 0 ? (
          <p className="text-red-500">ไม่พบรายชื่อผู้ใช้ในกลุ่ม</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto border border-white/10 rounded-xl p-3 bg-white/5">
            {members.map((m) => (
              <label key={m.userId} className="flex items-center gap-3 text-gray-100">
                <input
                  type="checkbox"
                  value={m.userId}
                  {...register("participants")}
                  className="form-checkbox"
                />
                {m.pictureUrl && (
                  <Image
                          src={p.pictureUrl}
                          alt={p.displayName}
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
  );
}

"use client";

import { useEffect, useState } from "react";
import MeetingContent from "./MeetingContent";

export default function MeetingPage() {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGroupId = async () => {
      try {
        const res = await fetch("/api/groupId");
        const data = await res.json();
        if (data.groupId) {
          setGroupId(data.groupId);
        }
      } catch (err) {
        console.error("❌ Error fetching groupId:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchGroupId();
  }, []);

  if (loading) {
    return <p className="text-gray-400">⏳ กำลังโหลด Group ID...</p>;
  }

  if (!groupId) {
    return <p className="text-red-500">❌ ยังไม่ได้รับ Group ID (ต้องมาจาก n8n)</p>;
  }

  return <MeetingContent groupId={groupId} />;
}

'use client';

import React, { useEffect, useState } from 'react';
import liff from '@line/liff';
import { History, Calendar, ShieldAlert, Info } from 'lucide-react';
import Image from 'next/image';

interface HistoryRecord {
  id: number;
  reason: string | null;
  score_snapshot: number;
  category_snapshot: string;
  created_at: string;
  behavior_rules: { description: string };
  recorder: { flname: string; picture_url: string | null };
}

export default function HistoryPage() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [totalDeducted, setTotalDeducted] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const initLiffAndFetch = async () => {
      try {
        const liffId = "2009882343-fZnxe0j5";
        if (!liffId) throw new Error("LIFF ID is not defined");

        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        const token = liff.getAccessToken();
        if (!token) throw new Error("No access token");

        const res = await fetch('/api/behavior/history', {
          headers: { Authorization: `Bearer ${token}` }
        });

        const result = await res.json();
        if (result.success) {
          setRecords(result.data);
          setTotalDeducted(result.total_deducted);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error("LIFF/Fetch Error:", errorMsg);
      } finally {
        setLoading(false);
      }
    };

    initLiffAndFetch();
  }, []);

  if (loading) return (
    <main className="page-shell animate-in font-prompt">
      <div className="flex items-center justify-between mb-6">
        <div className="h-5 w-32 rounded bg-white/5 animate-pulse" />
        <div className="h-9 w-16 rounded bg-white/5 animate-pulse" />
      </div>
      <div className="h-6 w-48 rounded bg-white/5 animate-pulse mb-2" />
      <div className="h-4 w-64 rounded bg-white/5 animate-pulse mb-8" />
      <div className="glass-card card-pad mb-8 h-16 animate-pulse" />
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="glass-card card-pad h-24 animate-pulse" />
        ))}
      </div>
    </main>
  );

  return (
    <main className="page-shell animate-in font-prompt">
      <div className="flex items-center justify-between mb-6">
        <div className="brand-badge">
          <History size={16} />
          <span className="text-xs">Behavior History</span>
        </div>
        <div className="text-right">
          <p className="hero-sub text-[10px] uppercase tracking-widest font-bold">คะแนนเสียสะสม</p>
          <p className={`text-3xl font-bold ${totalDeducted >= 16 ? 'text-red-500' : 'text-indigo-400'}`}>
            {totalDeducted} <span className="text-sm text-gray-500">/ 16</span>
          </p>
        </div>
      </div>

      <header className="mb-8">
        <h1 className="hero-title">ประวัติพฤติกรรม</h1>
        <p className="hero-sub text-sm">รายการบันทึกการหักคะแนนพฤติกรรมทั้งหมดของคุณ</p>
      </header>

      <div className={`glass-card card-pad mb-8 flex items-center gap-4 border-l-4 ${totalDeducted >= 16 ? 'border-red-500' : totalDeducted >= 8 ? 'border-yellow-500' : 'border-emerald-500'
        }`}>
        <div className={`p-3 rounded-full bg-white/5 ${totalDeducted >= 16 ? 'text-red-400' : totalDeducted >= 8 ? 'text-yellow-400' : 'text-emerald-400'
          }`}>
          <ShieldAlert size={24} />
        </div>
        <div>
          <h3 className="text-sm font-semibold">สถานะปัจจุบัน</h3>
          <p className="text-xs text-gray-400">
            {totalDeducted >= 16
              ? '🔴 สถานะวิกฤต (ใบแดง)'
              : totalDeducted >= 8
                ? '🟡 สถานะเฝ้าระวัง (ใบเหลือง)'
                : '🟢 สถานะปกติ'}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {records.length > 0 ? records.map((r: HistoryRecord) => (
          <div key={r.id} className="glass-card hover:bg-white/10 transition-all active:scale-[0.98]">
            <div className="card-pad flex flex-col gap-3">

              <div className="flex items-center justify-between">
                <div className="flex gap-4 items-start">
                  <div className="mt-1 p-2.5 rounded-xl bg-white/5 text-purple-300 border border-white/5 shrink-0">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-100">{r.behavior_rules.description}</h4>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2 italic">
                      &ldquo;{r.reason || 'ไม่ได้ระบุรายละเอียด'}&rdquo;
                    </p>
                  </div>
                </div>
                <div className="pl-4 shrink-0">
                  <span className="font-bold text-red-400 text-lg">-{r.score_snapshot}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-500 border border-white/5 uppercase">
                    {r.category_snapshot}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    {new Date(r.created_at).toLocaleDateString('th-TH', {
                      day: '2-digit',
                      month: 'short',
                      year: '2-digit',
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-[9px] text-gray-500 leading-none">ผู้บันทึก</p>
                    <p className="text-[10px] font-medium text-gray-300">{r.recorder.flname}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full border border-white/10 overflow-hidden bg-gray-800 shrink-0">
                    <Image
                      src={
                        r.recorder.picture_url ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(r.recorder.flname)}&background=6c5ce7&color=fff`
                      }
                      alt={r.recorder.flname}
                      width={28}
                      height={28}
                      className="h-full w-full object-cover"
                      unoptimized={!r.recorder.picture_url}
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>
        )) : (
          <div className="glass-card py-16 text-center text-gray-500 italic text-sm">
            ไม่มีประวัติการถูกหักคะแนน
          </div>
        )}
      </div>

      <footer className="mt-8 mb-8">
        <div className="btn-gradient cursor-pointer">
          <span className="text-sm">ติดต่อฝ่ายบุคคลเพื่อคัดค้าน</span>
        </div>
        <div className="form-footer mt-4">
          <div className="form-footer-text opacity-50">
            <Info size={12} />
            <span className="text-[10px]">ข้อมูลอัปเดตแบบ Real-time จากระบบ HR</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
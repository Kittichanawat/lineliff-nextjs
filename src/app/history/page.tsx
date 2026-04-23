'use client';

import React, { useEffect, useState } from 'react';
import liff from '@line/liff';
import { History, Calendar, ChevronRight, ShieldAlert, Info, Loader2 } from 'lucide-react';

interface HistoryRecord {
  id: number;
  reason: string;
  score_snapshot: number;
  category_snapshot: string;
  created_at: string;
  behavior_rules: { description: string };
}

export default function HistoryPage() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [totalDeducted, setTotalDeducted] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initLiffAndFetch = async () => {
      try {
        await liff.init({ liffId: "2007772610-2rjPV8NG" });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const token = liff.getAccessToken();
        const res = await fetch('/api/behavior/history', {
          headers: { Authorization: `Bearer ${token}` }
        });

        const result = await res.json();
        if (result.success) {
          setRecords(result.data);
          setTotalDeducted(result.total_deducted);
        }
      } catch (err) {
        console.error("LIFF/Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };

    initLiffAndFetch();
  }, []);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#0d1117]">
      <Loader2 className="animate-spin text-purple-500" size={40} />
    </div>
  );

  return (
    <main className="page-shell animate-in font-prompt">
      {/* Header Stat */}
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

      {/* Status Card */}
      <div className={`glass-card card-pad mb-8 flex items-center gap-4 border-l-4 ${
        totalDeducted >= 16 ? 'border-red-500' : totalDeducted >= 8 ? 'border-yellow-500' : 'border-emerald-500'
      }`}>
        <div className={`p-3 rounded-full bg-white/5 ${
          totalDeducted >= 16 ? 'text-red-400' : totalDeducted >= 8 ? 'text-yellow-400' : 'text-emerald-400'
        }`}>
          <ShieldAlert size={24} />
        </div>
        <div>
          <h3 className="text-sm font-semibold">สถานะปัจจุบัน</h3>
          <p className="text-xs text-gray-400">
            {totalDeducted >= 16 ? '🔴 สถานะวิกฤต (ใบแดง)' : totalDeducted >= 8 ? '🟡 สถานะเฝ้าระวัง (ใบเหลือง)' : '🟢 สถานะปกติ'}
          </p>
        </div>
      </div>

      {/* List Items */}
      <div className="space-y-4">
        {records.length > 0 ? records.map((r) => (
          <div key={r.id} className="glass-card hover:bg-white/10 transition-all active:scale-[0.98] group">
            <div className="card-pad flex items-center justify-between">
              <div className="flex gap-4 items-start">
                <div className="mt-1 p-2.5 rounded-xl bg-white/5 text-purple-300 border border-white/5">
                  <Calendar size={18} />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-100">{r.behavior_rules.description}</h4>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-1">{r.reason || 'ไม่ได้ระบุรายละเอียด'}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-500 border border-white/5 uppercase">
                      {r.category_snapshot}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {new Date(r.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 pl-4">
                <span className="font-bold text-red-400 text-lg">-{r.score_snapshot}</span>
                <ChevronRight size={16} className="text-gray-700" />
              </div>
            </div>
          </div>
        )) : (
          <div className="glass-card py-16 text-center text-gray-500 italic text-sm">ไม่มีประวัติการถูกหักคะแนน</div>
        )}
      </div>

      {/* Footer Button (White Text) */}
      <footer className="mt-8">
        <div className="box cursor-pointer flex items-center justify-center bg-[#4F46E5] rounded-xl h-[45px] transition-transform active:scale-95 shadow-lg shadow-indigo-500/20">
          <span className="text-white font-bold text-sm">ติดต่อฝ่ายบุคคลเพื่อคัดค้าน</span>
        </div>
        <div className="form-footer">
          <div className="form-footer-text opacity-50">
            <Info size={12} />
            <span className="text-[10px]">ข้อมูลอัปเดตแบบ Real-time จากระบบ HR</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
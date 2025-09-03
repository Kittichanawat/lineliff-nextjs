"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

export default function RegisterForm() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [form, setForm] = useState({
    userId: "",
    displayName: "",
    flname: "",
    nname: "",
    dob: "",
    department: "",
    position: "",
    email: "",
    phone: "",
  });

  // ✅ Init LIFF
  useEffect(() => {
    const initLiff = async () => {
      // @ts-ignore
      await liff.init({ liffId: "2007772610-2rjPV8NG" });
      if (!liff.isLoggedIn()) liff.login();
      const profile = await liff.getProfile();
      setForm((f) => ({
        ...f,
        userId: profile.userId,
        displayName: profile.displayName,
      }));
    };
    initLiff();
  }, []);

  // ✅ โหลด department จาก Supabase
  useEffect(() => {
    const loadDeps = async () => {
      const { data, error } = await supabase
        .from("dep_pos")
        .select("dep_id, p_id, departments(dep_id,dep_name), position(p_id,p_name)");
      if (error) {
        console.error("Supabase error:", error);
        return;
      }
      const depMap: any = {};
      data.forEach((row: any) => {
        if (!depMap[row.departments.dep_id]) {
          depMap[row.departments.dep_id] = {
            dep_id: row.departments.dep_id,
            dep_name: row.departments.dep_name,
            positions: [],
          };
        }
        depMap[row.departments.dep_id].positions.push({
          p_id: row.position.p_id,
          p_name: row.position.p_name,
        });
      });
      setDepartments(Object.values(depMap));
    };
    loadDeps();
  }, []);

  // ✅ เปลี่ยนแผนก
  useEffect(() => {
    if (!form.department) {
      setPositions([]);
      return;
    }
    const dep = departments.find((d) => d.dep_id === form.department);
    setPositions(dep?.positions || []);
  }, [form.department, departments]);

  // ✅ จัดการ input
  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.id]: e.target.value });
  };

  // ✅ Submit → ส่ง OTP
  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!/^\d{10}$/.test(form.phone)) {
      Swal.fire("เบอร์ไม่ถูกต้อง", "กรุณากรอกเบอร์โทรศัพท์ 10 หลัก", "warning");
      return;
    }

    try {
      const res = await axios.post("/api/send-otp", form);
      if (res.data.success) {
        Swal.fire("สำเร็จ", "OTP ถูกส่งไปที่ " + form.phone, "success");
      } else {
        Swal.fire("ผิดพลาด", res.data.message || "ส่ง OTP ไม่ได้", "error");
      }
    } catch (err: any) {
      Swal.fire("Error", err.message, "error");
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <i className="fa-solid fa-id-card"></i> ฟอร์มลงทะเบียนพนักงาน
        </h1>
        <p className="text-gray-500 mb-6">กรอกข้อมูลให้ครบถ้วนเพื่อยืนยันตัวตนผ่านเบอร์โทร (OTP)</p>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="font-medium">ชื่อนามสกุล</label>
            <input id="flname" value={form.flname} onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 mt-1" required />
          </div>
          <div>
            <label className="font-medium">ชื่อเล่น</label>
            <input id="nname" value={form.nname} onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 mt-1" required />
          </div>

          <div>
            <label className="font-medium">วันเดือนปีเกิด</label>
            <input type="date" id="dob" value={form.dob} onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 mt-1" required />
          </div>

          <div>
            <label className="font-medium">แผนก</label>
            <select id="department" value={form.department} onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 mt-1">
              <option value="">-- กรุณาเลือกแผนก --</option>
              {departments.map((d) => (
                <option key={d.dep_id} value={d.dep_id}>{d.dep_name}</option>
              ))}
            </select>
          </div>

          {positions.length > 0 && (
            <div>
              <label className="font-medium">ตำแหน่ง</label>
              <select id="position" value={form.position} onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 mt-1">
                <option value="">-- กรุณาเลือกตำแหน่ง --</option>
                {positions.map((p) => (
                  <option key={p.p_id} value={p.p_id}>{p.p_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="font-medium">อีเมล</label>
            <input type="email" id="email" value={form.email} onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 mt-1" required />
          </div>

          <div>
            <label className="font-medium">เบอร์โทรศัพท์</label>
            <input type="tel" id="phone" value={form.phone} onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2 mt-1" required />
          </div>

          <div className="col-span-2">
            <button type="submit"
              className="w-full py-3 mt-4 rounded-lg text-white font-semibold shadow
              bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600">
              ส่งข้อมูล
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

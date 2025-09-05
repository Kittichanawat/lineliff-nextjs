"use client";

import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import axios from "axios";
import { supabase } from "@/lib/supabaseClient";
import Modal from "@/components/modal";

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

  const [isOtpOpen, setIsOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");

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

  // ✅ โหลด department
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.id]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(form.phone)) {
      Swal.fire("เบอร์ไม่ถูกต้อง", "กรุณากรอกเบอร์โทรศัพท์ 10 หลัก", "warning");
      return;
    }
    try {
      const res = await axios.post("/api/send-otp", form);
      if (res.data.success) {
        setIsOtpOpen(true);
      } else {
        Swal.fire("ผิดพลาด", res.data.message || "ส่ง OTP ไม่ได้", "error");
      }
    } catch (err: any) {
      Swal.fire("Error", err.message, "error");
    }
  };

  const handleVerifyOtp = async () => {
    try {
      const res = await axios.post("/api/verify-otp", { phone: form.phone, otp });
      if (res.data.verified) {
        await axios.post("/api/save-form", form);
        Swal.fire("สำเร็จ", "ข้อมูลถูกบันทึกแล้ว", "success");
        setIsOtpOpen(false);
      } else {
        Swal.fire("OTP ไม่ถูกต้อง", "กรุณาลองใหม่", "error");
      }
    } catch (err: any) {
      Swal.fire("Error", err.message, "error");
    }
  };

  return (
    <main className="form-container">
      <div className="form-card">
        <h1 className="form-title">
          <i className="fa-solid fa-id-card"></i> ฟอร์มลงทะเบียนพนักงาน
        </h1>
        <p className="form-subtitle">
          กรอกข้อมูลให้ครบถ้วนเพื่อยืนยันตัวตนผ่านเบอร์โทร (OTP)
        </p>

        <form onSubmit={handleSubmit} className="form-grid">
          <div>
            <label>ชื่อนามสกุล</label>
            <input id="flname" value={form.flname} onChange={handleChange} required />
          </div>
          <div>
            <label>ชื่อเล่น</label>
            <input id="nname" value={form.nname} onChange={handleChange} required />
          </div>
          <div>
            <label>วันเดือนปีเกิด</label>
            <input type="date" id="dob" value={form.dob} onChange={handleChange} required />
          </div>
          <div>
            <label>แผนก</label>
            <select id="department" value={form.department} onChange={handleChange}>
              <option value="">-- กรุณาเลือกแผนก --</option>
              {departments.map((d) => (
                <option key={d.dep_id} value={d.dep_id}>
                  {d.dep_name}
                </option>
              ))}
            </select>
          </div>
          {positions.length > 0 && (
            <div>
              <label>ตำแหน่ง</label>
              <select id="position" value={form.position} onChange={handleChange}>
                <option value="">-- กรุณาเลือกตำแหน่ง --</option>
                {positions.map((p) => (
                  <option key={p.p_id} value={p.p_id}>
                    {p.p_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label>อีเมล</label>
            <input type="email" id="email" value={form.email} onChange={handleChange} required />
          </div>
          <div>
            <label>เบอร์โทรศัพท์</label>
            <input type="tel" id="phone" value={form.phone} onChange={handleChange} required />
          </div>
          <div className="col-span-2">
            <button type="submit" className="submit-btn">ส่งข้อมูล</button>
          </div>
        </form>
      </div>

      <Modal isOpen={isOtpOpen} onClose={() => setIsOtpOpen(false)} title="ยืนยันรหัส OTP">
        <input
          type="text"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          maxLength={6}
          placeholder="______"
          className="otp-input"
        />
        <button onClick={handleVerifyOtp} className="submit-btn">ยืนยัน</button>
      </Modal>
    </main>
  );
}

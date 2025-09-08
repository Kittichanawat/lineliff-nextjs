"use client";

import { ReactNode, useEffect, useCallback } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** กดพื้นหลังแล้วปิดไหม (ดีฟอลต์: true) */
  closeOnBackdrop?: boolean;
  /** กดปุ่ม ESC แล้วปิดไหม (ดีฟอลต์: true) */
  closeOnEsc?: boolean;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  closeOnBackdrop = true,
  closeOnEsc = true,
}: ModalProps) {
  // ล็อกสกอร์ลของ body ตอนเปิดโมดัล
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // ปิดด้วยปุ่ม ESC (ถ้าอนุญาต)
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!closeOnEsc) return;
      if (e.key === "Escape") onClose();
    },
    [closeOnEsc, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onKeyDown]);

  if (!isOpen) return null;

  // คลิกพื้นหลัง: ปิดเฉพาะเมื่ออนุญาต
  const handleOverlayClick = () => {
    if (closeOnBackdrop) onClose();
  };

  // กันคลิกทะลุ/กัน propagation ในแผงโมดัล
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={handleOverlayClick}
    >
      <div className="modal-panel" onClick={stop}>
        {title && <h2 className="modal-title">{title}</h2>}

        <div>{children}</div>

        {/* ปุ่มปิด (ถ้าต้องการ) */}
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-ghost">
            <i className="fa-solid fa-xmark mr-2" />
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

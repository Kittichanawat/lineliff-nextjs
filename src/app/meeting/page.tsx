import { Suspense } from "react";
import MeetingContent from "./MeetingContent";

export default function Page() {
  return (
    <main className="page-shell">
      <div className="glass-card card-pad animate-in">
        <h1 className="hero-title flex items-center gap-2">
          <i className="fa-solid fa-people-group text-purple-400" />
          สร้างการประชุมใหม่
        </h1>

        <Suspense fallback={<p className="text-gray-400">Loading...</p>}>
          <MeetingContent />
        </Suspense>
      </div>
    </main>
  );
}

"use client";

import { useState, useTransition } from "react";
import { runAutomationsNowAction } from "../../actions";

export function RunNowButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-sm text-slate-500">{message}</span>}
      <button
        className="btn-secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await runAutomationsNowAction();
            setMessage(r.ok ? "Başlatıldı; sonuçlar birkaç saniye içinde Mesajlar sayfasında görünür." : r.error);
          })
        }
      >
        {pending ? "Başlatılıyor…" : "Şimdi çalıştır"}
      </button>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { formatDateTime } from "@/lib/format";
import { replyAction, resolveConversationAction } from "../../../actions";

export function ReplyBox({ phone, windowOpen, windowClosesAt, needsHuman }: {
  phone: string;
  windowOpen: boolean;
  windowClosesAt: string | null;
  needsHuman: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      const r = await replyAction(phone, text);
      if (r.ok) {
        setText("");
        setError(null);
      } else {
        setError(r.error);
      }
    });

  return (
    <div className="card space-y-3">
      {windowOpen ? (
        <p className="text-xs text-slate-500">
          Serbest mesaj gönderilebilir: {windowClosesAt ? `${formatDateTime(windowClosesAt)} tarihine kadar` : ""} (müşterinin son mesajından itibaren 24 saat).
        </p>
      ) : (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Müşterinin son mesajının üzerinden 24 saat geçti. Meta kuralı gereği yalnızca onaylı şablonla mesaj gönderilebilir (Şablonlar → test mesajı).
        </p>
      )}
      <label className="label" htmlFor="reply">Yanıt</label>
      <textarea id="reply" className="input min-h-24" maxLength={4096} value={text} disabled={!windowOpen || pending}
        onChange={(e) => setText(e.target.value)} placeholder="Müşteriye yanıtınızı yazın…" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" disabled={!windowOpen || pending || !text.trim()} onClick={send}>
          {pending ? "Gönderiliyor…" : "Gönder"}
        </button>
        {needsHuman && (
          <button className="btn-secondary" disabled={pending} onClick={() => start(() => resolveConversationAction(phone))}>
            Çözüldü olarak işaretle (asistan tekrar devreye girer)
          </button>
        )}
      </div>
    </div>
  );
}

import { Fragment, type ReactNode } from "react";
import type { TemplatePreview } from "@/lib/types";

/** WhatsApp'ın *kalın*, _italik_, ~üstü çizili~ biçimlerini güvenli şekilde (HTML enjekte etmeden) uygular. */
export function formatWhatsApp(text: string): ReactNode[] {
  const pattern = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  return text.split(pattern).map((part, i) => {
    if (/^\*[^*]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(part)) return <s key={i}>{part.slice(1, -1)}</s>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function WhatsAppPreview({ preview }: { preview: TemplatePreview | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <div className="bg-wa-dark px-4 py-3 text-sm font-medium text-white">Mağazanız</div>
      <div className="min-h-64 bg-wa-chat p-4">
        {!preview || (!preview.body && !preview.header) ? (
          <p className="text-center text-xs text-slate-500">Mesaj yazdıkça burada görünecek.</p>
        ) : (
          <div className="max-w-[85%]">
            <div className="rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm shadow-sm">
              {preview.header && <p className="mb-1 font-semibold">{formatWhatsApp(preview.header)}</p>}
              <p className="whitespace-pre-wrap break-words">{formatWhatsApp(preview.body)}</p>
              {preview.footer && <p className="mt-1 text-xs text-slate-500">{preview.footer}</p>}
              <p className="mt-1 text-right text-[10px] text-slate-400">12:00</p>
            </div>
            {preview.buttons.map((b, i) => (
              <div key={i} className="mt-1 rounded-lg bg-white px-3 py-2 text-center text-sm text-sky-600 shadow-sm" title={b.url}>
                {b.type === "URL" ? "↗ " : "↩ "}
                {b.text || "…"}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

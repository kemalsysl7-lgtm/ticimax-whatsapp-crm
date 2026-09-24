"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { VariableDef } from "@/lib/types";
import { testMessageAction } from "../../../actions";

export function TestMessageForm({ templateName, variables }: { templateName: string; variables: VariableDef[] }) {
  const [state, action, pending] = useActionState(testMessageAction, null);
  return (
    <form action={action} className="card space-y-4">
      <div>
        <h2 className="font-semibold">Test mesajı gönder</h2>
        <p className="text-sm text-slate-500">
          Mesaj normal kurallarla gönderilir: numaranın ilgili izni yoksa atlanır. İzin eklemek için <Link href="/consents" className="text-emerald-700 underline">İzinler</Link>.
        </p>
      </div>
      <input type="hidden" name="templateName" value={templateName} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="phone">Cep telefonu</label>
          <input id="phone" name="phone" required placeholder="0532 123 45 67" className="input" />
        </div>
        {variables.map((v) => (
          <div key={v.key}>
            <label className="label" htmlFor={`var_${v.key}`}>{v.label}</label>
            <input id={`var_${v.key}`} name={`var_${v.key}`} defaultValue={v.example} className="input" />
          </div>
        ))}
      </div>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && (
        <p className="text-sm text-emerald-700">
          Mesaj #{state.data.messageId} kuyruğa alındı. Sonucu <Link href="/messages" className="underline">Mesajlar</Link> sayfasında görebilirsiniz.
        </p>
      )}
      <button className="btn-primary" disabled={pending}>{pending ? "Gönderiliyor…" : "Test mesajı gönder"}</button>
    </form>
  );
}

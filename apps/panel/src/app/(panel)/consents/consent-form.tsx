"use client";

import { useActionState } from "react";
import { addConsentAction } from "../../actions";

export function ConsentForm() {
  const [state, action, pending] = useActionState(addConsentAction, null);
  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="phone">Cep telefonu</label>
        <input id="phone" name="phone" required placeholder="0532 123 45 67" className="input" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="purpose">İzin türü</label>
          <select id="purpose" name="purpose" className="input">
            <option value="transactional">Bilgilendirme (sipariş, kargo)</option>
            <option value="marketing">Pazarlama (kampanya)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="granted">İşlem</label>
          <select id="granted" name="granted" className="input">
            <option value="true">İzin ver</option>
            <option value="false">İzni geri al</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">Not / kanıt açıklaması</label>
        <input id="note" name="note" maxLength={500} placeholder="Ör. 24.09.2026 mağazada yazılı onay formu" className="input" />
      </div>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">İzin kaydedildi.</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</button>
    </form>
  );
}

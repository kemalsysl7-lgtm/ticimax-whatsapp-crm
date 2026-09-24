import { ConsentForm } from "./consent-form";

export default function ConsentsPage() {
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">İzinler</h1>
      <p className="text-sm text-slate-600">
        İzinler Ticimax'teki SMS izninden otomatik aktarılır; müşteri WhatsApp'ta <b>DUR</b> yazınca kapanır, <b>BAŞLA</b> yazınca açılır.
        Aşağıdaki form, başka bir kanaldan (ör. mağazada yazılı) alınan izni elle kaydetmek içindir. Her kayıt kanıt olarak saklanır.
      </p>
      <ConsentForm />
    </div>
  );
}

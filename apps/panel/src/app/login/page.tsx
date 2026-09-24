import { redirect } from "next/navigation";
import { hasSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await hasSession()) redirect("/segments");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-lg font-semibold">WhatsApp CRM</h1>
        <p className="mb-5 text-sm text-slate-500">Yönetim paneline giriş</p>
        <LoginForm />
      </div>
    </main>
  );
}

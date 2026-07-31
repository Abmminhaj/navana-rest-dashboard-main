import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Hotel, Lock, Phone } from "lucide-react";
import { inputClass, buttonPrimary } from "@/components/ui-kit";
import { login } from "@/lib/auth-storage";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Login — Navana Rest House" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!phone.trim() || !password) {
      setError("Mobile Number ও Password দিন।");
      return;
    }

    setLoading(true);
    const result = await login(phone, password);
    setLoading(false);

    if (result.success) {
      navigate({ to: "/" });
    } else {
      setError(result.error || "Login ব্যর্থ হয়েছে।");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Hotel className="h-7 w-7" />
          </div>
          <div className="text-lg font-bold tracking-tight text-foreground">NAVANA REST HOUSE</div>
          <div className="text-xs font-medium text-muted-foreground">Hotel Management System</div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
        >
          <h1 className="text-center text-base font-semibold text-foreground">লগইন করুন</h1>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Mobile Number
            </span>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className={inputClass + " pl-9"}
                placeholder="01XXXXXXXXX"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Password
            </span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                className={inputClass + " pl-9"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-xs font-medium text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={buttonPrimary + " w-full disabled:opacity-60"}
          >
            {loading ? "লগইন হচ্ছে…" : "লগইন করুন"}
          </button>
        </form>
      </div>
    </div>
  );
}

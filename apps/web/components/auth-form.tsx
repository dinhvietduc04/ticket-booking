"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Loader2,
  Lock,
  LogIn,
  Mail,
  UserPlus,
} from "lucide-react";
import { login, register, type AuthSession } from "@/lib/api";

type AuthMode = "login" | "register";

const demoEmail = "customer-a@seatly.local";
const demoPassword = "password123";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isRegister = mode === "register";

  const copy = useMemo(
    () =>
      isRegister
        ? {
            eyebrow: "Create account",
            title: "Register",
            action: "Create Account",
            switchText: "Already have an account?",
            switchHref: "/login",
            switchLabel: "Log in",
          }
        : {
            eyebrow: "Welcome back",
            title: "Login",
            action: "Log In",
            switchText: "Need an account?",
            switchHref: "/register",
            switchLabel: "Register",
          },
    [isRegister],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    startTransition(async () => {
      try {
        const session = isRegister
          ? await register({
              email,
              password,
              firstName: String(form.get("firstName") ?? ""),
              lastName: String(form.get("lastName") ?? ""),
            })
          : await login({ email, password });

        persistSession(session);
        router.push("/events");
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Auth failed.");
      }
    });
  }

  return (
    <main className="app-container grid min-h-[calc(100vh-73px)] items-center gap-8 py-8 lg:grid-cols-[1fr_420px]">
      <section className="max-w-2xl">
        <p className="eyebrow mb-2">{copy.eyebrow}</p>
        <h1 className="text-4xl font-bold text-ink">{copy.title}</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate">
          Use the seeded customer account or create a new one. The booking flow
          can keep moving while the full account area comes together.
        </p>
        {!isRegister ? (
          <div className="mt-6 grid max-w-md gap-2 rounded-xl border border-white/10 bg-panel/85 p-4 text-sm shadow-soft">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate">Email</span>
              <strong className="mono-data text-right">{demoEmail}</strong>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate">Password</span>
              <strong className="mono-data">{demoPassword}</strong>
            </div>
          </div>
        ) : null}
      </section>

      <section className="glass-panel-strong rounded-2xl p-5">
        <form className="grid gap-4" onSubmit={submit}>
          {isRegister ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" name="firstName" required />
              <Field label="Last name" name="lastName" required />
            </div>
          ) : null}

          <Field
            autoComplete="email"
            defaultValue={isRegister ? undefined : demoEmail}
            icon="mail"
            label="Email"
            name="email"
            required
            type="email"
          />
          <Field
            autoComplete={isRegister ? "new-password" : "current-password"}
            defaultValue={isRegister ? undefined : demoPassword}
            icon="lock"
            label="Password"
            minLength={8}
            name="password"
            required
            type="password"
          />

          {error ? (
            <div className="flex gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
              <AlertCircle
                className="mt-0.5 shrink-0"
                size={16}
                aria-hidden="true"
              />
              {error}
            </div>
          ) : null}

          <button
            className="btn-primary mt-1 w-full"
            disabled={isPending}
            type="submit"
          >
            {isPending ? (
              <Loader2 className="animate-spin" size={18} />
            ) : isRegister ? (
              <UserPlus size={18} aria-hidden="true" />
            ) : (
              <LogIn size={18} aria-hidden="true" />
            )}
            {copy.action}
          </button>
        </form>

        <p className="mt-5 border-t border-white/10 pt-4 text-center text-sm text-slate">
          {copy.switchText}{" "}
          <Link className="font-semibold text-[#c0c1ff]" href={copy.switchHref}>
            {copy.switchLabel}
          </Link>
        </p>
      </section>
    </main>
  );
}

function Field({
  icon,
  label,
  ...props
}: {
  autoComplete?: string;
  defaultValue?: string;
  icon?: "mail" | "lock";
  label: string;
  minLength?: number;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-ink">
      {label}
      <span className="field-shell">
        {icon === "mail" ? (
          <Mail className="text-slate" size={17} aria-hidden="true" />
        ) : icon === "lock" ? (
          <Lock className="text-slate" size={17} aria-hidden="true" />
        ) : null}
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate"
          {...props}
        />
      </span>
    </label>
  );
}

function persistSession(session: AuthSession) {
  localStorage.setItem("seatly.accessToken", session.accessToken);
  localStorage.setItem("seatly.user", JSON.stringify(session.user));
  window.dispatchEvent(new Event("seatly.auth.changed"));
}

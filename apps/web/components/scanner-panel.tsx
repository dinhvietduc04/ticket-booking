"use client";

import { FormEvent, useState, useTransition } from "react";
import { BadgeCheck, Loader2, ScanLine, ShieldCheck, X } from "lucide-react";
import type { TicketValidationResult } from "@/lib/api";
import { checkInTicket, validateTicket } from "@/lib/api";

export function ScannerPanel() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<TicketValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(action: "validate" | "check-in") {
    setError(null);
    startTransition(async () => {
      try {
        if (action === "validate") {
          setResult(await validateTicket(token));
          return;
        }

        const checkedIn = await checkInTicket(token);
        setResult({
          valid: checkedIn.ticket.status === "USED",
          ticket: checkedIn.ticket,
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Scan failed.");
      }
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit("validate");
  }

  return (
    <main className="app-container grid gap-6 py-8 lg:grid-cols-[1fr_380px]">
      <section>
        <p className="eyebrow mb-2 flex items-center gap-2">
          <ScanLine size={18} aria-hidden="true" />
          Scanner
        </p>
        <h1 className="text-3xl font-bold">Ticket check-in</h1>

        <form className="mt-6 glass-panel rounded-2xl p-5" onSubmit={onSubmit}>
          <label className="text-sm font-semibold" htmlFor="ticket-token">
            QR token
          </label>
          <textarea
            className="mono-data mt-2 min-h-32 w-full resize-none rounded-xl border border-white/10 bg-midnight px-3 py-2 text-sm text-ink outline-none transition placeholder:text-slate focus:border-coral focus:shadow-focus"
            id="ticket-token"
            onChange={(event) => setToken(event.target.value)}
            placeholder="ticket_..."
            value={token}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="btn-primary"
              disabled={isPending || token.trim().length === 0}
              type="submit"
            >
              {isPending ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <ShieldCheck size={18} />
              )}
              Validate
            </button>
            <button
              className="btn-secondary"
              disabled={isPending || token.trim().length === 0}
              onClick={() => submit("check-in")}
              type="button"
            >
              <BadgeCheck size={18} aria-hidden="true" />
              Check in
            </button>
          </div>
        </form>
      </section>

      <aside className="glass-panel-strong h-fit rounded-2xl p-5">
        <h2 className="text-lg font-bold">Scan result</h2>
        {error ? (
          <p className="mt-4 flex gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
            <X className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
            {error}
          </p>
        ) : result ? (
          <div className="mt-4 text-sm">
            <p
              className={
                result.valid
                  ? "font-semibold text-moss"
                  : "font-semibold text-red-200"
              }
            >
              {result.valid
                ? "Valid ticket"
                : (result.reason ?? "Invalid ticket")}
            </p>
            {result.ticket ? (
              <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="font-semibold">{result.ticket.eventTitle}</p>
                <p className="mono-data text-slate">
                  Seat {result.ticket.seatLabel}
                </p>
                <p className="text-slate">{result.ticket.holderName}</p>
                <p className="mono-data text-moss">{result.ticket.status}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate">
            Validate a QR token before admitting a guest.
          </p>
        )}
      </aside>
    </main>
  );
}

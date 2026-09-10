"use client";
import { useEffect, useState } from "react";
import { operations, type RefundQuote } from "@/lib/operations";
import { formatVnd } from "@/lib/api";
export function RefundPanel({ bookingId }: { bookingId: string }) {
  const [quote, setQuote] = useState<RefundQuote | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    operations<RefundQuote>(`/bookings/${bookingId}/refund-quote`)
      .then((q) => {
        if (active) setQuote(q);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [bookingId]);
  async function refund() {
    setBusy(true);
    try {
      await operations(`/bookings/${bookingId}/refund`, "POST", {});
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed.");
      setBusy(false);
    }
  }
  return (
    <section className="glass-panel mt-6 rounded-2xl p-5">
      <h2 className="text-lg font-bold">Cancellation & refunds</h2>
      {error && (
        <p className="mt-3 text-red-200" role="alert">
          {error}
        </p>
      )}
      {quote && (
        <>
          <p className="mt-2 text-sm text-slate">
            Full refund at least {quote.policy.fullRefundHours} hours before the
            session; {quote.policy.partialRefundPercent}% at least{" "}
            {quote.policy.partialRefundHours} hours before. No refund after that
            or once checked in.
          </p>
          {quote.refunds.map((r) => (
            <p key={r.id} className="mt-3 text-moss">
              {r.reason} · {formatVnd(r.amount)}
            </p>
          ))}
          {quote.percent > 0 ? (
            <div className="mt-4">
              <p>
                Refund available:{" "}
                <strong>
                  {formatVnd(quote.amount)} ({quote.percent}%)
                </strong>
              </p>
              {confirm ? (
                <div className="mt-3">
                  <p className="mb-3 text-sm">
                    This cancels every ticket in this booking and releases your
                    seats.
                  </p>
                  <button
                    className="btn-primary"
                    disabled={busy}
                    onClick={refund}
                  >
                    Confirm cancellation
                  </button>{" "}
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => setConfirm(false)}
                  >
                    Keep tickets
                  </button>
                </div>
              ) : (
                <button
                  className="btn-secondary mt-3"
                  onClick={() => setConfirm(true)}
                >
                  Cancel booking
                </button>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate">
              No customer refund is currently available.
            </p>
          )}
        </>
      )}
    </section>
  );
}

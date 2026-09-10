"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BookingDetails, SeatHold } from "@ticket-booking/contracts";
import {
  completeFakePayment,
  createBooking,
  createPayment,
  formatVnd,
} from "@/lib/api";

export function CheckoutPanel({ hold }: { hold: SeatHold }) {
  const router = useRouter();
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(
    0,
    Math.floor((new Date(hold.expiresAt).getTime() - now) / 1000),
  );
  const expired = remaining === 0 || hold.status !== "ACTIVE";
  function checkout(pay: boolean) {
    setError("");
    startTransition(async () => {
      try {
        if (expired)
          throw new Error("This reservation expired. Please pick seats again.");
        const next =
          booking ??
          (await createBooking(hold.id, promoCode.trim() || undefined));
        setBooking(next);
        if (pay) {
          const payment = await createPayment(next.id);
          const result = await completeFakePayment(payment.providerPaymentId);
          if (result.booking?.status !== "PAID")
            throw new Error("Payment did not complete.");
          router.push(`/bookings/${result.booking.id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Checkout failed.");
      }
    });
  }
  const fee = booking?.serviceFee ?? Math.round(hold.total * 0.1);
  return (
    <main className="app-container grid gap-6 py-6 lg:grid-cols-[1fr_380px]">
      <section>
        <p className="eyebrow">Checkout</p>
        <h1 className="mt-2 text-3xl font-bold">Complete your booking</h1>
        <div className="glass-panel mt-6 rounded-2xl p-5">
          <div className="flex justify-between text-gold">
            <span>
              {expired ? "Reservation expired" : "Complete checkout within"}
            </span>
            <strong className="mono-data">
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:
              {String(remaining % 60).padStart(2, "0")}
            </strong>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-gold"
              style={{ width: `${Math.min(100, remaining / 3)}%` }}
            />
          </div>
          <div className="mt-6 grid gap-3">
            {hold.seats.map((seat) => (
              <div
                className="flex justify-between rounded-xl bg-white/5 p-3"
                key={seat.id}
              >
                <span>Seat {seat.label}</span>
                <strong className="text-moss">{formatVnd(seat.price)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel mt-4 rounded-2xl p-5">
          <label htmlFor="promo-code">Promo code</label>
          <div className="mt-2 flex gap-2">
            <input
              id="promo-code"
              className="field-shell min-w-0 flex-1"
              value={promoCode}
              disabled={!!booking || busy}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="Enter code"
            />
            <button
              className="btn-secondary"
              disabled={!!booking || busy || expired || !promoCode.trim()}
              onClick={() => checkout(false)}
            >
              Apply code
            </button>
          </div>
          <p className="mt-2 text-xs text-slate">
            Applying a code confirms the checkout total for this reservation.
          </p>
        </div>
        {booking && (
          <p className="mt-4 text-sm text-moss">
            Booking {booking.bookingNumber} is ready for payment.
          </p>
        )}
        {error && (
          <p
            className="mt-4 rounded-xl border border-danger/30 p-4 text-red-200"
            role="alert"
          >
            {error}
          </p>
        )}
        <Link
          className="btn-secondary mt-5"
          href={`/booking/${hold.sessionId}`}
        >
          Back to seats
        </Link>
      </section>
      <aside className="glass-panel-strong h-fit rounded-2xl p-5 lg:sticky lg:top-24">
        <p className="eyebrow">Checkout summary</p>
        <h2 className="mt-2 text-xl font-bold">Your order</h2>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <dt>Subtotal</dt>
          <dd className="text-right">{formatVnd(hold.total)}</dd>
          <dt>Service fee</dt>
          <dd className="text-right">{formatVnd(fee)}</dd>
          {!!booking?.discount && (
            <>
              <dt>Promotion</dt>
              <dd className="text-right text-moss">
                −{formatVnd(booking.discount)}
              </dd>
            </>
          )}
          <dt className="border-t border-white/10 pt-3 font-bold">Total</dt>
          <dd className="border-t border-white/10 pt-3 text-right text-xl font-bold text-moss">
            {formatVnd(booking?.total ?? hold.total + fee)}
          </dd>
        </dl>
        <button
          className="btn-primary mt-6 w-full"
          disabled={busy || expired}
          onClick={() => checkout(true)}
        >
          {busy ? "Processing…" : "Pay with demo provider"}
        </button>
        <p className="mt-3 text-xs text-slate">
          Demo checkout. No real money is charged. Reserved seat prices stay
          fixed until your hold expires.
        </p>
      </aside>
    </main>
  );
}

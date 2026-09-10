"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountNotifications } from "@/components/account-notifications";
import { CalendarDays, Loader2, Ticket, X } from "lucide-react";
import { formatVnd, listBookings, type BookingDetails } from "@/lib/api";

export default function AccountBookingsPage() {
  const [bookings, setBookings] = useState<BookingDetails[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadBookings() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await listBookings();

        if (!cancelled) {
          setBookings(result.data);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load bookings.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadBookings();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app-container max-w-5xl py-8">
      <p className="eyebrow mb-2">Account</p>
      <h1 className="text-3xl font-bold">Booking history</h1>
      <AccountNotifications />

      <section className="mt-6 grid gap-4">
        {isLoading ? (
          <div className="glass-panel flex items-center rounded-2xl p-5 text-sm font-semibold text-slate">
            <Loader2
              className="mr-2 animate-spin"
              size={18}
              aria-hidden="true"
            />
            Loading bookings
          </div>
        ) : error ? (
          <div className="flex gap-2 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-red-200">
            <X className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
            {error}
          </div>
        ) : bookings.length === 0 ? (
          <div className="glass-panel rounded-2xl p-5 text-sm text-slate">
            No bookings yet.
          </div>
        ) : (
          bookings.map((booking) => (
            <article className="glass-panel rounded-2xl p-5" key={booking.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">{booking.eventTitle}</h2>
                  <p className="mt-2 flex items-center gap-2 text-sm text-slate">
                    <CalendarDays
                      size={16}
                      className="text-gold"
                      aria-hidden="true"
                    />
                    {new Date(booking.startAt).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                  <p className="mono-data mt-2 text-sm text-slate">
                    Seats {booking.seats.map((seat) => seat.label).join(", ")}
                  </p>
                </div>
                <div className="text-right">
                  <span className="mono-data rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-ink">
                    {booking.status}
                  </span>
                  <p className="mt-3 text-sm font-semibold text-moss">
                    {formatVnd(booking.total)}
                  </p>
                </div>
              </div>
              <Link
                className="btn-primary mt-4 min-h-10 px-3"
                href={`/bookings/${booking.id}`}
              >
                <Ticket size={16} aria-hidden="true" />
                View tickets
              </Link>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, History, Loader2, Ticket, X } from "lucide-react";
import { RefundPanel } from "@/components/refund-panel";
import { TicketCard } from "@/components/ticket-card";
import {
  formatVnd,
  getBooking,
  getBookingTickets,
  type BookingDetails,
  type TicketDetails,
} from "@/lib/api";

export default function BookingDetailsPage() {
  const params = useParams<{ bookingId: string }>();
  const bookingId = params.bookingId;
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [tickets, setTickets] = useState<TicketDetails[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadBooking() {
      setIsLoading(true);
      setError(null);

      try {
        const [nextBooking, nextTickets] = await Promise.all([
          getBooking(bookingId),
          getBookingTickets(bookingId),
        ]);

        if (!cancelled) {
          setBooking(nextBooking);
          setTickets(nextTickets);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load booking.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadBooking();

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (isLoading) {
    return (
      <main className="app-container flex min-h-[50vh] items-center py-8 text-sm font-semibold text-slate">
        <Loader2 className="mr-2 animate-spin" size={18} aria-hidden="true" />
        Loading booking
      </main>
    );
  }

  if (error || !booking) {
    return (
      <main className="app-container py-8">
        <div className="flex gap-2 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-red-200">
          <X className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          {error ?? "Booking was not found for the current user."}
        </div>
        <Link className="btn-primary mt-5" href="/account/bookings">
          <History size={18} aria-hidden="true" />
          Booking history
        </Link>
      </main>
    );
  }

  return (
    <main className="app-container max-w-5xl py-8">
      <p className="eyebrow mb-2 flex items-center gap-2">
        <CheckCircle2 size={18} aria-hidden="true" />
        Booking {booking.status === "PAID" ? "confirmed" : booking.status}
      </p>
      <h1 className="text-3xl font-bold">{booking.eventTitle}</h1>
      <p className="mt-2 text-sm text-slate">
        {booking.venueName}, {booking.hallName} ·{" "}
        {new Date(booking.startAt).toLocaleString("en-US", {
          dateStyle: "full",
          timeStyle: "short",
        })}
      </p>

      <section className="mt-6 glass-panel rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-sm text-slate">Booking number</p>
            <strong className="mono-data">{booking.bookingNumber}</strong>
          </div>
          <div className="mono-data rounded-lg border border-moss/25 bg-moss/10 px-3 py-2 text-sm font-semibold text-moss">
            {booking.status}
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {booking.seats.map((seat) => (
            <div
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
              key={seat.id}
            >
              <span className="flex items-center gap-2">
                <Ticket size={16} className="text-coral" aria-hidden="true" />
                Seat {seat.label}
              </span>
              <strong className="text-moss">{formatVnd(seat.price)}</strong>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-white/10 pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate">Subtotal</span>
            <strong>{formatVnd(booking.subtotal)}</strong>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-slate">Service fee</span>
            <strong>{formatVnd(booking.serviceFee)}</strong>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
            <span className="font-semibold">Total</span>
            <strong className="mono-data text-lg text-moss">
              {formatVnd(booking.total)}
            </strong>
          </div>
        </div>
      </section>

      {tickets.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-xl font-bold">Tickets</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </section>
      ) : null}

      <Link className="btn-secondary mt-5" href="/account/bookings">
        <History size={18} aria-hidden="true" />
        Booking history
      </Link>
      <RefundPanel bookingId={bookingId} />
    </main>
  );
}

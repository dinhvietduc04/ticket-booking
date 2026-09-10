"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { operations } from "@/lib/operations";
export function AccountNotifications() {
  const [rows, setRows] = useState<
    { id: string; bookingId: string; message: string; createdAt: string }[]
  >([]);
  useEffect(() => {
    if (!window.localStorage.getItem("seatly.accessToken")) return;
    let active = true;
    const load = () =>
      operations<typeof rows>("/account/notifications")
        .then((r) => {
          if (active) setRows(r);
        })
        .catch(() => {});
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (!rows.length) return null;
  return (
    <section className="glass-panel mt-6 rounded-2xl p-5">
      <h2 className="text-lg font-bold">Booking updates</h2>
      <div className="mt-3 grid gap-3">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/bookings/${row.bookingId}`}
            className="rounded-lg bg-white/5 p-3 text-sm"
          >
            <p>{row.message}</p>
            <p className="mt-1 text-xs text-slate">
              {new Date(row.createdAt).toLocaleString()}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

"use client";

import { QRCodeSVG } from "qrcode.react";
import type { TicketDetails } from "@/lib/api";

export function TicketCard({ ticket }: { ticket: TicketDetails }) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/10 bg-panel/90 p-4 shadow-soft">
      <div className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-paper" />
      <div className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-paper" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mono-data text-xs text-slate">{ticket.ticketNumber}</p>
          <h3 className="mt-1 text-lg font-bold">Seat {ticket.seatLabel}</h3>
        </div>
        <span className="mono-data rounded-lg border border-moss/25 bg-moss/10 px-2 py-1 text-xs font-semibold text-moss">
          {ticket.status}
        </span>
      </div>
      <div className="my-4 border-t border-dashed border-white/15" />
      <div className="inline-flex rounded-xl border border-white/10 bg-white p-3">
        <QRCodeSVG
          bgColor="#ffffff"
          fgColor="#0b1326"
          level="M"
          marginSize={1}
          size={160}
          value={ticket.qrCode}
        />
      </div>
      <p className="mono-data mt-3 break-all rounded-xl border border-white/10 bg-midnight px-3 py-2 text-xs text-slate">
        {ticket.qrCode}
      </p>
    </article>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Loader2, Radio, ShieldCheck, Timer, X } from "lucide-react";
import Link from "next/link";
import { io } from "socket.io-client";
import type {
  SessionSeatMap,
  SessionSeatStatus,
} from "@ticket-booking/contracts";
import {
  createHold,
  formatVnd,
  getSocketUrl,
  getSeatMap,
  parseSeatStatusChanged,
} from "@/lib/api";

type HoldResult = Awaited<ReturnType<typeof createHold>>;
type Seat = SessionSeatMap["seats"][number];

const statusClass: Record<SessionSeatStatus, string> = {
  AVAILABLE:
    "border-moss/35 bg-moss/15 text-moss hover:bg-moss hover:text-white hover:shadow-[0_0_12px_rgba(16,185,129,0.45)]",
  HELD: "border-gold/40 bg-gold/15 text-gold",
  BOOKED: "border-white/10 bg-slate/20 text-slate/60",
  BLOCKED: "border-white/5 bg-white/5 text-slate/35",
};

export function SeatPicker({
  seatMap,
  admissionToken,
}: {
  seatMap: SessionSeatMap;
  admissionToken?: string;
}) {
  const [seats, setSeats] = useState(seatMap.seats);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hold, setHold] = useState<HoldResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "off">(
    "connecting",
  );
  const [isPending, startTransition] = useTransition();
  const currentHoldSeatIds = useMemo(
    () => new Set(hold?.seats.map((seat) => seat.id) ?? []),
    [hold],
  );
  const currentHoldSeatIdsRef = useRef(currentHoldSeatIds);

  useEffect(() => {
    currentHoldSeatIdsRef.current = currentHoldSeatIds;
  }, [currentHoldSeatIds]);

  useEffect(() => {
    setSeats(seatMap.seats);
    setSelectedIds([]);
    setHold(null);
  }, [seatMap.sessionId, seatMap.seats]);

  useEffect(() => {
    const socket = io(`${getSocketUrl()}/sessions`, {
      transports: ["websocket"],
      withCredentials: true,
    });

    const refreshPrices = () => {
      void getSeatMap(seatMap.sessionId)
        .then((fresh) =>
          setSeats((current) =>
            current.map((seat) => {
              const next = fresh.seats.find((s) => s.id === seat.id);
              return next && !currentHoldSeatIdsRef.current.has(seat.seatId)
                ? next
                : seat;
            }),
          ),
        )
        .catch(() => {});
    };
    const priceTimer = setInterval(refreshPrices, 15000);
    socket.on("connect", () => {
      refreshPrices();
      setLiveStatus("live");
      socket.emit("session.join", { sessionId: seatMap.sessionId });
    });
    socket.on("connect_error", () => setLiveStatus("off"));
    socket.on("disconnect", () => setLiveStatus("off"));
    socket.on("seat.status.changed", (payload: unknown) => {
      const parsed = parseSeatStatusChanged(payload);

      if (!parsed.success || parsed.data.sessionId !== seatMap.sessionId) {
        return;
      }

      const updatesBySessionSeatId = new Map(
        parsed.data.seats.map((seat) => [seat.sessionSeatId, seat]),
      );
      const unavailableSeatIds = new Set(
        parsed.data.seats
          .filter(
            (seat) =>
              seat.status !== "AVAILABLE" &&
              !currentHoldSeatIdsRef.current.has(seat.seatId),
          )
          .map((seat) => seat.seatId),
      );

      setSeats((currentSeats) =>
        currentSeats.map((seat) => {
          const update = updatesBySessionSeatId.get(seat.id);

          return update && update.version >= seat.version
            ? { ...seat, status: update.status, version: update.version }
            : seat;
        }),
      );
      setSelectedIds((currentIds) =>
        currentIds.filter((seatId) => !unavailableSeatIds.has(seatId)),
      );
    });

    return () => {
      socket.emit("session.leave", { sessionId: seatMap.sessionId });
      socket.disconnect();
      clearInterval(priceTimer);
    };
  }, [seatMap.sessionId]);

  const selectedSeats = useMemo(
    () => seats.filter((seat) => selectedIds.includes(seat.seatId)),
    [seats, selectedIds],
  );
  const hasUnheldSelection = selectedIds.some(
    (seatId) => !currentHoldSeatIds.has(seatId),
  );
  const total = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);

  function toggleSeat(seatId: string) {
    setError(null);
    setSelectedIds((current) =>
      current.includes(seatId)
        ? current.filter((id) => id !== seatId)
        : current.length >= 8
          ? current
          : [...current, seatId],
    );
  }

  function holdSeats() {
    setError(null);
    startTransition(async () => {
      try {
        const nextHold = await createHold(
          seatMap.sessionId,
          selectedIds,
          admissionToken,
        );
        const heldSeatIds = new Set(nextHold.seats.map((seat) => seat.id));

        setHold(nextHold);
        setSelectedIds(nextHold.seats.map((seat) => seat.id));
        setSeats((currentSeats) =>
          currentSeats.map((seat) =>
            heldSeatIds.has(seat.seatId)
              ? {
                  ...seat,
                  status: "HELD",
                  price: nextHold.seats.find((s) => s.id === seat.seatId)!
                    .price,
                }
              : seat,
          ),
        );
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Unable to hold seats.",
        );
      }
    });
  }

  return (
    <main className="app-container grid gap-6 py-6 lg:grid-cols-[1fr_380px]">
      <section className="min-w-0">
        <div className="mb-5 glass-panel rounded-2xl p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Seat selection</p>
            <span className="mono-data inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate">
              <Radio
                size={14}
                className={liveStatus === "live" ? "text-moss" : "text-gold"}
                aria-hidden="true"
              />
              <span
                className={[
                  "size-2 rounded-full",
                  liveStatus === "live" ? "bg-moss" : "bg-gold",
                ].join(" ")}
              />
              {liveStatus === "live" ? "Live updates" : "Reconnecting"}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-ink">{seatMap.eventTitle}</h1>
          <p className="mt-2 text-sm text-slate">
            {seatMap.venueName}, {seatMap.hallName} ·{" "}
            {new Date(seatMap.startAt).toLocaleString("en-US", {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-4 sm:p-6">
          <div className="mx-auto mb-8 max-w-2xl">
            <div className="h-14 rounded-b-[48px] border border-coral/30 bg-[linear-gradient(180deg,rgba(99,102,241,0.35),rgba(255,255,255,0.04))] text-center text-sm font-bold leading-[3.5rem] text-ink shadow-glow">
              STAGE
            </div>
            <p className="mono-data mt-2 text-center text-[11px] uppercase text-slate">
              Acoustic shell view
            </p>
          </div>

          <div className="overflow-x-auto pb-2">
            <div
              className="relative mx-auto"
              style={{
                width: Math.max(620, ...seats.map((s) => s.x + 52)),
                height: Math.max(300, ...seats.map((s) => s.y + 52)),
              }}
            >
              {seats.map((seat) => (
                <button
                  key={seat.id}
                  type="button"
                  aria-label={`Seat ${seat.label}, ${seat.status.toLowerCase()}`}
                  aria-pressed={selectedIds.includes(seat.seatId)}
                  className={`mono-data absolute grid h-10 w-10 place-items-center rounded-lg border text-xs font-semibold transition focus:outline-none focus:shadow-focus disabled:cursor-not-allowed ${selectedIds.includes(seat.seatId) ? "border-coral bg-coral text-white shadow-glow" : statusClass[seat.status]}`}
                  style={{ left: seat.x, top: seat.y }}
                  disabled={
                    isPending ||
                    seat.status !== "AVAILABLE" ||
                    currentHoldSeatIds.has(seat.seatId)
                  }
                  onClick={() => toggleSeat(seat.seatId)}
                  title={`${seat.label} · ${formatVnd(seat.price)} · ${seat.status}`}
                >
                  {seat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3 text-xs text-slate">
            <Legend color="bg-moss" label="Available" />
            <Legend color="bg-coral" label="Selected" />
            <Legend color="bg-gold" label="Held" />
            <Legend color="bg-ink/75" label="Booked" />
          </div>
        </div>
      </section>

      <aside className="glass-panel-strong h-fit rounded-2xl p-5 lg:sticky lg:top-24">
        <p className="eyebrow">Reservation cart</p>
        <h2 className="mt-2 text-xl font-bold">Your Seats</h2>
        <div className="mt-4 grid gap-3">
          {selectedSeats.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate">
              Select up to 8 available seats.
            </p>
          ) : (
            selectedSeats.map((seat) => (
              <div
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3 text-sm"
                key={seat.id}
              >
                <span className="mono-data text-slate">{seat.label}</span>
                <strong className="text-moss">{formatVnd(seat.price)}</strong>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate">Subtotal</span>
            <strong className="mono-data text-lg">{formatVnd(total)}</strong>
          </div>
          <button
            className="btn-primary mt-4 w-full"
            disabled={
              selectedIds.length === 0 ||
              isPending ||
              (Boolean(hold) && !hasUnheldSelection)
            }
            onClick={holdSeats}
            type="button"
          >
            {isPending ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Check size={18} />
            )}
            {hold ? "Update Hold" : "Hold Seats"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 flex gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
            <X className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
            {error}
          </div>
        ) : null}

        {hold ? (
          <div className="mt-4 rounded-xl border border-moss/25 bg-moss/10 p-3 text-sm text-moss">
            <p className="flex items-center gap-2 font-semibold">
              <Timer size={16} aria-hidden="true" />
              Hold confirmed
            </p>
            <p className="mt-2">
              Expires at{" "}
              {new Date(hold.expiresAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <Link
              aria-disabled={hasUnheldSelection}
              className={[
                "mt-3 flex min-h-10 items-center justify-center rounded-lg px-3 font-semibold text-white transition",
                hasUnheldSelection
                  ? "pointer-events-none bg-moss/45"
                  : "bg-moss hover:bg-coral",
              ].join(" ")}
              href={`/checkout/${hold.holdId}`}
            >
              Continue to checkout
            </Link>
            {hasUnheldSelection ? (
              <p className="mt-2 text-xs text-moss/80">
                Update the hold to include your newly selected seats.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-white/10 bg-midnight/70 p-3 text-xs leading-5 text-slate">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <ShieldCheck size={16} className="text-moss" aria-hidden="true" />
            Official primary inventory
          </p>
          <p className="mt-1">
            Seats are locked only after a hold is confirmed.
          </p>
        </div>
      </aside>
    </main>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`size-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

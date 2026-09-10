"use client";
import { useRef, useState } from "react";
import type { Hall } from "@/lib/operations";
import { operations } from "@/lib/operations";

export function VenueDesigner({
  hall,
  saved,
}: {
  hall: Hall;
  saved: () => void;
}) {
  const [seats, setSeats] = useState(hall.seats);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(6),
    [columns, setColumns] = useState(10);
  const drag = useRef<number | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const seat = seats[selected];
  const width = Math.max(720, ...seats.map((s) => s.x + 60));
  const height = Math.max(440, ...seats.map((s) => s.y + 60));
  function move(index: number, x: number, y: number) {
    setSeats((current) =>
      current.map((s, i) =>
        i === index
          ? {
              ...s,
              x: Math.max(0, Math.min(2000, Math.round(x / 10) * 10)),
              y: Math.max(0, Math.min(2000, Math.round(y / 10) * 10)),
            }
          : s,
      ),
    );
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await operations(`/organizer/halls/${hall.id}/layout`, "POST", { seats });
      setMessage("Layout saved.");
      saved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="glass-panel min-w-0 rounded-2xl p-5">
      <h2 className="text-xl font-bold">{hall.name}</h2>
      <p className="mt-2 text-sm text-slate">
        Drag seats to position them, or select a seat and use arrow keys.
        Coordinates snap to a 10-unit grid.
      </p>
      {!!hall._count.sessions && (
        <p className="mt-2 text-sm text-gold">
          This hall has scheduled sessions. Seat positions can change; its seat
          structure is locked.
        </p>
      )}
      {!hall._count.sessions && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Rows
            <input
              className="field-shell mt-1 w-24"
              type="number"
              min="1"
              max="26"
              value={rows}
              onChange={(e) => setRows(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Seats per row
            <input
              className="field-shell mt-1 w-28"
              type="number"
              min="1"
              max="40"
              value={columns}
              onChange={(e) => setColumns(Number(e.target.value))}
            />
          </label>
          <button
            className="btn-secondary"
            disabled={rows < 1 || rows > 26 || columns < 1 || columns > 40}
            onClick={() => {
              setSeats(
                Array.from({ length: rows * columns }, (_, i) => ({
                  row: String.fromCharCode(65 + Math.floor(i / columns)),
                  number: (i % columns) + 1,
                  x: 40 + (i % columns) * 45,
                  y: 40 + Math.floor(i / columns) * 45,
                  section: "MAIN",
                  type: "STANDARD",
                })),
              );
              setSelected(0);
            }}
          >
            Generate grid
          </button>
          <button
            className="btn-secondary"
            disabled={!seat}
            onClick={() => {
              setSeats((s) => s.filter((_, i) => i !== selected));
              setSelected(0);
            }}
          >
            Remove selected
          </button>
        </div>
      )}
      <div
        className="mt-5 overflow-auto rounded-xl border border-white/10 bg-midnight"
        style={{ maxHeight: 560 }}
      >
        <div
          ref={canvas}
          className="relative"
          style={{
            width,
            height,
            backgroundImage: "radial-gradient(#334155 1px, transparent 1px)",
            backgroundSize: "10px 10px",
          }}
          onPointerMove={(e) => {
            if (drag.current === null || !canvas.current) return;
            const box = canvas.current.getBoundingClientRect();
            move(
              drag.current,
              e.clientX - box.left - 18,
              e.clientY - box.top - 18,
            );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {seats.map((s, i) => (
            <button
              key={s.id ?? `${s.row}-${s.number}`}
              aria-label={`Seat ${s.row}${s.number}`}
              aria-pressed={selected === i}
              className={`absolute h-9 w-9 touch-none rounded-lg border text-xs font-bold ${selected === i ? "border-white bg-coral text-white" : "border-moss/40 bg-moss/15 text-moss"}`}
              style={{ left: s.x, top: s.y }}
              onPointerDown={(e) => {
                setSelected(i);
                drag.current = i;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => {
                const deltas: Record<string, [number, number]> = {
                  ArrowLeft: [-10, 0],
                  ArrowRight: [10, 0],
                  ArrowUp: [0, -10],
                  ArrowDown: [0, 10],
                };
                const delta = deltas[e.key];
                if (delta) {
                  e.preventDefault();
                  move(i, s.x + delta[0], s.y + delta[1]);
                }
              }}
            >
              {s.row}
              {s.number}
            </button>
          ))}
        </div>
      </div>
      {seat && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <strong className="pb-3">
            Seat {seat.row}
            {seat.number}
          </strong>
          {(["x", "y"] as const).map((axis) => (
            <label key={axis} className="text-sm">
              {axis.toUpperCase()}
              <input
                aria-label={`Seat ${axis.toUpperCase()}`}
                className="field-shell mt-1 w-24"
                type="number"
                min="0"
                max="2000"
                step="10"
                value={seat[axis]}
                onChange={(e) =>
                  move(
                    selected,
                    axis === "x" ? Number(e.target.value) : seat.x,
                    axis === "y" ? Number(e.target.value) : seat.y,
                  )
                }
              />
            </label>
          ))}
          <label className="text-sm">
            Seat type
            <select
              className="field-shell mt-1"
              disabled={!!hall._count.sessions}
              value={seat.type}
              onChange={(e) =>
                setSeats((s) =>
                  s.map((v, i) =>
                    i === selected
                      ? { ...v, type: e.target.value as typeof v.type }
                      : v,
                  ),
                )
              }
            >
              {["STANDARD", "VIP", "PREMIUM", "COUPLE", "ACCESSIBLE"].map(
                (t) => (
                  <option key={t}>{t}</option>
                ),
              )}
            </select>
          </label>
        </div>
      )}
      <div className="mt-5 flex items-center gap-4">
        <button
          className="btn-primary"
          disabled={busy || seats.length === 0}
          onClick={save}
        >
          {busy ? "Saving…" : "Save layout"}
        </button>
        <span role="status" className="text-sm">
          {message}
        </span>
      </div>
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { SessionSeatMap } from "@ticket-booking/contracts";
import { operations, type Admission } from "@/lib/operations";
import { getSeatMap } from "@/lib/api";
import { SeatPicker } from "./seat-picker";

export function WaitingRoom({ seatMap }: { seatMap: SessionSeatMap }) {
  const [admission, setAdmission] = useState<Admission | null>(null);
  const [map, setMap] = useState(seatMap);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    operations<{ enabled: boolean }>(
      `/sessions/${seatMap.sessionId}/waiting-room`,
    )
      .then((s) => {
        if (active && !s.enabled)
          setAdmission({
            status: "DISABLED",
            position: 0,
            admissionToken: null,
            admittedUntil: null,
          });
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [seatMap.sessionId]);
  useEffect(() => {
    if (!joined) return;
    let active = true;
    let busy = false;
    let lastToken: string | null = null;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const next = await operations<Admission>(
          `/sessions/${seatMap.sessionId}/waiting-room`,
          "POST",
          {},
        );
        if (active) {
          setAdmission(next);
          setError("");
        }
        if (next.status === "ADMITTED" && next.admissionToken !== lastToken) {
          lastToken = next.admissionToken;
          const fresh = await getSeatMap(seatMap.sessionId);
          if (active) setMap(fresh);
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to join.");
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [joined, seatMap.sessionId]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const admitted =
    admission?.status === "ADMITTED" &&
    new Date(admission.admittedUntil!).getTime() > now;
  if (admission?.status === "DISABLED" || admitted)
    return (
      <SeatPicker
        seatMap={map}
        admissionToken={admission?.admissionToken ?? undefined}
      />
    );
  return (
    <main className="app-container max-w-2xl py-12">
      <section className="glass-panel rounded-2xl p-8 text-center">
        <p className="eyebrow">Waiting room</p>
        <h1 className="mt-3 text-3xl font-bold">{seatMap.eventTitle}</h1>
        <p className="mt-4 text-slate">
          Admission is first come, first served. Your place is tied to your
          account. Keep this page open for updates.
        </p>
        {admission?.status === "WAITING" && (
          <p className="my-8 text-5xl font-bold text-moss" aria-live="polite">
            #{admission.position}
            <span className="mt-2 block text-sm text-slate">in the queue</span>
          </p>
        )}
        {error && (
          <p className="my-4 text-red-200" role="alert">
            {error}{" "}
            <Link className="underline" href="/login">
              Log in
            </Link>
          </p>
        )}
        <button
          className="btn-primary mt-6"
          disabled={joined && !error}
          onClick={() => {
            setJoined(false);
            setTimeout(() => setJoined(true), 0);
          }}
        >
          {joined ? "Waiting for admission…" : "Join waiting room"}
        </button>
        <p className="mt-4 text-sm text-slate">
          Admission gives you time to choose seats; availability is confirmed
          when you reserve.
        </p>
      </section>
    </main>
  );
}

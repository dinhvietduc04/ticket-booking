"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function BookingError({ reset }: { reset: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }
  return (
    <main className="app-container max-w-2xl py-12">
      <section className="glass-panel rounded-2xl p-6" role="alert">
        <p className="eyebrow">Seat selection</p>
        <h1 className="mt-3 text-2xl font-bold">
          We couldn’t load this seat map
        </h1>
        <p className="mt-3 text-slate">
          Please try again in a moment. If the problem continues, return to the
          event list.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="btn-primary" onClick={retry} disabled={pending}>
            {pending ? "Retrying…" : "Try again"}
          </button>
          <Link className="btn-secondary" href="/events">
            Back to events
          </Link>
        </div>
      </section>
    </main>
  );
}

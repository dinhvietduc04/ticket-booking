import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  MapPin,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { formatVnd, getEvent } from "@/lib/api";

export default async function EventDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEvent(slug);

  return (
    <main>
      <section className="relative overflow-hidden border-b border-white/10 bg-midnight text-ink">
        {event.bannerUrl ? (
          <Image
            alt=""
            className="object-cover opacity-60"
            fill
            priority
            sizes="100vw"
            src={event.bannerUrl}
          />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,14,32,0.96),rgba(6,14,32,0.72),rgba(6,14,32,0.28))]" />
        <div className="relative app-container grid min-h-[520px] items-end gap-6 py-10 lg:grid-cols-[1fr_380px]">
          <div>
            <span className="eyebrow rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-gold">
              {event.category}
            </span>
            <h1 className="mt-5 max-w-4xl text-4xl font-extrabold leading-tight md:text-6xl">
              {event.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate">
              {event.description ?? "Session details and seats are now live."}
            </p>
          </div>
          <aside className="glass-panel-strong rounded-2xl p-5">
            <p className="eyebrow">Event control</p>
            <div className="mt-4 grid gap-3 text-sm">
              <Fact
                icon={<Ticket size={17} aria-hidden="true" />}
                label="Sessions"
                value={String(event.sessions.length)}
              />
              <Fact
                icon={<ShieldCheck size={17} aria-hidden="true" />}
                label="Status"
                value="Published"
              />
              <Fact
                icon={<MapPin size={17} aria-hidden="true" />}
                label="Organizer"
                value={event.organization.name}
              />
            </div>
          </aside>
        </div>
      </section>

      <section className="app-container grid gap-6 py-8 lg:grid-cols-[1fr_360px]">
        <div>
          <p className="eyebrow">Choose performance</p>
          <h2 className="mt-2 text-2xl font-bold">Sessions</h2>
          <div className="grid gap-3">
            {event.sessions.map((session) => (
              <Link
                href={`/booking/${session.id}`}
                key={session.id}
                className="group mt-4 flex flex-col gap-4 rounded-xl border border-white/10 bg-panel/85 p-4 shadow-soft transition hover:border-coral/45 hover:bg-panelHigh/90 md:flex-row md:items-center md:justify-between"
              >
                <div className="grid gap-2">
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    <CalendarDays
                      size={17}
                      className="text-gold"
                      aria-hidden="true"
                    />
                    {new Date(session.startAt).toLocaleString("en-US", {
                      dateStyle: "full",
                      timeStyle: "short",
                    })}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-slate">
                    <MapPin
                      size={16}
                      className="text-coral"
                      aria-hidden="true"
                    />
                    {session.venueName}, {session.hallName}, {session.city}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-6">
                  <div className="text-right text-sm">
                    <p className="font-semibold text-moss">
                      {session.minPrice
                        ? formatVnd(session.minPrice)
                        : "Sold out"}
                    </p>
                    <p className="mono-data text-xs text-slate">
                      {session.availableSeatCount} available
                    </p>
                  </div>
                  <span className="grid size-10 place-items-center rounded-lg bg-coral text-white transition group-hover:shadow-glow">
                    <ArrowRight size={18} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <aside className="glass-panel-strong h-fit rounded-2xl p-5 lg:sticky lg:top-24">
          <h2 className="text-lg font-bold">Venue briefing</h2>
          <p className="mt-2 text-sm leading-6 text-slate">
            Pick a session, then reserve exact seats from the live availability
            map before checkout.
          </p>
          <div className="mt-5 grid gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="flex items-center gap-2 text-slate">
                <Clock size={16} className="text-gold" aria-hidden="true" />
                Reservation window
              </p>
              <strong className="mt-1 block">10 minutes</strong>
            </div>
            <div className="rounded-xl border border-moss/25 bg-moss/10 p-3 text-moss">
              <p className="font-semibold">Authentic inventory</p>
              <p className="mt-1 text-xs text-moss/80">
                Availability refreshes while seats are being selected.
              </p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <span className="grid size-9 place-items-center rounded-lg bg-coral/15 text-coral">
        {icon}
      </span>
      <span>
        <span className="block text-xs text-slate">{label}</span>
        <strong className="block text-ink">{value}</strong>
      </span>
    </div>
  );
}

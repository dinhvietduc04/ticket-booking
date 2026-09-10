import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Filter,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { formatVnd, listEvents } from "@/lib/api";
import type { EventSummary } from "@ticket-booking/contracts";

export default async function EventsPage() {
  let events: EventSummary[] = [];
  let error: string | null = null;

  try {
    events = (await listEvents()).data;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to load events.";
  }

  const featuredEvent = events[0];
  const catalogEvents = events.slice(featuredEvent ? 1 : 0);

  return (
    <main className="app-container py-6">
      <section className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-midnight shadow-soft">
          {featuredEvent?.posterUrl ? (
            <Image
              alt=""
              className="object-cover opacity-70"
              fill
              priority
              sizes="(min-width: 1024px) 760px, 100vw"
              src={featuredEvent.posterUrl}
            />
          ) : null}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,14,32,0.94),rgba(6,14,32,0.62),rgba(6,14,32,0.2))]" />
          <div className="relative flex min-h-[360px] flex-col justify-between p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow rounded-full border border-moss/30 bg-moss/10 px-3 py-1.5">
                Live inventory
              </span>
              <span className="mono-data rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-slate">
                Seat sync active
              </span>
            </div>
            <div className="max-w-2xl">
              <p className="mb-3 text-sm font-semibold text-gold">
                Featured release
              </p>
              <h1 className="text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
                {featuredEvent?.title ?? "Find your next seat"}
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate sm:text-base">
                {featuredEvent?.description ??
                  "Browse live events, compare venues, and reserve seats with a checkout flow built for high-demand drops."}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {featuredEvent ? (
                  <Link
                    className="btn-primary"
                    href={`/events/${featuredEvent.slug}`}
                  >
                    Inspect event
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                ) : null}
                <span className="inline-flex items-center gap-2 text-sm text-slate">
                  <ShieldCheck size={17} className="text-moss" />
                  Verified ticket inventory
                </span>
              </div>
            </div>
          </div>
        </div>

        <aside className="glass-panel-strong rounded-2xl p-5">
          <p className="eyebrow">Tonight's signal</p>
          <h2 className="mt-3 text-2xl font-bold">High-confidence booking</h2>
          <div className="mt-6 grid gap-3">
            <SignalRow label="Events online" value={String(events.length)} />
            <SignalRow
              label="Next session"
              value={
                featuredEvent?.nextSessionAt
                  ? new Date(featuredEvent.nextSessionAt).toLocaleTimeString(
                      "en-US",
                      { hour: "2-digit", minute: "2-digit" },
                    )
                  : "Soon"
              }
            />
            <SignalRow
              label="Entry from"
              value={
                featuredEvent?.minPrice
                  ? formatVnd(featuredEvent.minPrice)
                  : "TBA"
              }
            />
          </div>
          <div className="mt-6 rounded-xl border border-moss/25 bg-moss/10 p-4 text-sm text-moss">
            <Sparkles size={18} className="mb-2" aria-hidden="true" />
            Live holds protect selected seats through checkout.
          </div>
        </aside>
      </section>

      <section className="mt-5 glass-panel rounded-2xl p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <form className="field-shell">
            <Search size={18} className="text-slate" aria-hidden="true" />
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate"
              name="search"
              placeholder="Search artists, venues, cities..."
            />
          </form>
          <div className="flex flex-wrap gap-2">
            {["All", "Concerts", "Theater", "Sport", "Conference"].map(
              (label) => (
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-slate transition hover:border-coral/50 hover:text-ink"
                  key={label}
                  type="button"
                >
                  {label === "All" ? (
                    <Filter size={16} aria-hidden="true" />
                  ) : null}
                  {label}
                </button>
              ),
            )}
            <button className="btn-secondary min-h-10 px-3" type="button">
              <SlidersHorizontal size={16} aria-hidden="true" />
              Sort
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-5 rounded-xl border border-danger/35 bg-danger/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <div>
          <p className="eyebrow">Catalog</p>
          <h2 className="mt-2 text-2xl font-bold">Upcoming events</h2>
        </div>
        <p className="mono-data text-xs text-slate">{events.length} listed</p>
      </div>

      {events.length === 0 && !error ? (
        <div className="mt-4 glass-panel rounded-2xl p-6 text-sm text-slate">
          No events are live yet.
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(catalogEvents.length > 0 ? catalogEvents : events).map((event) => (
          <Link
            href={`/events/${event.slug}`}
            key={event.id}
            className="group overflow-hidden rounded-xl border border-white/10 bg-panel/85 shadow-soft transition hover:-translate-y-0.5 hover:border-coral/45 hover:shadow-glow"
          >
            <div className="relative aspect-[16/9] bg-midnight">
              {event.posterUrl ? (
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  sizes="(min-width: 1280px) 390px, (min-width: 768px) 50vw, 100vw"
                  src={event.posterUrl}
                />
              ) : null}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(6,14,32,0.84))]" />
              <span className="mono-data absolute left-3 top-3 rounded-full border border-moss/30 bg-moss/15 px-2.5 py-1 text-[11px] uppercase text-moss">
                {event.category}
              </span>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <div>
                <h3 className="text-lg font-bold leading-tight text-ink group-hover:text-[#c0c1ff]">
                  {event.title}
                </h3>
              </div>
              <div className="grid gap-2 text-sm text-slate">
                <span className="flex items-center gap-2">
                  <MapPin size={16} className="text-coral" aria-hidden="true" />
                  {event.venueName}, {event.city}
                </span>
                <span className="flex items-center gap-2">
                  <CalendarDays
                    size={16}
                    className="text-gold"
                    aria-hidden="true"
                  />
                  {event.nextSessionAt
                    ? new Date(event.nextSessionAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "Sessions coming soon"}
                </span>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-4 text-sm">
                <span className="text-slate">From</span>
                <strong className="text-moss">
                  {event.minPrice ? formatVnd(event.minPrice) : "TBA"}
                </strong>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-sm text-slate">{label}</span>
      <strong className="mono-data text-sm text-ink">{value}</strong>
    </div>
  );
}

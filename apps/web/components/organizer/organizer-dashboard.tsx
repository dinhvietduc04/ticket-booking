"use client";
import {
  useCallback,
  useEffect,
  useState,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { RefundPolicy, SessionSettings } from "@ticket-booking/contracts";
import {
  operations,
  type Analytics,
  type AuditPage,
  type Event,
  type Organization,
  type Overview,
} from "@/lib/operations";
import { formatVnd } from "@/lib/api";
import { VenueDesigner } from "./venue-designer";

const tabs = [
  "Analytics",
  "Events",
  "Promotions",
  "Team",
  "Venues",
  "Audit",
] as const;
type Tab = (typeof tabs)[number];
const field = "field-shell mt-1 w-full";
function Label({ name, children }: { name: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="text-sm text-slate">
      <label htmlFor={id}>{name}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass-panel min-w-0 rounded-2xl p-5">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
export function OrganizerDashboard() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [id, setId] = useState("");
  const [tab, setTab] = useState<Tab>("Analytics");
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    operations<Organization[]>("/organizer/organizations")
      .then((rows) => {
        setOrganizations(rows);
        setId(
          rows.find((o) => o.members[0]?.role !== "SCANNER")?.id ??
            rows[0]?.id ??
            "",
        );
      })
      .catch((e) => setMessage(e.message))
      .finally(() => setLoading(false));
  }, []);
  const refresh = useCallback(async () => {
    if (id)
      setData(await operations<Overview>(`/organizer/organizations/${id}`));
  }, [id]);
  const pendingRefunds = data?.events.some(
    (event) => event.cancellation?.status === "PENDING",
  );
  useEffect(() => {
    if (!pendingRefunds) return;
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [pendingRefunds, refresh]);
  useEffect(() => {
    let active = true;
    setData(null);
    if (
      id &&
      organizations.find((o) => o.id === id)?.members[0]?.role !== "SCANNER"
    )
      operations<Overview>(`/organizer/organizations/${id}`)
        .then((v) => {
          if (active) setData(v);
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    return () => {
      active = false;
    };
  }, [id, organizations]);
  async function mutate(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    setMessage("");
    try {
      await operations(path, method, body);
      await refresh();
      setMessage("Changes saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  const role =
    organizations.find((o) => o.id === id)?.members[0]?.role ?? "OWNER";
  const manager = ["OWNER", "ADMIN"].includes(role);
  return (
    <main className="app-container py-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">Organizer workspace</p>
          <h1 className="mt-2 text-3xl font-bold">Run your next great event</h1>
          <p className="mt-2 text-slate">
            Sales, people, and the details that make every seat count.
          </p>
        </div>
        {organizations.length > 0 && (
          <Label name="Organization">
            <select
              aria-label="Organization"
              className={field}
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                setMessage("");
                setTab("Analytics");
              }}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Label>
        )}
      </div>
      {message && (
        <div
          className="my-5 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm"
          role="status"
        >
          {message}
        </div>
      )}
      {loading ? (
        <p className="mt-8">Loading workspace…</p>
      ) : !organizations.length ? (
        <div className="glass-panel mt-8 rounded-2xl p-6">
          <p>
            Log in with an organizer account, or ask your organization owner to
            add your registered email.
          </p>
          <Link className="btn-primary mt-4" href="/login">
            Log in
          </Link>
        </div>
      ) : role === "SCANNER" ? (
        <Link className="btn-primary mt-8" href="/scanner">
          Open ticket scanner
        </Link>
      ) : (
        <>
          <nav
            aria-label="Organizer sections"
            className="my-7 flex flex-wrap gap-2 border-b border-white/10 pb-4"
          >
            {tabs
              .filter((t) => manager || ["Analytics", "Events"].includes(t))
              .map((t) => (
                <button
                  key={t}
                  aria-current={t === tab ? "page" : undefined}
                  className={t === tab ? "btn-primary" : "btn-secondary"}
                  onClick={() => {
                    setTab(t);
                    setMessage("");
                  }}
                >
                  {t}
                </button>
              ))}
          </nav>
          {!data ? (
            <p>Loading organization…</p>
          ) : (
            <div key={id}>
              {tab === "Analytics" && <AnalyticsPanel id={id} />}
              {tab === "Events" && (
                <div className="grid gap-5">
                  {data.events.length ? (
                    data.events.map((event) => (
                      <EventPanel
                        key={event.id + JSON.stringify(event.refundPolicy)}
                        event={event}
                        manager={manager}
                        busy={busy}
                        mutate={mutate}
                      />
                    ))
                  ) : (
                    <Panel title="Events">
                      <p>No events yet.</p>
                    </Panel>
                  )}
                </div>
              )}
              {tab === "Promotions" && (
                <Promotions id={id} data={data} busy={busy} mutate={mutate} />
              )}
              {tab === "Team" && (
                <Team
                  id={id}
                  data={data}
                  busy={busy}
                  mutate={mutate}
                  role={role}
                />
              )}
              {tab === "Venues" && (
                <Venues
                  data={data}
                  busy={busy}
                  mutate={mutate}
                  refresh={() => void refresh()}
                />
              )}
              {tab === "Audit" && <Audit id={id} />}
            </div>
          )}
        </>
      )}
    </main>
  );
}
type Mutate = (path: string, body?: unknown, method?: string) => Promise<void>;

function AnalyticsPanel({ id }: { id: string }) {
  const [data, setData] = useState<Analytics | null>(null),
    [error, setError] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  async function load(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    try {
      const q = new URLSearchParams();
      if (from) q.set("from", new Date(`${from}T00:00:00Z`).toISOString());
      if (to) q.set("to", new Date(`${to}T23:59:59.999Z`).toISOString());
      setData(
        await operations<Analytics>(
          `/organizer/organizations/${id}/analytics?${q}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load analytics.");
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  return (
    <div className="grid gap-5">
      <form className="flex flex-wrap items-end gap-3" onSubmit={load}>
        <Label name="From (UTC)">
          <input
            className={field}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Label>
        <Label name="To (UTC)">
          <input
            className={field}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Label>
        <button className="btn-secondary">Update report</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Tickets sold", data.ticketsSold],
              ["Seats remaining", data.seatsRemaining],
              [
                "Checkout conversion",
                `${(data.conversionRate * 100).toFixed(1)}%`,
              ],
              ["Refunded orders", `${(data.refundRate * 100).toFixed(1)}%`],
            ].map(([label, value]) => (
              <div className="glass-panel min-w-0 rounded-2xl p-5" key={label}>
                <p className="text-sm text-slate">{label}</p>
                <p className="mono-data mt-3 text-3xl font-bold text-moss">
                  {value}
                </p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate">
            Conversion is captured orders / checkout orders. Sales and refunds
            are grouped by order creation date; seat inventory is current. Net
            revenue is captured total minus refunds, before provider costs.
          </p>
          {(data.revenue.length
            ? data.revenue
            : [
                {
                  currency: "VND",
                  grossRevenue: 0,
                  netRevenue: 0,
                  refunds: 0,
                  averageOrderValue: 0,
                },
              ]
          ).map((row) => (
            <Panel key={row.currency} title={`Revenue · ${row.currency}`}>
              <dl className="grid gap-5 sm:grid-cols-4">
                {[
                  ["Gross", row.grossRevenue],
                  ["Refunds", row.refunds],
                  ["Net", row.netRevenue],
                  ["Average order", row.averageOrderValue],
                ].map(([label, amount]) => (
                  <div key={label}>
                    <dt className="text-sm text-slate">{label}</dt>
                    <dd className="mt-2 text-xl font-bold">
                      {money(Number(amount), row.currency)}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          ))}
          <Panel title="Sales by day">
            {data.byDay.length === 0 ? (
              <p className="text-slate">
                Sales will appear after the first payment.
              </p>
            ) : (
              <div className="grid gap-4">
                {data.byDay.map((row) => (
                  <div key={row.label + row.currency}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span>{row.label}</span>
                      <span>{money(row.gross, row.currency)}</span>
                    </div>
                    <div className="h-3 rounded bg-white/5">
                      <div
                        className="h-3 rounded bg-coral"
                        style={{
                          width: `${(row.gross / Math.max(1, ...data.byDay.map((r) => r.gross))) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Sales by session">
            <div className="overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-3">Session</th>
                    <th>Orders</th>
                    <th>Tickets</th>
                    <th>Gross</th>
                    <th>Refunds</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySession.map((r) => (
                    <tr key={r.id} className="border-t border-white/10">
                      <td className="p-3">{r.label}</td>
                      <td>{r.orders}</td>
                      <td>{r.tickets}</td>
                      <td>{money(r.gross, r.currency)}</td>
                      <td>{money(r.refunds, r.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Sales by ticket type">
            <div className="flex flex-wrap gap-6">
              {data.byTicketType.map((r) => (
                <div key={r.label + r.currency}>
                  <p className="text-moss">{r.label}</p>
                  <p>
                    {r.tickets} tickets · {money(r.subtotal, r.currency)} before
                    fees and discounts
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function EventPanel({
  event,
  manager,
  busy,
  mutate,
}: {
  event: Event;
  manager: boolean;
  busy: boolean;
  mutate: Mutate;
}) {
  const [policy, setPolicy] = useState<RefundPolicy>(
    event.refundPolicy ?? {
      fullRefundHours: 72,
      partialRefundHours: 24,
      partialRefundPercent: 50,
    },
  );
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  return (
    <Panel title={event.title}>
      <p className="mb-4 text-sm text-moss">
        {event.status}
        {event.cancellation &&
          ` · Refund workflow: ${event.cancellation.status}`}
      </p>
      {event.cancellation?.lastError && (
        <p className="mb-4 text-red-200">
          Refund processing will retry. {event.cancellation.lastError}
        </p>
      )}
      {manager && (
        <form
          className="mb-6 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(`/organizer/events/${event.id}/refund-policy`, policy);
          }}
        >
          {(
            [
              ["fullRefundHours", "Full refund cutoff (hours)"],
              ["partialRefundHours", "Partial refund cutoff (hours)"],
              ["partialRefundPercent", "Partial refund (%)"],
            ] as const
          ).map(([key, title]) => (
            <Label key={key} name={title}>
              <input
                className={field}
                type="number"
                min="0"
                max={key === "partialRefundPercent" ? 100 : 8760}
                value={policy[key]}
                onChange={(e) =>
                  setPolicy({ ...policy, [key]: Number(e.target.value) })
                }
              />
            </Label>
          ))}
          <button
            className="btn-secondary"
            disabled={busy || event.status === "CANCELLED"}
          >
            Save refund policy
          </button>
        </form>
      )}
      <div className="grid gap-4">
        {event.sessions.map((session) => (
          <SessionPanel
            key={session.id}
            session={session}
            manager={manager}
            busy={busy}
            mutate={mutate}
          />
        ))}
      </div>
      {manager && event.status !== "CANCELLED" && (
        <div className="mt-6 border-t border-white/10 pt-5">
          {confirm ? (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(`/organizer/events/${event.id}/cancel`, { reason });
              }}
            >
              <p className="text-sm text-red-200">
                Cancel all sessions, invalidate tickets, and refund the
                remaining paid amount for every customer.
              </p>
              <Label name="Cancellation reason">
                <input
                  required
                  minLength={5}
                  maxLength={500}
                  className={field}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Label>
              <div className="flex gap-3">
                <button className="btn-primary" disabled={busy}>
                  Confirm event cancellation
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirm(false)}
                >
                  Keep event
                </button>
              </div>
            </form>
          ) : (
            <button className="btn-secondary" onClick={() => setConfirm(true)}>
              Cancel event
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
function SessionPanel({
  session,
  manager,
  busy,
  mutate,
}: {
  session: Event["sessions"][number];
  manager: boolean;
  busy: boolean;
  mutate: Mutate;
}) {
  const [settings, setSettings] = useState<SessionSettings>({
    waitingRoomCapacity: session.waitingRoomCapacity,
    admissionMinutes: session.admissionMinutes,
    pricingRules: session.pricingRules ?? [],
  });
  return (
    <form
      className="rounded-xl border border-white/10 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void mutate(`/organizer/sessions/${session.id}/settings`, settings);
      }}
    >
      <div className="mb-4 flex flex-wrap justify-between gap-3">
        <h3 className="font-semibold">
          {new Date(session.startAt).toLocaleString()} · {session.status}
        </h3>
        <Link
          href={`/booking/${session.id}`}
          className="text-sm text-moss underline"
        >
          View seat map
        </Link>
      </div>
      {manager && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Label name="Waiting room capacity (0 disables)">
              <input
                className={field}
                type="number"
                min="0"
                max="10000"
                value={settings.waitingRoomCapacity}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    waitingRoomCapacity: Number(e.target.value),
                  })
                }
              />
            </Label>
            <Label name="Admission duration (minutes)">
              <input
                className={field}
                type="number"
                min="1"
                max="60"
                value={settings.admissionMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    admissionMinutes: Number(e.target.value),
                  })
                }
              />
            </Label>
          </div>
          <p className="mb-3 mt-5 text-sm text-slate">
            Dynamic prices apply to new reservations. Existing holds keep their
            price.
          </p>
          {settings.pricingRules.map((rule, i) => (
            <div className="mb-3 flex items-end gap-3" key={i}>
              <Label name="Seats sold (%)">
                <input
                  className={field}
                  type="number"
                  min="0"
                  max="100"
                  value={rule.soldPercent}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      pricingRules: settings.pricingRules.map((r, j) =>
                        i === j
                          ? { ...r, soldPercent: Number(e.target.value) }
                          : r,
                      ),
                    })
                  }
                />
              </Label>
              <Label name="Base price multiplier (%)">
                <input
                  className={field}
                  type="number"
                  min="100"
                  max="500"
                  value={rule.multiplierPercent}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      pricingRules: settings.pricingRules.map((r, j) =>
                        i === j
                          ? { ...r, multiplierPercent: Number(e.target.value) }
                          : r,
                      ),
                    })
                  }
                />
              </Label>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setSettings({
                    ...settings,
                    pricingRules: settings.pricingRules.filter(
                      (_, j) => i !== j,
                    ),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-secondary"
              disabled={settings.pricingRules.length >= 10}
              onClick={() =>
                setSettings({
                  ...settings,
                  pricingRules: [
                    ...settings.pricingRules,
                    { soldPercent: 80, multiplierPercent: 130 },
                  ],
                })
              }
            >
              Add pricing threshold
            </button>
            <button
              className="btn-primary"
              disabled={busy || session.status === "CANCELLED"}
            >
              Save session settings
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function Promotions({
  id,
  data,
  busy,
  mutate,
}: {
  id: string;
  data: Overview;
  busy: boolean;
  mutate: Mutate;
}) {
  const [type, setType] = useState("PERCENTAGE");
  return (
    <div className="grid gap-5">
      <Panel title="Create promo code">
        <form
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void mutate(`/organizer/organizations/${id}/promotions`, {
              code: f.get("code"),
              type,
              value: Number(f.get("value")),
              maxDiscount: f.get("cap") ? Number(f.get("cap")) : null,
              usageLimit: Number(f.get("limit")),
              perUserLimit: Number(f.get("perUser")),
              startsAt: new Date(String(f.get("start"))).toISOString(),
              endsAt: new Date(String(f.get("end"))).toISOString(),
            });
          }}
        >
          <Label name="Code">
            <input
              required
              name="code"
              pattern="[A-Za-z0-9_-]{2,40}"
              className={field}
              placeholder="WELCOME10"
            />
          </Label>
          <Label name="Discount type">
            <select
              className={field}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="PERCENTAGE">Percentage</option>
              <option value="FIXED">Fixed VND</option>
            </select>
          </Label>
          <Label
            name={type === "PERCENTAGE" ? "Discount (%)" : "Discount (VND)"}
          >
            <input
              required
              name="value"
              className={field}
              type="number"
              min="1"
              max={type === "PERCENTAGE" ? 100 : 100000000}
              defaultValue="10"
            />
          </Label>
          <Label name="Maximum discount (VND, optional)">
            <input name="cap" className={field} type="number" min="1" />
          </Label>
          <Label name="Total uses">
            <input
              required
              name="limit"
              className={field}
              type="number"
              min="1"
              defaultValue="100"
            />
          </Label>
          <Label name="Uses per customer">
            <input
              required
              name="perUser"
              className={field}
              type="number"
              min="1"
              max="100"
              defaultValue="1"
            />
          </Label>
          <Label name="Starts (local time)">
            <input
              required
              name="start"
              className={field}
              type="datetime-local"
            />
          </Label>
          <Label name="Ends (local time)">
            <input
              required
              name="end"
              className={field}
              type="datetime-local"
            />
          </Label>
          <button className="btn-primary self-end" disabled={busy}>
            Create promotion
          </button>
        </form>
      </Panel>
      <Panel title="Promotions">
        <div className="grid gap-3">
          {data.promotions.length === 0 && (
            <p className="text-slate">No promo codes yet.</p>
          )}
          {data.promotions.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/5 p-4"
            >
              <div>
                <strong>{p.code}</strong>
                <p className="mt-1 text-sm text-slate">
                  {p.type === "PERCENTAGE" ? `${p.value}%` : formatVnd(p.value)}{" "}
                  · {p.usageLimit} uses · ends{" "}
                  {new Date(p.endsAt).toLocaleDateString()} ·{" "}
                  {p.active ? "Active" : "Disabled"}
                </p>
              </div>
              <button
                className="btn-secondary"
                disabled={busy || !p.active}
                onClick={() =>
                  void mutate(
                    `/organizer/organizations/${id}/promotions/${p.id}`,
                    undefined,
                    "DELETE",
                  )
                }
              >
                Disable
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
function Team({
  id,
  data,
  busy,
  mutate,
  role,
}: {
  id: string;
  data: Overview;
  busy: boolean;
  mutate: Mutate;
  role: string;
}) {
  return (
    <Panel title="Organization team">
      <p className="mb-5 text-sm text-slate">
        Owners manage the organization and its administrators. Administrators
        manage sales settings and staff. Staff can read reports. Scanners can
        validate and admit tickets for this organization.
      </p>
      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void mutate(`/organizer/organizations/${id}/members`, {
            email: f.get("email"),
            role: f.get("role"),
          });
        }}
      >
        <Label name="Registered email">
          <input
            required
            name="email"
            type="email"
            className={field}
            placeholder="colleague@example.com"
          />
        </Label>
        <Label name="Role">
          <select name="role" className={field}>
            {(role === "OWNER"
              ? ["STAFF", "SCANNER", "ADMIN", "OWNER"]
              : ["STAFF", "SCANNER"]
            ).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Label>
        <button className="btn-primary" disabled={busy}>
          Add or update member
        </button>
      </form>
      <div className="grid gap-3">
        {data.members.map((m) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/5 p-4"
          >
            <div>
              <p>
                {m.user.firstName} {m.user.lastName}
              </p>
              <p className="text-sm text-slate">
                {m.user.email} · {m.role}
              </p>
            </div>
            <button
              className="btn-secondary"
              disabled={
                busy ||
                (role !== "OWNER" && ["OWNER", "ADMIN"].includes(m.role))
              }
              onClick={() =>
                void mutate(
                  `/organizer/organizations/${id}/members/${m.id}`,
                  undefined,
                  "DELETE",
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
function Venues({
  data,
  busy,
  mutate,
  refresh,
}: {
  data: Overview;
  busy: boolean;
  mutate: Mutate;
  refresh: () => void;
}) {
  const halls = data.venues.flatMap((v) =>
    v.halls.map((h) => ({ ...h, venueName: v.name })),
  );
  const [selected, setSelected] = useState(halls[0]?.id ?? "");
  const hall = halls.find((h) => h.id === selected);
  return (
    <div className="grid gap-5">
      <Panel title="Venue layouts">
        <div className="flex flex-wrap items-end gap-4">
          <Label name="Hall">
            <select
              className={field}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {halls.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.venueName} / {h.name}
                </option>
              ))}
            </select>
          </Label>
        </div>
        <form
          className="mt-5 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void mutate(`/organizer/venues/${f.get("venue")}/halls`, {
              name: f.get("name"),
            });
          }}
        >
          <Label name="Venue">
            <select name="venue" className={field}>
              {data.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Label>
          <Label name="New hall name">
            <input required name="name" className={field} maxLength={80} />
          </Label>
          <button
            className="btn-secondary"
            disabled={busy || !data.venues.length}
          >
            Create hall
          </button>
        </form>
      </Panel>
      {hall && <VenueDesigner key={hall.id} hall={hall} saved={refresh} />}
    </div>
  );
}
function Audit({ id }: { id: string }) {
  const [data, setData] = useState<AuditPage | null>(null),
    [page, setPage] = useState(1),
    [action, setAction] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    operations<AuditPage>(
      `/organizer/organizations/${id}/audit?page=${page}${action ? `&action=${encodeURIComponent(action)}` : ""}`,
    )
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, page, action]);
  return (
    <Panel title="Audit history">
      <Label name="Action">
        <select
          className={`${field} mb-5 max-w-sm`}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All actions</option>
          {[
            "BOOKING_REFUNDED",
            "EVENT_CANCELLED",
            "MEMBER_UPDATED",
            "MEMBER_REMOVED",
            "PROMOTION_CREATED",
            "PROMOTION_DISABLED",
            "REFUND_POLICY_UPDATED",
            "SESSION_SETTINGS_UPDATED",
            "HALL_CREATED",
            "HALL_LAYOUT_UPDATED",
          ].map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </Label>
      {error && <p role="alert">{error}</p>}
      <div className="grid gap-3">
        {data?.data.length === 0 && (
          <p className="text-slate">No matching activity.</p>
        )}
        {data?.data.map((log) => (
          <details
            key={log.id}
            className="rounded-xl border border-white/10 p-4"
          >
            <summary className="cursor-pointer text-sm">
              <strong>{log.action.replaceAll("_", " ")}</strong>
              <span className="ml-4 text-slate">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </summary>
            <p className="mt-3 break-all text-xs text-slate">
              Actor {log.actorId} · Target {log.targetId}
            </p>
            <pre className="mt-3 overflow-auto text-xs">
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </details>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-4">
        <button
          className="btn-secondary"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span className="text-sm">
          Page {page} / {Math.max(1, data?.totalPages ?? 1)}
        </span>
        <button
          className="btn-secondary"
          disabled={page >= (data?.totalPages ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </Panel>
  );
}
function money(amount: number, currency: string) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(
    amount,
  );
}

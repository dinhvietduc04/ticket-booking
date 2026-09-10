"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, ScanLine, TicketCheck, UserPlus } from "lucide-react";

type StoredUser = {
  email: string;
  firstName: string;
};

export function AppNav() {
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    setUser(readStoredUser());

    function syncUser() {
      setUser(readStoredUser());
    }

    window.addEventListener("storage", syncUser);
    window.addEventListener("seatly.auth.changed", syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("seatly.auth.changed", syncUser);
    };
  }, []);

  function logout() {
    window.localStorage.removeItem("seatly.accessToken");
    window.localStorage.removeItem("seatly.user");
    window.dispatchEvent(new Event("seatly.auth.changed"));
    setUser(null);
  }

  return (
    <nav className="flex flex-wrap items-center justify-end gap-2 text-sm text-slate">
      <Link
        className="rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-ink"
        href="/events"
      >
        Events
      </Link>
      <Link
        className="hidden rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-ink sm:inline-flex"
        href="/account/bookings"
      >
        <TicketCheck className="mr-1.5" size={16} aria-hidden="true" />
        Bookings
      </Link>
      <Link
        className="hidden rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-ink md:inline-flex"
        href="/scanner"
      >
        <ScanLine className="mr-1.5" size={16} aria-hidden="true" />
        Scanner
      </Link>

      <Link className="rounded-lg px-3 py-2 hover:bg-white/5" href="/organizer">
        Organizer
      </Link>
      {user ? (
        <button
          className="btn-secondary min-h-10 px-3"
          onClick={logout}
          title={user.email}
          type="button"
        >
          <LogOut size={16} aria-hidden="true" />
          {user.firstName || "Logout"}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <Link className="btn-secondary min-h-10 px-3" href="/login">
            <LogIn size={16} aria-hidden="true" />
            Login
          </Link>
          <Link
            className="btn-primary hidden min-h-10 px-3 sm:flex"
            href="/register"
          >
            <UserPlus size={16} aria-hidden="true" />
            Register
          </Link>
        </div>
      )}
    </nav>
  );
}

function readStoredUser() {
  const rawUser = window.localStorage.getItem("seatly.user");

  if (!rawUser) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawUser) as Partial<StoredUser>;

    return typeof parsed.email === "string"
      ? {
          email: parsed.email,
          firstName:
            typeof parsed.firstName === "string" ? parsed.firstName : "",
        }
      : null;
  } catch {
    return null;
  }
}

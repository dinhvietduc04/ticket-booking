"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckoutPanel } from "@/components/checkout/checkout-panel";
import { getHold, type SeatHold } from "@/lib/api";
export default function CheckoutPage() {
  const { holdId } = useParams<{ holdId: string }>();
  const [hold, setHold] = useState<SeatHold | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getHold(holdId)
      .then((h) => {
        if (active) setHold(h);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [holdId]);
  if (error)
    return (
      <main className="app-container py-8">
        <p role="alert">{error}</p>
        <Link className="btn-secondary mt-4" href="/login">
          Log in to your account
        </Link>
      </main>
    );
  return hold ? (
    <CheckoutPanel hold={hold} />
  ) : (
    <main className="app-container py-8">Loading reservation…</main>
  );
}

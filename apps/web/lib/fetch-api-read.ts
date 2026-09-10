// Only reads use retries: checkout, payments, and other writes must not be replayed.
export async function fetchApiRead(url: string, init: RequestInit = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, { ...init, method: "GET" });
    } catch (error) {
      if (!isNetworkFailure(error)) throw error;
      if (attempt >= 2) {
        throw new Error("Unable to reach Seatly. Please try again shortly.", {
          cause: error,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  // Node fetch reports "fetch failed"; browsers report either of the others.
  return [
    "fetch failed",
    "Failed to fetch",
    "NetworkError when attempting to fetch resource.",
  ].includes(error.message);
}

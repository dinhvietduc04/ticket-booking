import { getSeatMap } from "@/lib/api";
import { WaitingRoom } from "@/components/waiting-room";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const seatMap = await getSeatMap(sessionId);

  return <WaitingRoom seatMap={seatMap} />;
}

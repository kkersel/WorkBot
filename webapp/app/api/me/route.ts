import { authed, json } from "@/lib/http";
import { fetchSchedule, getUser } from "@/lib/queries";

export async function GET(): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;

  const [user, schedule] = await Promise.all([getUser(a.uid), fetchSchedule(a.uid)]);
  return json({ user, schedule });
}

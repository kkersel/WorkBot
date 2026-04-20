import { authed, bad, json } from "@/lib/http";
import { computeDay, findNextCommonOff } from "@/lib/queries";
import { todayMSK } from "@/lib/schedule";

export async function GET(req: Request): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;

  const url = new URL(req.url);
  const d = url.searchParams.get("date") ?? todayMSK();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return bad("bad date");

  const [views, nextOff] = await Promise.all([
    computeDay(d),
    findNextCommonOff(d),
  ]);
  return json({ date: d, views, next_common_off: nextOff });
}

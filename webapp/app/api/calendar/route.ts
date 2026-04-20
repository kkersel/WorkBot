import { authed, bad, json } from "@/lib/http";
import { loadHolidays } from "@/lib/queries";

export async function GET(req: Request): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;

  const url = new URL(req.url);
  const yearStr = url.searchParams.get("year");
  const year = yearStr ? Number(yearStr) : new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return bad("bad year");

  const holidays = await loadHolidays(year, year);
  return json({ year, holidays });
}

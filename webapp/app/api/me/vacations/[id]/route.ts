import { authed, bad, json } from "@/lib/http";
import { deleteVacation } from "@/lib/queries";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const a = await authed();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  const vid = Number(id);
  if (!Number.isFinite(vid)) return bad("bad id");

  const removed = await deleteVacation(a.uid, vid);
  if (!removed) return bad("not found", 404);
  return json({ ok: true });
}

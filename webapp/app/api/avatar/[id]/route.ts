import { bad } from "@/lib/http";

/**
 * Proxy Telegram profile photo for a user by id.
 *
 *   GET /api/avatar/<user_id>
 *
 * Flow:
 *   getUserProfilePhotos(user_id) → file_id of the smallest size of the
 *   first photo → getFile(file_id) → file_path → stream
 *   https://api.telegram.org/file/bot<TOKEN>/<file_path>
 *
 * Cached 24h at the edge so we don't hammer Telegram on every render.
 * Public endpoint — no session check, everyone in the team sees avatars.
 * 1x1 transparent PNG fallback when no photo / user private / errors.
 */

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+XJ/WGAAAAABJRU5ErkJggg==",
  "base64",
);

async function tgApi<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await r.json()) as { ok: boolean; description?: string; result?: T };
  if (!data.ok) throw new Error(data.description ?? `tg ${method} ${r.status}`);
  return data.result as T;
}

type ProfilePhotosResp = {
  total_count: number;
  photos: Array<Array<{ file_id: string; file_unique_id: string; width: number; height: number }>>;
};
type GetFileResp = { file_id: string; file_path?: string };

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) return bad("bad id");

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return bad("TELEGRAM_BOT_TOKEN missing", 500);

  try {
    // 1) пик последнее фото, самый маленький размер (64-160 px)
    const photos = await tgApi<ProfilePhotosResp>("getUserProfilePhotos", {
      user_id: userId,
      limit: 1,
    });
    if (!photos.total_count || !photos.photos[0]?.length) {
      return fallback();
    }
    // Массив отсортирован small → large. Берём small для скорости.
    const smallest = photos.photos[0][0];

    // 2) file_path
    const file = await tgApi<GetFileResp>("getFile", { file_id: smallest.file_id });
    if (!file.file_path) return fallback();

    // 3) скачиваем и стримим клиенту
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const r = await fetch(fileUrl, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok || !r.body) return fallback();

    return new Response(r.body, {
      headers: {
        "content-type": r.headers.get("content-type") ?? "image/jpeg",
        // 24h на CDN + 7d на браузере (фото меняется редко)
        "cache-control":
          "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return fallback();
  }
}

function fallback(): Response {
  // Отдаём прозрачный 1×1 — клиент упадёт на initial-аватар
  return new Response(TRANSPARENT_PNG, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
    },
  });
}

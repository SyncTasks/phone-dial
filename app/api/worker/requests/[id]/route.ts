import { revalidatePath } from "next/cache";
import { loadBoard } from "@/lib/data";
import { validateWorkerUpdate } from "@/lib/ops";
import { getRequest, updateRequest } from "@/lib/store";
import { denyUnlessWorker, json } from "@/lib/worker";

export const dynamic = "force-dynamic";

/**
 * リマ reports on one request: { status: "doing" } when she starts, then
 * { status: "done", reply, actions } or { status: "error", reply }.
 * Action buttons are validated strictly; any bad one rejects the whole update.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const deny = denyUnlessWorker(req);
  if (deny) return deny;
  const { id } = await params;
  const current = await getRequest(id);
  if (!current) return json({ error: "request not found" }, 404);
  if (current.status === "done") return json({ error: "request already done" }, 409);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body must be JSON" }, 400);
  }
  const board = await loadBoard();
  const hasActions = typeof body === "object" && body !== null && Array.isArray((body as { actions?: unknown }).actions) && (body as { actions: unknown[] }).actions.length > 0;
  if (hasActions && board.error) return json({ error: `sheet unavailable, cannot validate actions: ${board.error}` }, 503);
  const update = validateWorkerUpdate(body, board.tasks);
  if (!update.ok) return json({ error: update.error }, 400);

  const saved = await updateRequest(id, update.value);
  revalidatePath("/", "layout");
  return json({ ok: true, id, status: saved?.status, actions: saved?.actions ?? [] });
}

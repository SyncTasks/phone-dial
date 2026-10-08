import { workQueue } from "@/lib/ops";
import { listOpenRequests } from "@/lib/store";
import { denyUnlessWorker, json } from "@/lib/worker";

export const dynamic = "force-dynamic";

/** Requests waiting for リマ: pending, plus doing ones left stale by an interrupted run. */
export async function GET(req: Request) {
  const deny = denyUnlessWorker(req);
  if (deny) return deny;
  try {
    const requests = workQueue(await listOpenRequests(), Date.now()).map((r) => ({
      id: r.id,
      kind: r.kind,
      text: r.text,
      taskKey: r.taskKey,
      status: r.status,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
    return json({ requests });
  } catch (e) {
    console.error("[worker/pending]", e);
    return json({ error: "store unavailable" }, 503);
  }
}

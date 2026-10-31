import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canTransitionRequest } from "@/lib/request-workflow";
import { badId, validIds } from "@/lib/ids";

async function authorizedRequest(id: string, user: { id: string; role: string }) {
  const result = await query("SELECT requester_id,title,status,assigned_to FROM service_requests WHERE id=$1", [id]);
  const request = result.rows[0];
  if (!request) return { error: "not_found" as const };
  if (user.role !== "admin" && request.requester_id !== user.id) return { error: "forbidden" as const };
  return { request };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {if(!validIds(await params))return badId();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const access = await authorizedRequest(id, user);
  if ("error" in access) {
    return NextResponse.json({ error: access.error === "not_found" ? "Not found" : "Forbidden" }, { status: access.error === "not_found" ? 404 : 403 });
  }
  const visibility = user.role === "admin" ? "" : "AND e.visibility='shared'";
  const events = await query(
    `SELECT e.id,e.event_type,e.visibility,e.message,e.from_status,e.to_status,e.metadata,e.created_at,
      COALESCE(u.name,'النظام') actor_name,u.role actor_role
     FROM service_request_events e LEFT JOIN users u ON u.id=e.actor_id
     WHERE e.request_id=$1 ${visibility} ORDER BY e.created_at ASC`,
    [id],
  );
  return NextResponse.json({ events: events.rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {if(!validIds(await params))return badId();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as { message?: unknown; visibility?: unknown; reopen?: unknown; close?: unknown } | null;
  const message = String(body?.message || "").trim();
  const visibility = user.role === "admin" && body?.visibility === "admin" ? "admin" : "shared";
  const reopen = body?.reopen === true;
  const close = body?.close === true;
  if (message.length < 2 || message.length > 2000) {
    return NextResponse.json({ error: "اكتب تعليقًا واضحًا لا يتجاوز 2000 حرف" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      "SELECT requester_id,title,status,assigned_to FROM service_requests WHERE id=$1 FOR UPDATE",
      [id],
    );
    const request = locked.rows[0];
    if (!request) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }
    if (user.role !== "admin" && request.requester_id !== user.id) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (["cancelled", "closed", "rejected"].includes(request.status)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "الطلب مغلق ولا يقبل تعليقات جديدة" }, { status: 409 });
    }

    let nextStatus = request.status;
    let eventType = visibility === "admin" ? "internal_note" : "comment";
    if (user.role === "sales_rep" && close) {
      if (!canTransitionRequest("sales_rep", request.status, "closed")) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "لا يمكن إغلاق الطلب في حالته الحالية" }, { status: 409 });
      }
      nextStatus = "closed";
      eventType = "closed";
    } else if (user.role === "sales_rep" && request.status === "needs_info") {
      nextStatus = "pending";
      eventType = "information_added";
    } else if (user.role === "sales_rep" && reopen) {
      if (!canTransitionRequest("sales_rep", request.status, "reopened")) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "لا يمكن إعادة فتح الطلب في حالته الحالية" }, { status: 409 });
      }
      nextStatus = "reopened";
      eventType = "reopened";
    }

    await client.query(
      `INSERT INTO service_request_events(request_id,actor_id,event_type,visibility,message,from_status,to_status)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [id, user.id, eventType, visibility, message, request.status, nextStatus],
    );
    await client.query(
      `UPDATE service_requests SET status=$1,last_action_at=now(),updated_at=now(),
       closed_at=CASE WHEN $1='closed' THEN now() WHEN $1='reopened' THEN NULL ELSE closed_at END
       WHERE id=$2`,
      [nextStatus, id],
    );

    if (user.role === "admin") {
      if (visibility === "shared") {
        await client.query(
          "INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'service_request_comment',$2,$3,'service_request',$4)",
          [request.requester_id, `رد جديد على طلبك: ${request.title}`, `/requests?request=${id}`, id],
        );
      }
    } else {
      const recipients = request.assigned_to
        ? [{ id: request.assigned_to }]
        : (await client.query("SELECT id FROM users WHERE role='admin' AND active=true")).rows;
      for (const recipient of recipients) {
        await client.query(
          "INSERT INTO task_notifications(user_id,task_id,kind,message,action_url,entity_type,entity_id) VALUES($1,NULL,'service_request_comment',$2,$3,'service_request',$4)",
          [recipient.id, `${user.name} أضاف تحديثًا على الطلب: ${request.title}`, `/admin/requests?request=${id}`, id],
        );
      }
    }
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

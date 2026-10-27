type Actor = { id: string; role: string };
type RequestOwnerAndStatus = { requester_id: string; status: string };

export function canCancelServiceRequest(actor: Actor, request: RequestOwnerAndStatus): boolean {
  return actor.role === "sales_rep"
    && actor.id === request.requester_id
    && ["pending", "in_progress", "needs_info"].includes(request.status);
}

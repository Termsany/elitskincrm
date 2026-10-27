export type AppRole = 'admin' | 'sales_rep';
export type Actor = { id: string; role: AppRole };
export const canAccessVisit = (actor: Actor, ownerId: string) => actor.role === 'admin' || actor.id === ownerId;
export const canManageMasterData = (actor: Actor) => actor.role === 'admin';
export const canCreateVisit = (role: AppRole) => role === 'sales_rep';

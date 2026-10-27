import { z } from 'zod';
const item = z.object({ productId: z.string().uuid(), quantity: z.coerce.number().int().positive().max(10000) });
export const visitSchema = z.object({
  doctorId: z.string().uuid(),
  notes: z.string().trim().min(10, 'الملاحظات مطلوبة (10 أحرف على الأقل)').max(2000),
  status: z.enum(['planned', 'completed', 'cancelled']),
  sampleItems: z.array(item.extend({ purpose: z.enum(["personal_use","video_shooting","workshop"]) })).max(30).default([]),
  orderItems: z.array(item).max(30).default([]),
  presentedProducts: z.array(z.object({ productId: z.string().uuid(), reaction: z.enum(["interested","neutral","not_interested"]) })).max(30).optional(),
  idempotencyKey: z.string().uuid().optional(),
  visitedAt: z.coerce.date().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  accuracy_m: z.coerce.number().min(0).max(100000).optional(),
  follow_up_at: z.string().optional().or(z.literal("")),
  follow_up_note: z.string().max(1000).optional()
});
export const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(128) });
export const userUpsertSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email().max(254),
  role: z.enum(['admin','sales_rep']),
  job_title: z.string().trim().max(120).optional(),
  assigned_product_id: z.string().uuid().nullable().optional(),
  password: z.string().min(8).max(128).optional().or(z.literal('')),
  active: z.boolean().optional(),
});
export const productSchema = z.object({ name: z.string().trim().min(2).max(80), active: z.boolean().optional() });
export const doctorSchema = z.object({
  name: z.string().trim().min(2).max(120),
  clinic_name: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  specialty: z.string().trim().max(80).optional(),
  classification: z.string().trim().max(10).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""),z.string().trim().email().max(254)]).optional(),
  status: z.string().trim().max(20).optional(),
});
export const doctorContactPatchSchema = z.object({
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""),z.string().trim().email().max(254)]).optional(),
}).strict().refine(v=>v.phone!==undefined||v.email!==undefined,{message:"لا توجد تغييرات"});
export const targetSchema = z.object({
  user_id: z.string().uuid(),
  product_id: z.string().uuid(),
  target_value: z.coerce.number().int().min(0).max(10000),
  period_start: z.string().min(8),
  period_end: z.string().min(8),
});

export const taskSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  assigned_to: z.string().uuid(),
  priority: z.enum(['low','medium','high','urgent']).optional(),
  due_date: z.string().optional().or(z.literal("")),
});
export const taskUpdateSchema = z.object({
  status: z.enum(['pending','in_progress','completed','failed']).optional(),
  failure_note: z.string().max(1000).optional(),
  priority: z.enum(['low','medium','high','urgent']).optional(),
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  due_date: z.string().optional().or(z.literal("")),
});
export const taskMultiSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  assigned_to: z.array(z.string().uuid()).min(1).max(20).optional(),
  assigned_ids: z.array(z.string().uuid()).min(1).max(20).optional(),
  priority: z.enum(['low','medium','high','urgent']).optional(),
  due_date: z.string().optional().or(z.literal("")),
  doctor_id: z.string().uuid().optional().or(z.literal("")),
  repeat_interval: z.enum(['none','weekly','monthly']).optional(),
});
export const checklistSchema = z.object({ title: z.string().trim().min(1).max(200) });
export const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const planSchema = z.object({
  period: z.enum(['weekly','monthly']),
  period_start: z.string().min(8),
  period_end: z.string().min(8),
  items: z.array(z.object({
    doctor_id: z.string().uuid(),
    planned_date: z.string().min(8),
    product_id: z.string().uuid().optional().or(z.literal("")),
    note: z.string().max(500).optional(),
    priority: z.enum(['low','medium','high','urgent']).optional(),
  })).min(1).max(50),
  target_visits: z.coerce.number().int().min(1).max(100).optional(),
  template_name: z.string().max(80).optional(),
});
export const planStatusSchema = z.object({
  status: z.enum(['approved','rejected','needs_revision']),
  admin_note: z.string().max(1000).optional(),
});
export const planRevisionSchema = z.object({
  note: z.string().trim().min(5).max(1000),
  items: z.array(z.object({
    doctor_id: z.string().uuid(),
    planned_date: z.string().min(8),
    product_id: z.string().uuid().optional().or(z.literal("")),
    note: z.string().max(500).optional(),
  })).min(1).max(50).optional(),
});

export const monthlySaleSchema = z.object({
  sale_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amount: z.coerce.number().finite().min(0),
});

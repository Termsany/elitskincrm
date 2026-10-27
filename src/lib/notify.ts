import { query } from "./db";

function env(name:string){ return process.env[name] || ""; }

export async function notifyAdminNewVisit(visitId:string){
  const to = env("ADMIN_NOTIFY_EMAIL") || env("BOOTSTRAP_ADMIN_EMAIL");
  if(!to) return;
  const smtpHost = env("SMTP_HOST");
  const smtpUser = env("SMTP_USER");
  const smtpPass = env("SMTP_PASS");
  // If SMTP not configured, just log to notifications table
  const r = await query(`
    SELECT v.id, v.visited_at, v.notes, v.status, u.name rep_name, d.name doctor_name, d.clinic_name
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id WHERE v.id=$1
  `,[visitId]);
  const v = r.rows[0] as Record<string,unknown> | undefined;
  if(!v) return;
  const subject = `زيارة جديدة: ${v.rep_name} → ${v.doctor_name} (${v.clinic_name})`;
  const text = `مندوب: ${v.rep_name}\nطبيب: ${v.doctor_name} - ${v.clinic_name}\nالحالة: ${v.status}\nالتاريخ: ${v.visited_at}\nالملاحظات: ${v.notes}`;

  await query("INSERT INTO notifications(kind, payload) VALUES('visit_created', $1)", [JSON.stringify({ visitId, subject, text, to })]);

  if(smtpHost && smtpUser && smtpPass){
    try{
      const nodemailer = await import("nodemailer").catch(()=>null) as unknown as { createTransport: (o:unknown)=>{sendMail:(m:unknown)=>Promise<unknown>} } | null;
      if(!nodemailer) return;
      const port = parseInt(env("SMTP_PORT")||"587",10);
      const secure = (env("SMTP_SECURE")||"false")==="true";
      const transporter = nodemailer.createTransport({ host: smtpHost, port, secure, auth:{ user:smtpUser, pass:smtpPass }});
      await transporter.sendMail({ from: env("SMTP_FROM")||smtpUser, to, subject, text });
    }catch(e){ console.error("notify email failed", e); }
  }

  // WhatsApp via provider if configured (generic webhook)
  const waUrl = env("WHATSAPP_WEBHOOK_URL");
  if(waUrl){
    try{
      await fetch(waUrl, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ to: env("ADMIN_WHATSAPP")||"", text: subject+"\n"+text }) });
    }catch(e){ console.error("whatsapp failed", e); }
  }
}

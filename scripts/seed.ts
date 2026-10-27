import doctors from '../data/doctors.json';
import targets from '../data/targets.json';
import { pool } from '../src/lib/db';
import { hashPassword } from '../src/lib/auth';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of targets) await client.query('INSERT INTO products(name) VALUES($1) ON CONFLICT(name) DO NOTHING', [p.product]);
    for (const d of doctors) await client.query(`INSERT INTO doctors(name,clinic_name,city,specialty,classification,phone,status) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(name,clinic_name,phone) DO NOTHING`, [d.name,d.clinicName,d.city,d.specialty,d.classification,d.phone,d.status]);
    const repPassword = process.env.REP_BOOTSTRAP_PASSWORD;
    if (repPassword) {
      const passwordHash = await hashPassword(repPassword);
      for (const t of targets) {
        const product = await client.query('SELECT id FROM products WHERE name=$1', [t.product]);
        const email = `${t.rep.toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'')}@eliteskinsa.com`;
        await client.query(`INSERT INTO users(name,email,password_hash,role,assigned_product_id) VALUES($1,$2,$3,'sales_rep',$4) ON CONFLICT(email) DO UPDATE SET assigned_product_id=EXCLUDED.assigned_product_id`, [t.rep,email,passwordHash,product.rows[0].id]);
      }
    }
    const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword || adminPassword.length < 12) throw new Error('BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (12+ chars) are required');
    await client.query(`INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'admin') ON CONFLICT(email) DO NOTHING`, [process.env.BOOTSTRAP_ADMIN_NAME || 'مدير النظام', adminEmail.toLowerCase(), await hashPassword(adminPassword)]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ doctors: doctors.length, reps: targets.length, products: targets.length, admin: 1 }));
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error(e); process.exit(1); });

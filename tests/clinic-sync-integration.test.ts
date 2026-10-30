import {describe,it,expect} from 'vitest';
import {pool} from '@/lib/db';
import {readFileSync} from 'node:fs';

describe.skipIf(!process.env.DATABASE_URL?.includes('@forecast-sync-test-pg'))('doctor clinic identity synchronization (disposable database)',()=>{
 it('shares identity by normalized clinic name and city but keeps different cities distinct',async()=>{
  const c=await pool.connect();try{await c.query('BEGIN');
   const a=await c.query("INSERT INTO doctors(name,clinic_name,city) VALUES('Test A','  Nile Clinic  ','Riyadh') RETURNING clinic_id");
   const b=await c.query("INSERT INTO doctors(name,clinic_name,city) VALUES('Test B','nile clinic',' riyadh ') RETURNING clinic_id");
   const other=await c.query("INSERT INTO doctors(name,clinic_name,city) VALUES('Test C','Nile Clinic','Dammam') RETURNING clinic_id");
   expect(a.rows[0].clinic_id).toBeTruthy();expect(b.rows[0].clinic_id).toBe(a.rows[0].clinic_id);expect(other.rows[0].clinic_id).not.toBe(a.rows[0].clinic_id);
  }finally{await c.query('ROLLBACK');c.release()}
 });
 it('respects a manually corrected link during later doctor updates',async()=>{
  const c=await pool.connect();try{await c.query('BEGIN');
   const d=await c.query("INSERT INTO doctors(name,clinic_name,city) VALUES('Test D','North Clinic','Riyadh') RETURNING id,clinic_id");
   const manual=await c.query("INSERT INTO clinics(name,city) VALUES('North private branch','Riyadh') RETURNING id");
   await c.query('UPDATE doctors SET clinic_id=$2,clinic_link_manual=true WHERE id=$1',[d.rows[0].id,manual.rows[0].id]);
   const updated=await c.query("UPDATE doctors SET clinic_name='North Clinic Updated',city='Riyadh' WHERE id=$1 RETURNING clinic_id",[d.rows[0].id]);
   expect(updated.rows[0].clinic_id).toBe(manual.rows[0].id);
   const resumed=await c.query('UPDATE doctors SET clinic_link_manual=false,clinic_name=clinic_name WHERE id=$1 RETURNING clinic_id',[d.rows[0].id]);
   expect(resumed.rows[0].clinic_id).not.toBe(manual.rows[0].id);
  }finally{await c.query('ROLLBACK');c.release()}
 });
});


describe.skipIf(!process.env.DATABASE_URL?.includes('@forecast-sync-test-pg'))('clinic migration against isolated disposable schema',()=>{
 it('preserves existing links and adopts a unique existing clinic for later inserts',async()=>{
  const c=await pool.connect();try{await c.query('BEGIN');
   await c.query('CREATE SCHEMA clinic_migration_probe');await c.query('SET LOCAL search_path TO clinic_migration_probe,public');
   await c.query("CREATE TABLE clinics(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, city text NOT NULL DEFAULT '', active boolean DEFAULT true)");
   await c.query('CREATE TABLE doctors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, clinic_name text, city text, clinic_id uuid REFERENCES clinics(id))');
   const legacy=await c.query("INSERT INTO clinics(name,city) VALUES('  Nile   Clinic ',' Riyadh ') RETURNING id");
   const manual=await c.query("INSERT INTO clinics(name,city) VALUES('Private Branch','Riyadh') RETURNING id");
   const linked=await c.query("INSERT INTO doctors(name,clinic_name,city,clinic_id) VALUES('Linked','Nile Clinic','Riyadh',$1) RETURNING id",[manual.rows[0].id]);
   await c.query(readFileSync('migrations/038_clinic_sync.sql','utf8'));
   expect((await c.query('SELECT clinic_id,clinic_link_manual FROM doctors WHERE id=$1',[linked.rows[0].id])).rows[0]).toEqual({clinic_id:manual.rows[0].id,clinic_link_manual:true});
   expect((await c.query('SELECT source_key FROM clinics WHERE id=$1',[legacy.rows[0].id])).rows[0].source_key).toBeTruthy();
   const inserted=await c.query("INSERT INTO doctors(name,clinic_name,city) VALUES('New',' nIlE clinic ',' rIYAdH ') RETURNING clinic_id");
   expect(inserted.rows[0].clinic_id).toBe(legacy.rows[0].id);
   const again=await c.query("INSERT INTO doctors(name,clinic_name,city) VALUES('Again','NILE    CLINIC','RIYADH') RETURNING clinic_id");
   expect(again.rows[0].clinic_id).toBe(legacy.rows[0].id);
   expect((await c.query("UPDATE doctors SET clinic_name='Other clinic',city='Dammam' WHERE id=$1 RETURNING clinic_id,clinic_link_manual",[linked.rows[0].id])).rows[0]).toEqual({clinic_id:manual.rows[0].id,clinic_link_manual:true});
  }finally{await c.query('ROLLBACK');c.release()}
 });
 it('leaves multiple existing same-key branches distinct and gives new doctors a canonical ID',async()=>{
  const c=await pool.connect();try{await c.query('BEGIN');
   await c.query('CREATE SCHEMA clinic_multi_probe');await c.query('SET LOCAL search_path TO clinic_multi_probe,public');
   await c.query("CREATE TABLE clinics(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, city text NOT NULL DEFAULT '', active boolean DEFAULT true)");
   await c.query('CREATE TABLE doctors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, clinic_name text, city text, clinic_id uuid REFERENCES clinics(id))');
   const branches=await c.query("INSERT INTO clinics(name,city) VALUES('Same Clinic','Riyadh'),(' same  clinic ',' RIYADH ') RETURNING id");
   const linked=await c.query("INSERT INTO doctors(name,clinic_name,city,clinic_id) VALUES('Existing','Same Clinic','Riyadh',$1) RETURNING id",[branches.rows[1].id]);
   await c.query(readFileSync('migrations/038_clinic_sync.sql','utf8'));
   expect((await c.query('SELECT source_key FROM clinics WHERE id=ANY($1::uuid[])',[branches.rows.map(r=>r.id)])).rows.map(r=>r.source_key)).toEqual([null,null]);
   expect((await c.query('SELECT clinic_id,clinic_link_manual FROM doctors WHERE id=$1',[linked.rows[0].id])).rows[0]).toEqual({clinic_id:branches.rows[1].id,clinic_link_manual:true});
   const doctor=await c.query("INSERT INTO doctors(name,clinic_name,city) VALUES('New','same clinic','riyadh') RETURNING clinic_id");
   expect(branches.rows.map(r=>r.id)).not.toContain(doctor.rows[0].clinic_id);
   const repeated=await c.query("INSERT INTO doctors(name,clinic_name,city) VALUES('New2',' SAME  clinic ','RIYADH') RETURNING clinic_id");
   expect(repeated.rows[0].clinic_id).toBe(doctor.rows[0].clinic_id);
  }finally{await c.query('ROLLBACK');c.release()}
 });
});

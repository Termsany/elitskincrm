import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workbookPath = process.argv[2];
if (!workbookPath) throw new Error('Usage: npm run import:workbook -- <workbook.xlsx>');
const wb = XLSX.readFile(workbookPath, { cellDates: true });
const doctorsSheet = wb.Sheets['قاعدة الأطباء والعيادات'];
const targetSheet = wb.Sheets['المنتجات والاستهداف'];
if (!doctorsSheet || !targetSheet) throw new Error('Required workbook sheets are missing');
const doctorRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(doctorsSheet, { defval: '' });
const doctors = doctorRows.map((r) => ({
  clinicName: String(r['ACCOUNT / العيادة'] ?? '').trim(),
  name: String(r['اسم الطبيب'] ?? '').trim().replace(/\s+/g, ' '),
  status: String(r['الحالة'] ?? 'active').trim() || 'active',
  classification: String(r['CLASS'] ?? '').trim(),
  specialty: String(r['التخصص'] ?? '').trim(),
  phone: String(r['الجوال'] ?? '').trim(),
  city: String(r['المنطقة'] ?? '').trim(),
  assignedRep: String(r['المندوب المسؤول'] ?? '').trim()
})).filter((r) => r.name);
const targets = XLSX.utils.sheet_to_json<Record<string, unknown>>(targetSheet, { defval: '' })
  .map((r) => ({ product: String(r['المنتج'] ?? '').trim(), rep: String(r['المندوب'] ?? '').trim(), target: Number(r['الهدف'] ?? 0), achieved: Number(r['المحقق'] ?? 0) }))
  .filter((r) => r.product && r.product !== 'الإجمالي');
writeFileSync(resolve('data/doctors.json'), JSON.stringify(doctors, null, 2), 'utf8');
writeFileSync(resolve('data/targets.json'), JSON.stringify(targets, null, 2), 'utf8');
console.log(JSON.stringify({ doctors: doctors.length, reps: targets.length, products: new Set(targets.map(x => x.product)).size, targets: targets.length }));

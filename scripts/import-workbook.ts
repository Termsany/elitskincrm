import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sheetToObjects } from '../src/lib/workbook';

const workbookPath = process.argv[2];
if (!workbookPath) throw new Error('Usage: npm run import:workbook -- <workbook.xlsx>');

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(workbookPath);
  const doctorsSheet = wb.getWorksheet('قاعدة الأطباء والعيادات');
  const targetSheet = wb.getWorksheet('المنتجات والاستهداف');
  if (!doctorsSheet || !targetSheet) throw new Error('Required workbook sheets are missing');

  const doctors = sheetToObjects(doctorsSheet).map((r) => ({
    clinicName: String(r['ACCOUNT / العيادة'] ?? '').trim(),
    name: String(r['اسم الطبيب'] ?? '').trim().replace(/\s+/g, ' '),
    status: String(r['الحالة'] ?? 'active').trim() || 'active',
    classification: String(r['CLASS'] ?? '').trim(),
    specialty: String(r['التخصص'] ?? '').trim(),
    phone: String(r['الجوال'] ?? '').trim(),
    city: String(r['المنطقة'] ?? '').trim(),
    assignedRep: String(r['المندوب المسؤول'] ?? '').trim(),
  })).filter((r) => r.name);

  const targets = sheetToObjects(targetSheet)
    .map((r) => ({ product: String(r['المنتج'] ?? '').trim(), rep: String(r['المندوب'] ?? '').trim(), target: Number(r['الهدف'] ?? 0), achieved: Number(r['المحقق'] ?? 0) }))
    .filter((r) => r.product && r.product !== 'الإجمالي');

  writeFileSync(resolve('data/doctors.json'), JSON.stringify(doctors, null, 2), 'utf8');
  writeFileSync(resolve('data/targets.json'), JSON.stringify(targets, null, 2), 'utf8');
  console.log(JSON.stringify({ doctors: doctors.length, reps: targets.length, products: new Set(targets.map((x) => x.product)).size, targets: targets.length }));
}

main().catch((error) => { console.error(error); process.exit(1); });

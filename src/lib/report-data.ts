import { query } from "@/lib/db";
import { riyadhDateParts } from "@/lib/plan-reminders";

export async function getDetailedReportData(searchParams: URLSearchParams) {
  const repId=searchParams.get("repId"), productId=searchParams.get("productId"), search=searchParams.get("search")?.trim().toLowerCase()||"", city=searchParams.get("city"), status=searchParams.get("status"), from=searchParams.get("from"), to=searchParams.get("to");
  const vals:unknown[]=[]; const conds=["true"];
  const add=(sql:string,value:unknown)=>{vals.push(value);conds.push(sql.replace("?",`$${vals.length}`));};
  if(repId)add("v.sales_rep_id=?",repId);
  if(from)add("(v.visited_at AT TIME ZONE 'Asia/Riyadh')::date >= ?::date",from);
  if(to)add("(v.visited_at AT TIME ZONE 'Asia/Riyadh')::date <= ?::date",to);
  if(city)add("d.city=?",city);
  if(status)add("v.status=?",status);
  if(search){vals.push(`%${search}%`);const si=vals.length;conds.push(`(LOWER(u.name) LIKE $${si} OR LOWER(d.name) LIKE $${si} OR LOWER(COALESCE(d.clinic_name,'')) LIKE $${si} OR LOWER(COALESCE(d.city,'')) LIKE $${si})`);}
  let productParamIndex=0;
  if(productId){vals.push(productId);productParamIndex=vals.length;conds.push(`(EXISTS(SELECT 1 FROM visit_items vf WHERE vf.visit_id=v.id AND vf.product_id=$${productParamIndex}) OR EXISTS(SELECT 1 FROM visit_presented_products vf WHERE vf.visit_id=v.id AND vf.product_id=$${productParamIndex}))`);}
  const where=conds.join(" AND ");
  const productLineFilter=productParamIndex?`AND vi.product_id=$${productParamIndex}`:"";
  const productReportFilter=productParamIndex?`AND c.product_id=$${productParamIndex}`:"";
  const presentedReportFilter=productParamIndex?` AND vp.product_id=$${productParamIndex}`:"";

  const totals=await query(`SELECT count(DISTINCT v.id)::int visits,count(DISTINCT v.sales_rep_id)::int active_reps,count(DISTINCT v.doctor_id)::int doctors,
    COALESCE(sum(vi.quantity) FILTER(WHERE vi.kind='sample'),0)::int samples,
    COALESCE(sum(vi.quantity) FILTER(WHERE vi.kind='order'),0)::int orders
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id LEFT JOIN visit_items vi ON vi.visit_id=v.id ${productLineFilter} WHERE ${where}`,[...vals]);

  const repPerformance=await query(`SELECT u.id rep_id,u.name rep_name,p.name assigned_product,
    count(DISTINCT v.id)::int visits,count(DISTINCT v.doctor_id)::int unique_doctors,
    count(DISTINCT v.id) FILTER(WHERE v.status='completed')::int completed_visits,
    COALESCE(sum(vi.quantity) FILTER(WHERE vi.kind='sample'),0)::int samples,
    COALESCE(sum(vi.quantity) FILTER(WHERE vi.kind='order'),0)::int orders,
    max(v.visited_at) last_visit
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id
    LEFT JOIN products p ON p.id=u.assigned_product_id LEFT JOIN visit_items vi ON vi.visit_id=v.id ${productLineFilter}
    WHERE ${where} GROUP BY u.id,u.name,p.name ORDER BY visits DESC,u.name`,[...vals]);

  const visits=await query(`SELECT v.id,v.visited_at,v.status,v.notes,u.id rep_id,u.name rep_name,d.id doctor_id,d.name doctor_name,d.clinic_name,d.city,
    COALESCE(sum(vi.quantity) FILTER(WHERE vi.kind='sample'),0)::int samples,
    COALESCE(sum(vi.quantity) FILTER(WHERE vi.kind='order'),0)::int orders,
    COALESCE(string_agg(DISTINCT p.name, '، ') FILTER(WHERE vi.kind='sample'),'') sample_products,
    COALESCE(string_agg(DISTINCT p.name, '، ') FILTER(WHERE vi.kind='order'),'') order_products,
    COALESCE((SELECT string_agg(x.label, '، ' ORDER BY x.name)
      FROM (SELECT DISTINCT pp.name, pp.name || ' · ' || CASE vp.reaction WHEN 'interested' THEN 'مهتم' WHEN 'not_interested' THEN 'غير مهتم' ELSE 'محايد' END label
        FROM visit_presented_products vp JOIN products pp ON pp.id=vp.product_id WHERE vp.visit_id=v.id${presentedReportFilter}) x),'') presented_products
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id
    LEFT JOIN visit_items vi ON vi.visit_id=v.id ${productLineFilter} LEFT JOIN products p ON p.id=vi.product_id
    WHERE ${where} GROUP BY v.id,u.id,u.name,d.id,d.name,d.clinic_name,d.city ORDER BY v.visited_at DESC LIMIT 1000`,[...vals]);

  const products=await query(`WITH item_product AS (
      SELECT vi.visit_id,vi.product_id,
        COALESCE(sum(vi.quantity) FILTER(WHERE vi.kind='sample'),0)::int samples,
        COALESCE(sum(vi.quantity) FILTER(WHERE vi.kind='order'),0)::int orders,
        0::int presented,0::int interested,0::int neutral,0::int not_interested
      FROM visit_items vi GROUP BY vi.visit_id,vi.product_id
    ), presented_product AS (
      SELECT vp.visit_id,vp.product_id,0::int samples,0::int orders,
        count(*)::int presented,
        count(*) FILTER(WHERE vp.reaction='interested')::int interested,
        count(*) FILTER(WHERE vp.reaction='neutral')::int neutral,
        count(*) FILTER(WHERE vp.reaction='not_interested')::int not_interested
      FROM visit_presented_products vp GROUP BY vp.visit_id,vp.product_id
    ), c AS (
      SELECT * FROM item_product UNION ALL SELECT * FROM presented_product
    )
    SELECT p.id product_id,p.name product_name,
      count(DISTINCT v.id)::int visits,count(DISTINCT v.sales_rep_id)::int reps,count(DISTINCT v.doctor_id)::int doctors,
      COALESCE(sum(c.samples),0)::int samples,COALESCE(sum(c.orders),0)::int orders,
      COALESCE(sum(c.presented),0)::int presented,COALESCE(sum(c.interested),0)::int interested,
      COALESCE(sum(c.neutral),0)::int neutral,COALESCE(sum(c.not_interested),0)::int not_interested,
      max(v.visited_at) last_activity
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id
    JOIN c ON c.visit_id=v.id JOIN products p ON p.id=c.product_id
    WHERE ${where} ${productReportFilter} GROUP BY p.id,p.name ORDER BY samples DESC,presented DESC,orders DESC,p.name`,[...vals]);

  const samples=await query(`SELECT vi.id,v.visited_at,u.id rep_id,u.name rep_name,d.id doctor_id,d.name doctor_name,d.clinic_name,d.city,p.id product_id,p.name product_name,vi.quantity,vi.sample_purpose
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id
    JOIN visit_items vi ON vi.visit_id=v.id AND vi.kind='sample' JOIN products p ON p.id=vi.product_id
    WHERE ${where} ${productLineFilter} ORDER BY v.visited_at DESC LIMIT 2000`,[...vals]);

  const sampleDoctors=await query(`SELECT d.id doctor_id,d.name doctor_name,d.clinic_name,d.city,
    count(DISTINCT v.id)::int sample_visits,COALESCE(sum(vi.quantity),0)::int samples,
    count(DISTINCT vi.product_id)::int products_count,string_agg(DISTINCT p.name,'، ' ORDER BY p.name) products,
    string_agg(DISTINCT u.name,'، ' ORDER BY u.name) reps,max(v.visited_at) last_sample
    FROM visits v JOIN users u ON u.id=v.sales_rep_id JOIN doctors d ON d.id=v.doctor_id
    JOIN visit_items vi ON vi.visit_id=v.id AND vi.kind='sample' JOIN products p ON p.id=vi.product_id
    WHERE ${where} ${productLineFilter} GROUP BY d.id,d.name,d.clinic_name,d.city ORDER BY samples DESC,d.name`,[...vals]);

  const coverageVals:unknown[]=[];const coverageConds:string[]=["u.role='sales_rep'", "u.active=true"];const coverageVisitConds:string[]=[];
  const addCoverage=(sql:string,value:unknown)=>{coverageVals.push(value);return sql.replace("?",`$${coverageVals.length}`)};
  if(repId)coverageConds.push(addCoverage("u.id=?",repId));
  if(city)coverageConds.push(addCoverage("d.city=?",city));
  if(search){const s=addCoverage("LIKE ?",`%${search}%`);coverageConds.push(`(LOWER(u.name) ${s} OR LOWER(d.name) ${s} OR LOWER(COALESCE(d.clinic_name,'')) ${s} OR LOWER(COALESCE(d.city,'')) ${s})`)}
  const riyadhToday=riyadhDateParts().date;
  const coverageDateFrom=from||`${riyadhToday.slice(0,7)}-01`;
  const coverageDateTo=to||riyadhToday;
  coverageVals.push(coverageDateFrom,coverageDateTo);const cFrom=coverageVals.length-1,cTo=coverageVals.length;
  coverageVisitConds.push(`(v.visited_at AT TIME ZONE 'Asia/Riyadh')::date >= $${cFrom}::date`,`(v.visited_at AT TIME ZONE 'Asia/Riyadh')::date <= $${cTo}::date`);
  if(status)coverageVisitConds.push(addCoverage("v.status=?",status));
  if(productId){const pp=addCoverage("vpf.product_id=?",productId);coverageVisitConds.push(`(EXISTS(SELECT 1 FROM visit_items vpf WHERE vpf.visit_id=v.id AND ${pp}) OR EXISTS(SELECT 1 FROM visit_presented_products vpf WHERE vpf.visit_id=v.id AND ${pp}))`)}
  const coverage=await query(`SELECT d.id doctor_id,d.name doctor_name,d.clinic_name,d.city,d.classification,u.id rep_id,u.name rep_name,COALESCE((SELECT visits_per_month FROM plan_frequencies pf WHERE pf.classification=d.classification),0)::int monthly_target,COUNT(v.id)::int actual_visits,MAX(v.visited_at) last_visit FROM doctors d CROSS JOIN users u LEFT JOIN visits v ON v.doctor_id=d.id AND v.sales_rep_id=u.id AND ${coverageVisitConds.join(' AND ')} WHERE ${coverageConds.join(' AND ')} GROUP BY d.id,d.name,d.clinic_name,d.city,d.classification,u.id,u.name ORDER BY d.classification,d.name`,coverageVals);
  const salesVals:unknown[]=[];const salesWhere:string[]=["u.role='sales_rep'","u.active=true"];let si=1;
  if(repId){salesVals.push(repId);salesWhere.push(`u.id=$${si++}`)}
  if(search){salesVals.push(`%${search}%`);salesWhere.push(`LOWER(u.name) LIKE $${si++}`)}
  const salesRiyadhYear=riyadhDateParts().date.slice(0,4);
  const salesDateFrom=from||`${salesRiyadhYear}-01-01`,salesDateTo=to||`${salesRiyadhYear}-12-31`;
  salesVals.push(salesDateFrom,salesDateTo);const sf=si++,st=si++;const sales=await query(`SELECT u.id rep_id,u.name rep_name,u.annual_sales_target,COALESCE(sum(s.amount),0)::numeric achieved, GREATEST(u.annual_sales_target-COALESCE(sum(s.amount),0),0)::numeric remaining FROM users u LEFT JOIN rep_monthly_sales s ON s.rep_id=u.id AND s.sale_month >= $${sf}::date AND s.sale_month < ($${st}::date + interval '1 day') WHERE ${salesWhere.join(' AND ')} GROUP BY u.id,u.name,u.annual_sales_target ORDER BY remaining DESC`,salesVals);
  const complianceVals:unknown[]=[from||`${riyadhDateParts().date.slice(0,7)}-01`,to||riyadhDateParts().date];let compIndex=3;const complianceWhere:string[]=["u.role='sales_rep'","u.active=true"];const compliancePlanFilters:string[]=[];const complianceVisitFilters:string[]=[];
  if(repId){complianceWhere.push(`u.id=$${compIndex}`);complianceVals.push(repId);compIndex++}
  if(search){complianceWhere.push(`LOWER(u.name) LIKE $${compIndex}`);complianceVals.push(`%${search}%`);compIndex++}
  if(city){compliancePlanFilters.push(`EXISTS(SELECT 1 FROM doctors cpd WHERE cpd.id=pi.doctor_id AND cpd.city=$${compIndex})`);complianceVals.push(city);compIndex++;complianceVisitFilters.push(`cdv.city=$${compIndex-1}`)}
  if(productId){compliancePlanFilters.push(`pi.product_id=$${compIndex}`);complianceVals.push(productId);compIndex++;complianceVisitFilters.push(`(EXISTS(SELECT 1 FROM visit_items cvf WHERE cvf.visit_id=v.id AND cvf.product_id=$${compIndex-1}) OR EXISTS(SELECT 1 FROM visit_presented_products cvf WHERE cvf.visit_id=v.id AND cvf.product_id=$${compIndex-1}))`)}
  if(status){complianceVisitFilters.push(`v.status=$${compIndex}`);complianceVals.push(status);compIndex++}
  const compliance=await query(`SELECT u.id rep_id,u.name rep_name,COUNT(pi.id)::int planned,COUNT(pi.id) FILTER(WHERE EXISTS(SELECT 1 FROM visits v JOIN doctors cdv ON cdv.id=v.doctor_id WHERE v.doctor_id=pi.doctor_id AND v.sales_rep_id=u.id AND (v.visited_at AT TIME ZONE 'Asia/Riyadh')::date=pi.planned_date${complianceVisitFilters.length?' AND '+complianceVisitFilters.join(' AND '):''}))::int completed FROM users u LEFT JOIN plans pl ON pl.user_id=u.id AND pl.status='approved' LEFT JOIN plan_items pi ON pi.plan_id=pl.id AND pi.planned_date >= $1::date AND pi.planned_date <= $2::date${compliancePlanFilters.length?' AND '+compliancePlanFilters.join(' AND '):''} WHERE ${complianceWhere.join(' AND ')} GROUP BY u.id,u.name ORDER BY u.name`,complianceVals);
  return {totals:totals.rows[0],repPerformance:repPerformance.rows,visits:visits.rows,products:products.rows,samples:samples.rows,sampleDoctors:sampleDoctors.rows,coverage:coverage.rows,sales:sales.rows,compliance:compliance.rows};
}

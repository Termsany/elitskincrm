# Forecast API contract

The authoritative types and date/line policies live in `src/lib/forecast-contract.ts`.

- Rep GET `/api/forecast?month=YYYY-MM`: scoped clinics/products, monthly prices, versioned forecast rows, targets, sales, quantity/value summaries, late and closed flags. POST `/api/forecast`: save/submit/request_change with positive clinic/product lines and a reason for changes. Historical forecasts are read-only.
- Rep POST `/api/forecast/sales`: sale, source-linked return or signed adjustment. Manager approval is required before quantities and values count. GET `/api/forecast/sales?month=YYYY-MM` lists the rep own approved original sales for prior-month settlement.
- Admin GET `/api/admin/forecast?month=YYYY-MM`: review queues, prices, targets, team standings, approved sales/forecast lines for the report, closed state and overdue review counts. POST handles review/edit approval, late exceptions, clinic-product prices, official targets, sales decisions, and guarded close.
- Admin GET/POST `/api/admin/forecast/clinics`: independent clinic records and explicit doctor linking; no name-based auto merge.

Prices and target edits retain snapshots; a target edit records old/new quantity and price in forecast events. The legacy manually entered `rep_monthly_sales` remains separate from this module to avoid double counting.

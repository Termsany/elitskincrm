# «الميدان» — Elite Skin CRM

The owner calls this app **«الميدان»** (al-Midan). The other app is **«المالية»** (al-Maliya).
When a request starts with «في الميدان», the work belongs here. When it says «في المالية», it belongs in
`Termsany/finance-Eliteskin` (finance.eliteskinsa.com), not here. If a request names neither and it isn't
obvious, ask which app before changing anything.

- Address: crm.eliteskinsa.com · repo `Termsany/elitskincrm` · deploys to the VPS on every push to `main`
- Users: the reps, the sales manager and the owner
- Belongs here: visits, doctors and clinics, plans, the sales hub (Daftra sales, team targets, goals,
  month plan, collection for the reps), rep expenses and custody, the library, requests and leave,
  settings and password change, dark mode
- Does NOT belong here: the company's books — customers/suppliers statements, company expenses,
  profit and loss, VAT, cash forecast, pricing, account audit. Those live in «المالية».
  `/accounts` only redirects there; don't rebuild accounting screens in this app.
- `src/lib/finance.ts` and `src/lib/daftra.ts` are copies used by the sales hub only. Accounting fixes go to
  «المالية»; port a fix here only when the sales hub needs it.

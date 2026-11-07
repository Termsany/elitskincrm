/** Today in Riyadh as YYYY-MM-DD (the business day everywhere in the CRM). */
export const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());

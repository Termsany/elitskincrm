import { redirect } from "next/navigation";
// Forecasts, sales entry and target distribution now live inside the sales hub.
export default function ForecastPage() { redirect("/sales?tab=workspace"); }

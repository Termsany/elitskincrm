"use client";
import RepSales from "./RepSales";
import AdminSales from "./AdminSales";

type Opt = { id: string; name: string };
type Tab = "overview" | "workspace";

/** Reps get one clear, task-driven page; the admin keeps the team console. */
export default function SalesHub(props: { isAdmin: boolean; reps: Opt[]; initialTab?: Tab }) {
  return props.isAdmin ? <AdminSales /> : <RepSales />;
}

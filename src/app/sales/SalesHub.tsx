"use client";
import RepSales from "./RepSales";
import AdminSales from "./AdminSales";

/** Reps get one clear, task-driven page; the sales manager keeps the team console. */
export default function SalesHub({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? <AdminSales /> : <RepSales />;
}

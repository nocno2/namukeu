import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Login page doesn't need auth check
  // This layout applies to all admin routes
  return <>{children}</>;
}

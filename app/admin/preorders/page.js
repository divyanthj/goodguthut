import { redirect } from "next/navigation";

export default function AdminPreordersRedirectPage() {
  redirect("/admin/orders");
}

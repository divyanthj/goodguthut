import { redirect } from "next/navigation";

export default function AdminSubscriptionsRedirectPage() {
  redirect("/admin/orders");
}

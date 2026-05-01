import Link from "next/link";

export default function AdminNav({ active = "settings" }) {
  const settingsClass = active === "settings" ? "btn btn-primary" : "btn btn-ghost";
  const discountsClass = active === "discounts" ? "btn btn-primary" : "btn btn-ghost";
  const ordersClass = active === "orders" ? "btn btn-primary" : "btn btn-ghost";
  const invoicesClass = active === "invoices" ? "btn btn-primary" : "btn btn-ghost";
  const productionClass = active === "production" ? "btn btn-primary" : "btn btn-ghost";
  const routePlannerClass = active === "route-planner" ? "btn btn-primary" : "btn btn-ghost";

  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/admin" className={settingsClass}>
        Settings
      </Link>
      <Link href="/admin/orders" className={ordersClass}>
        Orders
      </Link>
      <Link href="/admin/invoices" className={invoicesClass}>
        Invoices
      </Link>
      <Link href="/admin/route-planner" className={routePlannerClass}>
        Route planner
      </Link>
      <Link href="/admin/production" className={productionClass}>
        Production
      </Link>
      <Link href="/admin/discount-codes" className={discountsClass}>
        Discounts
      </Link>
    </div>
  );
}

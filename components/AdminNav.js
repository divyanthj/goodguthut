import Link from "next/link";

export default function AdminNav({ active = "settings" }) {
  const settingsClass = active === "settings" ? "btn btn-primary" : "btn btn-ghost";
  const preordersClass = active === "preorders" ? "btn btn-primary" : "btn btn-ghost";
  const discountsClass = active === "discounts" ? "btn btn-primary" : "btn btn-ghost";

  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/admin" className={settingsClass}>
        Settings
      </Link>
      <Link href="/admin/preorders" className={preordersClass}>
        Preorders
      </Link>
      <Link href="/admin/discount-codes" className={discountsClass}>
        Discounts
      </Link>
    </div>
  );
}

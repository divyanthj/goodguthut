"use client";

export function AdminSettingsAccordionItem({
  title,
  description,
  badges = [],
  children,
  defaultOpen = false,
}) {
  return (
    <details className="group rounded-2xl bg-base-100 shadow-md" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm opacity-70">{description}</p>}
        </div>
        <div className="flex items-center gap-3">
          {badges.length > 0 && (
            <div className="hidden flex-wrap gap-2 md:flex">
              {badges.map((badge) => (
                <span key={badge} className="badge badge-outline">
                  {badge}
                </span>
              ))}
            </div>
          )}
          <span className="rounded-full border border-base-300 px-3 py-1 text-sm font-semibold">
            <span className="group-open:hidden">Open</span>
            <span className="hidden group-open:inline">Close</span>
          </span>
        </div>
      </summary>
      <div className="border-t border-base-200 p-5 pt-4">{children}</div>
    </details>
  );
}

export default function AdminSettingsAccordion({ children }) {
  return <div className="space-y-4">{children}</div>;
}


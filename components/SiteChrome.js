"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import config from "@/config";

const isAdminPath = (pathname = "") => pathname.startsWith("/admin");

export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const showAdminLink = Boolean(session?.user?.isAdmin);
  const showLogout = status === "authenticated";

  return (
    <div className="flex min-h-screen flex-col bg-base-200">
      <header className="border-b border-base-300 bg-base-100/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div>
            <Link href="/" className="text-lg font-black tracking-[0.24em] text-primary">
              GGH
            </Link>
            <div className="text-xs uppercase tracking-[0.18em] opacity-60">
              The Good Gut Hut
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showAdminLink && (
              <Link
                href="/admin"
                className={`btn btn-sm ${isAdminPath(pathname) ? "btn-primary" : "btn-ghost"}`}
              >
                Admin
              </Link>
            )}
            {showLogout && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-base-300 bg-base-100">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm opacity-75 md:flex-row md:items-center md:justify-between md:px-6">
          <div>{config.appName}</div>
          <div>Small-batch fermented drinks, preorder by preorder.</div>
        </div>
      </footer>
    </div>
  );
}

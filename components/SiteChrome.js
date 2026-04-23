"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import config from "@/config";
import logo from "@/app/logo.jpg";

const isAdminPath = (pathname = "") => pathname.startsWith("/admin");

export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const showAdminLink = Boolean(session?.user?.isAdmin);
  const showLogout = status === "authenticated";

  return (
    <div className="flex min-h-screen flex-col bg-base-200">
      <header className="site-chrome-header border-b border-base-300 bg-base-100/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-2.5 md:px-6">
          <div className="min-w-0">
            <Link
              href="/"
              className="inline-flex items-center gap-3"
              aria-label={`${config.appName} homepage`}
            >
              <Image
                src={logo}
                alt={`${config.appName} logo`}
                priority
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
              <span className="truncate text-sm font-bold uppercase tracking-[0.18em] text-primary md:text-base">
                The Good Gut Hut
              </span>
            </Link>
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

      <footer className="site-chrome-footer border-t border-base-300 bg-base-200 text-base-content">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-14 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:px-8">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-3" aria-label={`${config.appName} homepage`}>
              <Image
                src={logo}
                alt={`${config.appName} logo`}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
              <strong className="text-base font-bold tracking-tight text-base-content">
                {config.appName}
              </strong>
            </Link>
            <p className="mt-4 text-sm leading-6 text-base-content/75">
              Slowly brewed, small-batch fermented drinks made with care.
            </p>
            <p className="mt-4 text-sm text-base-content/60">
              Copyright © {new Date().getFullYear()} - All rights reserved
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-base-content/60">
              Links
            </div>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <Link href="/#lineup" className="transition hover:text-primary">
                Lineup
              </Link>
              <Link href="/#order-flow" className="transition hover:text-primary">
                Order
              </Link>
              {config.mailgun.supportEmail && (
                <a
                  href={`mailto:${config.mailgun.supportEmail}`}
                  className="transition hover:text-primary"
                >
                  Contact
                </a>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-base-content/60">
              Legal
            </div>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <Link href="/tos" className="transition hover:text-primary">
                Terms and Conditions
              </Link>
              <Link href="/privacy-policy" className="transition hover:text-primary">
                Privacy Policy
              </Link>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-base-content/60">
              Social
            </div>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <a
                href="https://instagram.com/goodguthut"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-primary"
              >
                Instagram
              </a>
              <a
                href="https://thinkinpublic.app/thinker/goodguthut"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-primary"
              >
                Think in Public
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61584966604788"
                target="_blank"
                rel="noreferrer"
                className="transition hover:text-primary"
              >
                Facebook
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import config from "@/config";
import logo from "@/app/logo.jpg";

const isAdminPath = (pathname = "") => pathname.startsWith("/admin");
const SUPPORT_PHONE_WHATSAPP = "919916331569";
const whatsappHref = `https://wa.me/${SUPPORT_PHONE_WHATSAPP}?text=${encodeURIComponent(
  "Hi Good Gut Hut, I would like to know more about your ferments."
)}`;

const publicLinks = [
  { href: "/#products", label: "Products" },
  { href: "/#subscriptions", label: "Subscriptions" },
  { href: "/track-order", label: "Track Order" },
  { href: "/blog", label: "Learn" },
  { href: "/#about", label: "About Us" },
  { href: "/#contact", label: "Contact" },
];

export default function SiteChrome({ children }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const showAdminLink = Boolean(session?.user?.isAdmin);
  const showLogout = status === "authenticated";
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-base-200">
      <header className="site-chrome-header sticky top-0 z-50 border-b border-[#ddcfb6] bg-[#fffdf8]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-6 md:px-8">
          <div className="min-w-0 shrink-0">
            <Link
              href="/"
              className="flex min-h-11 items-center gap-3"
              aria-label={`${config.appName} homepage`}
              onClick={closeMenu}
            >
              <Image
                src={logo}
                alt={`${config.appName} logo`}
                priority
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
              <span className="hidden whitespace-nowrap text-sm font-bold uppercase tracking-[0.18em] text-primary xl:inline">
                The Good Gut Hut
              </span>
              <span className="hidden whitespace-nowrap text-sm font-bold uppercase tracking-[0.18em] text-primary lg:inline xl:hidden">
                GGH
              </span>
            </Link>
          </div>

          <nav className="hidden flex-1 items-center justify-center gap-6 text-sm font-semibold text-[#40584c] xl:flex" aria-label="Main navigation">
            {publicLinks.map((link) => (
              <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center whitespace-nowrap transition hover:text-primary">
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm min-h-11 border-[#c97754] bg-[#fff4ed] text-[#7a3f28] hover:border-[#c97754] hover:bg-[#ffe9db]"
            >
              WhatsApp
            </a>
            <Link href="/#order-flow" className="btn btn-sm btn-primary min-h-11">
              Cart
            </Link>
            {showAdminLink && (
              <Link
                href="/admin"
                className={`btn btn-sm ${isAdminPath(pathname) ? "btn-primary" : "btn-ghost"} hidden xl:inline-flex`}
              >
                Admin
              </Link>
            )}
            {showLogout && (
              <button
                type="button"
                className="btn btn-sm btn-outline hidden xl:inline-flex"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Logout
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-sm min-h-11 min-w-[72px] border-[#d1c4b0] bg-[#fffdf8] text-[#355a45] xl:hidden"
            onClick={() => setIsMenuOpen((current) => !current)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-site-menu"
          >
            {isMenuOpen ? "Close" : "Menu"}
          </button>
        </div>

        {isMenuOpen && (
          <div id="mobile-site-menu" className="max-h-[calc(100dvh-69px)] overflow-y-auto overscroll-contain border-t border-[#ddcfb6] bg-[#fffdf8] px-4 py-3 xl:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 text-base font-semibold text-[#40584c]" aria-label="Mobile navigation">
              {publicLinks.map((link) => (
                <Link key={link.href} href={link.href} className="flex min-h-11 items-center rounded-lg px-3 py-2 hover:bg-[#f8f4ea]" onClick={closeMenu}>
                  {link.label}
                </Link>
              ))}
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-11 items-center rounded-lg px-3 py-2 hover:bg-[#f8f4ea]"
                onClick={closeMenu}
              >
                WhatsApp
              </a>
              <Link href="/#order-flow" className="flex min-h-11 items-center rounded-lg px-3 py-2 hover:bg-[#f8f4ea]" onClick={closeMenu}>
                Cart
              </Link>
              {showAdminLink && (
                <Link href="/admin" className="flex min-h-11 items-center rounded-lg px-3 py-2 hover:bg-[#f8f4ea]" onClick={closeMenu}>
                  Admin
                </Link>
              )}
              {showLogout && (
                <button
                  type="button"
                  className="flex min-h-11 items-center rounded-lg px-3 py-2 text-left hover:bg-[#f8f4ea]"
                  onClick={() => {
                    closeMenu();
                    signOut({ callbackUrl: "/" });
                  }}
                >
                  Logout
                </button>
              )}
            </nav>
          </div>
        )}
      </header>

      <div className="min-w-0 flex-1">{children}</div>

      <footer className="site-chrome-footer border-t border-[#ddcfb6] bg-[#f7f1e6] text-base-content">
        <div className="mx-auto grid min-w-0 max-w-6xl grid-cols-1 gap-8 px-4 py-10 text-center sm:grid-cols-2 md:gap-12 md:px-8 md:py-14 md:text-left lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
          <div className="mx-auto max-w-xs md:mx-0">
            <Link href="/" className="flex min-h-11 items-center justify-center gap-3 md:justify-start" aria-label={`${config.appName} homepage`}>
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
              Slowly brewed kanji, sparkle, pickles, and gut-friendly packs made with care.
            </p>
            <p className="mt-4 text-sm text-base-content/60">
              Copyright {new Date().getFullYear()} - All rights reserved
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-base-content/60">
              Links
            </div>
            <div className="mt-4 flex flex-col items-center gap-3 text-sm md:items-start">
              <Link href="/#products" className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0">
                Products
              </Link>
              <Link href="/#subscriptions" className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0">
                Subscriptions
              </Link>
              <Link href="/track-order" className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0">
                Track Order
              </Link>
              <Link href="/#about" className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0">
                About Us
              </Link>
              <Link href="/#order-flow" className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0">
                Cart
              </Link>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-base-content/60">
              Legal
            </div>
            <div className="mt-4 flex flex-col items-center gap-3 text-sm md:items-start">
              <Link href="/tos" className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0">
                Terms and Conditions
              </Link>
              <Link href="/privacy-policy" className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0">
                Privacy Policy
              </Link>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-base-content/60">
              Contact
            </div>
            <div className="mt-4 flex flex-col items-center gap-3 text-sm md:items-start">
              <a href={whatsappHref} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0">
                WhatsApp
              </a>
              {config.mailgun.supportEmail && (
                <a href={`mailto:${config.mailgun.supportEmail}`} className="inline-flex min-h-11 max-w-full items-center break-all px-2 transition hover:text-primary md:min-h-0 md:px-0">
                  {config.mailgun.supportEmail}
                </a>
              )}
              <a
                href="https://instagram.com/goodguthut"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0"
              >
                Instagram
              </a>
              <a
                href="https://thinkinpublic.app/thinker/goodguthut"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0"
              >
                Think in Public
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61590344084615"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center px-2 transition hover:text-primary md:min-h-0 md:px-0"
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

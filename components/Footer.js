import Link from "next/link";
import Image from "next/image";
import config from "@/config";
import logo from "@/app/logo.jpg";

const Footer = () => {
  return (
    <footer className="border-t border-base-300 bg-base-200 text-base-content">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-14 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:px-8">
        <div className="max-w-xs">
          <Link href="/" aria-current="page" className="flex items-center gap-3">
            <Image
              src={logo}
              alt={`${config.appName} logo`}
              priority={true}
              className="h-10 w-10 rounded-full object-cover"
              width={40}
              height={40}
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
            <Link href="/#preorder" className="transition hover:text-primary">
              Preorder
            </Link>
            
              <a
                href={`mailto:hello@goodguthut.com`}
                className="transition hover:text-primary"
              >
                Contact
              </a>
            
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
  );
};

export default Footer;

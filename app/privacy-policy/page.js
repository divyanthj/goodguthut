import Link from "next/link";
import { getSEOTags } from "@/libs/seo";
import config from "@/config";

export const metadata = getSEOTags({
  title: `Privacy Policy | ${config.appName}`,
  canonicalUrlRelative: "/privacy-policy",
});

const PrivacyPolicy = () => {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 md:px-6 md:py-12">
      <div className="rounded-3xl bg-base-100 p-6 shadow-md md:p-8">
        <Link href="/" className="btn btn-ghost">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M15 10a.75.75 0 01-.75.75H7.612l2.158 1.96a.75.75 0 11-1.04 1.08l-3.5-3.25a.75.75 0 010-1.08l3.5-3.25a.75.75 0 111.04 1.08L7.612 9.25h6.638A.75.75 0 0115 10z"
              clipRule="evenodd"
            />
          </svg>{" "}
          Back
        </Link>

        <h1 className="pb-6 text-3xl font-extrabold">
          Privacy Policy for {config.appName}
        </h1>

        <div className="space-y-6 text-sm leading-7 text-base-content/80 md:text-base">
          <p>Last updated: March 13, 2026</p>
          <p>
            This Privacy Policy explains how {config.appName} collects, uses,
            and protects information when you browse our website, contact us, or
            place a preorder.
          </p>

          <section>
            <h2 className="text-lg font-bold text-base-content">Information we collect</h2>
            <p className="mt-2">
              We may collect personal information you provide directly, such as
              your name, phone number, email address, delivery details,
              preorder details, and payment-related information needed to
              process an order.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">How we use information</h2>
            <p className="mt-2">
              We use information to manage preorders, coordinate delivery or
              pickup, respond to questions, improve our services, and send
              important updates about your order or our batches.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Cookies and analytics</h2>
            <p className="mt-2">
              We may use cookies or similar technologies to understand site
              usage, improve performance, and maintain basic website
              functionality.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Sharing of information</h2>
            <p className="mt-2">
              We do not sell your personal information. We may share limited
              information with service providers that help us operate the
              website, process payments, or fulfill deliveries, but only as
              needed to provide those services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Data retention</h2>
            <p className="mt-2">
              We keep information only for as long as reasonably necessary to
              operate our business, fulfill orders, maintain records, and comply
              with legal or accounting obligations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Your choices</h2>
            <p className="mt-2">
              You may contact us to ask about the personal information you have
              shared with us, or to request corrections where appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Updates to this policy</h2>
            <p className="mt-2">
              We may update this Privacy Policy from time to time. Any changes
              will be posted on this page with the latest update date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Contact</h2>
            <p className="mt-2">
              If you have questions about this Privacy Policy, contact us at{" "}
              <a
                href={`mailto:${config.mailgun.supportEmail}`}
                className="link link-primary"
              >
                {config.mailgun.supportEmail}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
};

export default PrivacyPolicy;

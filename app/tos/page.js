import Link from "next/link";
import { getSEOTags } from "@/libs/seo";
import config from "@/config";

export const metadata = getSEOTags({
  title: `Terms and Conditions | ${config.appName}`,
  canonicalUrlRelative: "/tos",
});

const TOS = () => {
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
          </svg>
          Back
        </Link>

        <h1 className="pb-6 text-3xl font-extrabold">
          Terms and Conditions for {config.appName}
        </h1>

        <div className="space-y-6 text-sm leading-7 text-base-content/80 md:text-base">
          <p>Last updated: March 13, 2026</p>
          <p>
            These Terms and Conditions govern your use of {config.appName},
            including our website, preorder forms, and related communications.
            By using the site or placing a preorder, you agree to these terms.
          </p>

          <section>
            <h2 className="text-lg font-bold text-base-content">Use of the site</h2>
            <p className="mt-2">
              You may use this site to learn about our products, submit preorder
              requests, and contact us. You agree not to misuse the site,
              interfere with its operation, or provide false information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Products and preorders</h2>
            <p className="mt-2">
              Product availability, pricing, batch schedules, and delivery
              windows may change. A preorder request does not guarantee
              acceptance until we confirm it. We may limit quantities, decline
              requests, or cancel a batch if needed for operational, safety, or
              availability reasons.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Payments and fulfillment</h2>
            <p className="mt-2">
              If payment is collected, you agree to provide accurate billing and
              delivery information. Delivery times are estimates and may vary.
              If a preorder cannot be fulfilled, we may contact you with an
              update, substitute options if appropriate, or arrange a refund
              where applicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Intellectual property</h2>
            <p className="mt-2">
              All branding, images, copy, and site content remain the property
              of {config.appName} unless stated otherwise. You may not reuse or
              reproduce them without permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Limitation of liability</h2>
            <p className="mt-2">
              We aim to keep the information on this site accurate and current,
              but we do not guarantee that the site will always be uninterrupted
              or error-free. To the fullest extent permitted by law, we are not
              liable for indirect or incidental losses arising from use of the
              site or delays in fulfillment.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Changes to these terms</h2>
            <p className="mt-2">
              We may revise these Terms and Conditions from time to time.
              Updated versions will be posted on this page and take effect when
              published.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-base-content">Contact</h2>
            <p className="mt-2">
              For questions about these terms, contact us at{" "}
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

export default TOS;

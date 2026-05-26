import Image from "next/image";
import config from "@/config";
import connectMongo from "@/libs/mongoose";
import { createRazorpayPaymentLink } from "@/libs/razorpay";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";
import PaymentRedirectClient from "./PaymentRedirectClient";

export const dynamic = "force-dynamic";

const FALLBACK_TITLE = "Good Gut Hut payment";
const FALLBACK_DESCRIPTION = "Complete your Good Gut Hut payment securely.";

const isValidKind = (kind = "") => ["order", "preorder"].includes(kind);

const isPendingPaymentOrSetup = (record = {}) => {
  const paymentStatus = String(record.payment?.status || "").trim();

  if (record.mode === "recurring") {
    return paymentStatus === "created";
  }

  return ["pending", "order_created", "created"].includes(paymentStatus);
};

const getRecord = async ({ kind, id }) => {
  if (!isValidKind(kind) || !id) {
    return null;
  }

  await connectMongo();

  return kind === "preorder" ? Preorder.findById(id) : OrderPlan.findById(id);
};

const getRecordFields = ({ kind, record }) => {
  if (!record) {
    return null;
  }

  if (kind === "preorder") {
    return {
      id: record.id,
      name: record.customerName || "",
      email: record.email || "",
      phone: record.phone || "",
      orderNumber: record.orderNumber || "",
      total: Number(record.total || record.payment?.amount || 0),
      currency: record.currency || record.payment?.currency || "INR",
      sourceType: "legacy_preorder",
    };
  }

  return {
    id: record.id,
    name: record.name || "",
    email: record.email || "",
    phone: record.phone || "",
    orderNumber: record.orderNumber || "",
    total: Number(record.total || record.payment?.amount || 0),
    currency: record.currency || record.payment?.currency || "INR",
    sourceType: "order_plan",
  };
};

const ensurePaymentLink = async ({ kind, record }) => {
  if (record.payment?.shortUrl) {
    return record.payment.shortUrl;
  }

  if (!isPendingPaymentOrSetup(record) || record.mode === "recurring") {
    return "";
  }

  if (record.payment?.provider !== "razorpay") {
    return "";
  }

  const fields = getRecordFields({ kind, record });
  const shortOrderId = String(fields.id || "").slice(-10);
  const shortTimestamp = Date.now().toString(36).slice(-8);
  const paymentLink = await createRazorpayPaymentLink({
    amount: Math.round(fields.total * 100),
    currency: fields.currency,
    referenceId: `${kind}_${shortOrderId}_${shortTimestamp}`.slice(0, 40),
    description: `Good Gut Hut ${fields.orderNumber || fields.id}`,
    customer: {
      name: fields.name,
      email: fields.email,
      contact: fields.phone,
    },
    notes: {
      sourceType: fields.sourceType,
      orderPlanId: fields.sourceType === "order_plan" ? fields.id : "",
      preorderId: fields.sourceType === "legacy_preorder" ? fields.id : "",
      razorpayOrderId: record.payment?.orderId || "",
      orderNumber: fields.orderNumber || "",
    },
  });

  record.payment = {
    ...(record.payment?.toObject?.() || record.payment || {}),
    paymentLinkId: paymentLink.id || "",
    shortUrl: paymentLink.short_url || "",
  };
  await record.save();

  return record.payment.shortUrl;
};

const formatCurrency = (currency, amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

const buildMetadata = ({ fields }) => {
  const orderNumber = fields?.orderNumber ? ` ${fields.orderNumber}` : "";
  const title = fields ? `Complete your Good Gut Hut payment${orderNumber}` : FALLBACK_TITLE;
  const description = fields
    ? `Secure payment for ${formatCurrency(fields.currency, fields.total)}. You will continue to Razorpay from Good Gut Hut.`
    : FALLBACK_DESCRIPTION;

  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title,
      description,
      url: `https://${config.domainName}/pay/${fields?.sourceType === "legacy_preorder" ? "preorder" : "order"}/${fields?.id || ""}`,
      siteName: config.appName,
      images: [
        {
          url: `https://${config.domainName}/images/ggh2.png`,
          width: 1200,
          height: 630,
          alt: "Good Gut Hut fermented drinks",
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`https://${config.domainName}/images/ggh2.png`],
    },
  };
};

export async function generateMetadata({ params }) {
  const kind = String(params?.kind || "").trim();
  const id = String(params?.id || "").trim();
  const record = await getRecord({ kind, id }).catch(() => null);
  const fields = getRecordFields({ kind, record });

  return buildMetadata({ fields });
}

export default async function PaymentPage({ params }) {
  const kind = String(params?.kind || "").trim();
  const id = String(params?.id || "").trim();
  const record = await getRecord({ kind, id }).catch(() => null);
  const fields = getRecordFields({ kind, record });
  const paymentUrl = record ? await ensurePaymentLink({ kind, record }).catch(() => "") : "";

  return (
    <main className="min-h-screen bg-[#f4f0e8] px-5 py-8 text-base-content">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center text-center">
        <div className="mb-6 flex items-center gap-3">
          <Image
            src="/images/logo.jpg"
            alt="Good Gut Hut"
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover shadow-md"
            priority
          />
          <div className="text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-60">
              Good Gut Hut
            </p>
            <p className="text-sm font-medium opacity-80">Secure payment handoff</p>
          </div>
        </div>

        <div className="w-full rounded-[2rem] border border-base-300 bg-base-100 p-6 shadow-xl sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Almost there
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-5xl">
            Taking you to secure payment
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base opacity-75 sm:text-lg">
            You are paying Good Gut Hut through Razorpay. The payment page will open
            automatically in a moment.
          </p>

          {fields ? (
            <div className="mx-auto mt-7 grid max-w-lg gap-3 rounded-2xl bg-base-200 p-4 text-left text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] opacity-50">Order</div>
                <div className="mt-1 font-semibold">{fields.orderNumber || fields.id}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] opacity-50">Total</div>
                <div className="mt-1 font-semibold">
                  {formatCurrency(fields.currency, fields.total)}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-7 rounded-2xl bg-base-200 p-4 text-sm opacity-75">
              We could not find this payment request. Please message Good Gut Hut for help.
            </p>
          )}

          {paymentUrl ? (
            <PaymentRedirectClient paymentUrl={paymentUrl} />
          ) : (
            <p className="mt-6 text-sm font-medium text-error">
              This payment link is not available right now.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

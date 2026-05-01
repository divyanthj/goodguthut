import AdminInvoiceSettings from "@/components/AdminInvoiceSettings";
import AdminInvoicesList from "@/components/AdminInvoicesList";
import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import { getAdminSessionState } from "@/libs/admin-auth";
import { getInvoiceSettings } from "@/libs/invoice-settings";
import connectMongo from "@/libs/mongoose";
import Invoice from "@/models/Invoice";
import Sku from "@/models/Sku";

export default async function AdminInvoicesPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to view invoices.</p>
              <AdminLoginButton />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-4">
              <h1 className="card-title text-3xl">Access restricted</h1>
              <p>You are signed in as {session.user.email}.</p>
              <p className="text-error">Your account does not have access to this admin page.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  await connectMongo();
  const [invoiceDocs, invoiceSettings, incompleteSkuCount] = await Promise.all([
    Invoice.find({}).sort({ invoiceDate: -1, createdAt: -1 }).limit(500),
    getInvoiceSettings(),
    Sku.countDocuments({
      status: { $ne: "archived" },
      $or: [{ hsnCode: "" }, { hsnCode: { $exists: false } }, { gstRate: { $lte: 0 } }],
    }),
  ]);
  const invoices = JSON.parse(JSON.stringify(invoiceDocs));
  const settings = JSON.parse(JSON.stringify(invoiceSettings));

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Invoices</h1>
            <p className="mt-2 opacity-75">
              Review delivered-order invoices and resend customer emails.
            </p>
          </div>
          <AdminNav active="invoices" />
        </div>

        <AdminInvoiceSettings
          initialSettings={settings}
          incompleteSkuCount={incompleteSkuCount}
        />

        <AdminInvoicesList initialInvoices={invoices} />
      </div>
    </main>
  );
}

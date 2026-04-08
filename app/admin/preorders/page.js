import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import AdminPreorderConsole from "@/components/AdminPreorderConsole";
import AdminPreordersList from "@/components/AdminPreordersList";
import { getAdminSessionState } from "@/libs/admin-auth";
import { createDefaultPreorderWindow } from "@/libs/preorder-catalog";
import connectMongo from "@/libs/mongoose";
import Preorder from "@/models/Preorder";
import PreorderWindow from "@/models/PreorderWindow";
import { sortPreorderWindows } from "@/libs/preorder-windows";
import { listSkuCatalog } from "@/libs/sku-catalog";

export default async function AdminPreordersPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to access the admin area.</p>
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
              <h1 className="card-title text-3xl">Admin access denied</h1>
              <p>You are signed in as {session.user.email}.</p>
              <p className="text-error">No, you&apos;re not an admin.</p>
              <p className="opacity-70">Add this email address to the <code>ADMINS</code> env variable to grant access.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  await connectMongo();
  const [preorderDocs, preorderWindowDocs, skuCatalogDocs] = await Promise.all([
    Preorder.find({}).sort({ createdAt: -1 }).limit(100),
    PreorderWindow.find({}).sort({
      status: 1,
      deliveryDate: -1,
      updatedAt: -1,
      createdAt: -1,
    }),
    listSkuCatalog(),
  ]);
  const preorders = JSON.parse(JSON.stringify(preorderDocs));
  const initialWindows = sortPreorderWindows(JSON.parse(JSON.stringify(preorderWindowDocs)));
  const initialSkuCatalog = JSON.parse(JSON.stringify(skuCatalogDocs));
  const defaultWindow = createDefaultPreorderWindow();

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Preorders</h1>
            <p className="mt-2 opacity-75">Create and edit preorder batches, then review the latest customer orders and payment state.</p>
          </div>
          <AdminNav active="preorders" />
        </div>

        <AdminPreorderConsole
          initialWindows={initialWindows}
          initialSkuCatalog={initialSkuCatalog}
          defaultWindow={defaultWindow}
          adminEmail={session.user.email}
          view="preorders"
        />

        <AdminPreordersList initialPreorders={preorders} />
      </div>
    </main>
  );
}

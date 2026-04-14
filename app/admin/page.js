import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import AdminSkuCatalogManager from "@/components/AdminSkuCatalogManager";
import AdminSubscriptionCombosManager from "@/components/AdminSubscriptionCombosManager";
import AdminSubscriptionScheduleManager from "@/components/AdminSubscriptionScheduleManager";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import { getSkuMap, listSkuCatalog } from "@/libs/sku-catalog";
import {
  hydrateSubscriptionCombo,
  listSubscriptionCombos,
} from "@/libs/subscription-combos";
import { getSubscriptionSettings } from "@/libs/subscription-settings";

export default async function AdminPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Sign in</h1>
              <p>Sign in with Google to manage delivery days.</p>
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
              <p className="text-error">This account does not have admin access.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  await connectMongo();
  const [settings, skuCatalog, comboDocs] = await Promise.all([
    getSubscriptionSettings(),
    listSkuCatalog(),
    listSubscriptionCombos(),
  ]);
  const skuMap = getSkuMap(skuCatalog);
  const combos = comboDocs.map((combo) => hydrateSubscriptionCombo(combo, skuMap));

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="mt-2 max-w-3xl opacity-75">
              Update delivery days and manage your product catalog.
            </p>
          </div>
          <AdminNav active="settings" />
        </div>

        <AdminSubscriptionScheduleManager
          initialDeliveryDaysOfWeek={settings?.deliveryDaysOfWeek || []}
          initialMinimumLeadDays={Number(settings?.minimumLeadDays || 3)}
        />

        <AdminSkuCatalogManager />

        <AdminSubscriptionCombosManager
          initialCombos={combos}
          initialSkuCatalog={skuCatalog}
        />
      </div>
    </main>
  );
}

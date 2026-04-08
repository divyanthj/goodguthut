import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import AdminSubscriptionCombosManager from "@/components/AdminSubscriptionCombosManager";
import AdminSubscriptionScheduleManager from "@/components/AdminSubscriptionScheduleManager";
import AdminSubscriptionsList from "@/components/AdminSubscriptionsList";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import { listSkuCatalog } from "@/libs/sku-catalog";
import { getSkuMap } from "@/libs/sku-catalog";
import { hydrateSubscriptionCombo, listSubscriptionCombos } from "@/libs/subscription-combos";
import { getSubscriptionSettings } from "@/libs/subscription-settings";
import Subscription from "@/models/Subscription";

export default async function AdminSubscriptionsPage() {
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
  const [subscriptionDocs, skuCatalogDocs, comboDocs, subscriptionSettings] = await Promise.all([
    Subscription.find({}).sort({ createdAt: -1 }).limit(200),
    listSkuCatalog(),
    listSubscriptionCombos(),
    getSubscriptionSettings(),
  ]);
  const skuCatalog = JSON.parse(JSON.stringify(skuCatalogDocs));
  const skuMap = getSkuMap(skuCatalogDocs);
  const combos = comboDocs.map((combo) => hydrateSubscriptionCombo(combo, skuMap));
  const subscriptions = JSON.parse(JSON.stringify(subscriptionDocs));

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Subscriptions</h1>
            <p className="mt-2 opacity-75">
              Review subscription requests, update their lifecycle, and keep subscriber details current.
            </p>
          </div>
          <AdminNav active="subscriptions" />
        </div>

        <AdminSubscriptionScheduleManager
          initialDeliveryDaysOfWeek={subscriptionSettings?.deliveryDaysOfWeek || []}
          initialMinimumLeadDays={Number(subscriptionSettings?.minimumLeadDays || 3)}
        />
        <AdminSubscriptionCombosManager
          initialCombos={combos}
          initialSkuCatalog={skuCatalog}
        />
        <AdminSubscriptionsList initialSubscriptions={subscriptions} />
      </div>
    </main>
  );
}

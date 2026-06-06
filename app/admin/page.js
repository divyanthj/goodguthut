import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import AdminPreorderConsole from "@/components/AdminPreorderConsole";
import AdminSettingsAccordion, {
  AdminSettingsAccordionItem,
} from "@/components/AdminSettingsAccordion";
import AdminSkuCatalogManager from "@/components/AdminSkuCatalogManager";
import AdminSubscriptionCombosManager from "@/components/AdminSubscriptionCombosManager";
import AdminSubscriptionScheduleManager from "@/components/AdminSubscriptionScheduleManager";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import { createDefaultPreorderWindow } from "@/libs/preorder-catalog";
import { getSkuMap, listSkuCatalog } from "@/libs/sku-catalog";
import {
  formatDeliveryDaysOfWeek,
} from "@/libs/subscription-delivery-days";
import {
  hydrateSubscriptionCombo,
  listSubscriptionCombos,
} from "@/libs/subscription-combos";
import { formatMinimumLeadDays } from "@/libs/subscription-schedule";
import {
  getSettingsCategoryLeadTimes,
  getSubscriptionSettings,
} from "@/libs/subscription-settings";
import PreorderWindow from "@/models/PreorderWindow";

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
  const [settings, skuCatalog, comboDocs, preorderWindowDocs] = await Promise.all([
    getSubscriptionSettings(),
    listSkuCatalog(),
    listSubscriptionCombos(),
    PreorderWindow.find({}).sort({ status: 1, deliveryDate: -1, updatedAt: -1, createdAt: -1 }),
  ]);
  const skuMap = getSkuMap(skuCatalog);
  const combos = comboDocs.map((combo) => hydrateSubscriptionCombo(combo, skuMap));
  const preorderWindows = JSON.parse(JSON.stringify(preorderWindowDocs || []));
  const defaultPreorderWindow = createDefaultPreorderWindow();
  const deliveryDaysOfWeek = settings?.deliveryDaysOfWeek || [];
  const minimumLeadDays = Number(settings?.minimumLeadDays || 3);
  const recurringMinTotalQuantity = Number(settings?.recurringMinTotalQuantity || 6);
  const activeSkuCount = skuCatalog.filter((sku) => sku.status === "active").length;
  const activeComboCount = combos.filter((combo) => combo.status === "active").length;

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

        <AdminSettingsAccordion>
          <AdminSettingsAccordionItem
            title="Subscription delivery days"
            description="Choose delivery weekdays, category lead times, and recurring minimums."
            badges={[
              formatDeliveryDaysOfWeek(deliveryDaysOfWeek),
              `${formatMinimumLeadDays(minimumLeadDays)} notice`,
            ]}
            defaultOpen
          >
            <AdminSubscriptionScheduleManager
              initialDeliveryDaysOfWeek={deliveryDaysOfWeek}
              initialMinimumLeadDays={minimumLeadDays}
              initialRecurringMinTotalQuantity={recurringMinTotalQuantity}
              initialCategoryLeadTimes={getSettingsCategoryLeadTimes(settings)}
              embedded
            />
          </AdminSettingsAccordionItem>

          <AdminSettingsAccordionItem
            title="Delivery Pricing & Slabs"
            description="Manage pickup, delivery windows, distance pricing, and free-delivery rules."
            badges={[`${preorderWindows.length} window${preorderWindows.length === 1 ? "" : "s"}`]}
          >
            <AdminPreorderConsole
              initialWindows={preorderWindows}
              initialSkuCatalog={skuCatalog}
              defaultWindow={defaultPreorderWindow}
              adminEmail={session.user.email}
              view="settings"
            />
          </AdminSettingsAccordionItem>

          <AdminSettingsAccordionItem
            title="Products"
            description="Manage SKU categories, descriptions, lead time overrides, pricing, and tax fields."
            badges={[`${activeSkuCount} active`]}
          >
            <AdminSkuCatalogManager embedded />
          </AdminSettingsAccordionItem>

          <AdminSettingsAccordionItem
            title="Sets"
            description="Build fixed bottle sets that customers can choose at checkout."
            badges={[`${activeComboCount} active`]}
          >
            <AdminSubscriptionCombosManager
              initialCombos={combos}
              initialSkuCatalog={skuCatalog}
              embedded
            />
          </AdminSettingsAccordionItem>
        </AdminSettingsAccordion>
      </div>
    </main>
  );
}

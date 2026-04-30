import AdminDeliveryRoutePlanner from "@/components/AdminDeliveryRoutePlanner";
import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import AdminRoutePlannerRefreshButton from "@/components/AdminRoutePlannerRefreshButton";
import AdminSubscriptionRoutePlanner from "@/components/AdminSubscriptionRoutePlanner";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import { recalculateSubscriptionRouteSnapshots } from "@/libs/subscription-route-planner";
import { getSubscriptionSettings } from "@/libs/subscription-settings";
import Preorder from "@/models/Preorder";
import PreorderWindow from "@/models/PreorderWindow";

const toDateKey = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
};

const getTodayDateKey = () => toDateKey(new Date());

const getNextDatedItem = (items = [], getDateValue) => {
  const todayKey = getTodayDateKey();
  const datedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      item,
      dateKey: toDateKey(getDateValue(item)),
    }))
    .filter(({ dateKey }) => Boolean(dateKey))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  return datedItems.find(({ dateKey }) => dateKey >= todayKey)?.item || datedItems[0]?.item || null;
};

export default async function AdminRoutePlannerPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to view route planning.</p>
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
  const [legacyPreorderDocs, preorderWindowDocs, subscriptionSettings] = await Promise.all([
    Preorder.find({}).sort({ createdAt: -1 }).limit(200),
    PreorderWindow.find({})
      .sort({ status: 1, deliveryDate: -1, updatedAt: -1, createdAt: -1 })
      .limit(50),
    getSubscriptionSettings(),
  ]);
  const legacyPreorders = JSON.parse(JSON.stringify(legacyPreorderDocs));
  const preorderWindows = JSON.parse(JSON.stringify(preorderWindowDocs));
  const allDeliveryRouteSnapshots = JSON.parse(
    JSON.stringify((await recalculateSubscriptionRouteSnapshots()) || [])
  );
  const nextDeliveryRouteSnapshot = getNextDatedItem(
    allDeliveryRouteSnapshots,
    (snapshot) => snapshot.deliveryDate
  );
  const currency = subscriptionSettings?.currency || "INR";

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Route Planner</h1>
            <p className="mt-2 opacity-75">
              Review delivery batches and subscription route runs in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <AdminRoutePlannerRefreshButton />
            <AdminNav active="route-planner" />
          </div>
        </div>

        <AdminDeliveryRoutePlanner
          initialWindows={preorderWindows}
          initialPreorders={legacyPreorders}
        />

        <AdminSubscriptionRoutePlanner
          initialRouteSnapshots={nextDeliveryRouteSnapshot ? [nextDeliveryRouteSnapshot] : []}
          currency={currency}
        />
      </div>
    </main>
  );
}

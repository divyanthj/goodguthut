import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import AdminOrderPlansList from "@/components/AdminOrderPlansList";
import AdminPreordersList from "@/components/AdminPreordersList";
import { getAdminSessionState } from "@/libs/admin-auth";
import connectMongo from "@/libs/mongoose";
import OrderPlan from "@/models/OrderPlan";
import Preorder from "@/models/Preorder";

export default async function AdminOrdersPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to view and manage orders.</p>
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
  const [orderPlanDocs, legacyPreorderDocs] = await Promise.all([
    OrderPlan.find({}).sort({ createdAt: -1 }).limit(300),
    Preorder.find({}).sort({ createdAt: -1 }).limit(200),
  ]);
  const orderPlans = JSON.parse(JSON.stringify(orderPlanDocs));
  const legacyPreorders = JSON.parse(JSON.stringify(legacyPreorderDocs));

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Orders</h1>
            <p className="mt-2 opacity-75">
              Manage all customer orders in one place.
            </p>
          </div>
          <AdminNav active="orders" />
        </div>

        <AdminOrderPlansList initialOrderPlans={orderPlans} />

        <section className="space-y-4">
          <div className="rounded-2xl bg-base-100 p-5 shadow-md">
            <h2 className="text-xl font-semibold">Earlier pre-orders</h2>
            <p className="mt-2 text-sm opacity-75">
              These are older pre-orders created before the unified order flow. You can still review and update them here.
            </p>
          </div>
          <AdminPreordersList initialPreorders={legacyPreorders} />
        </section>
      </div>
    </main>
  );
}

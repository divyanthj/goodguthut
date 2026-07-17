import AdminCustomersList from "@/components/AdminCustomersList";
import AdminLoginButton from "@/components/AdminLoginButton";
import AdminNav from "@/components/AdminNav";
import { getAdminSessionState } from "@/libs/admin-auth";
import { listCustomersFromOrders } from "@/libs/customer-nudges";
import connectMongo from "@/libs/mongoose";

export default async function AdminCustomersPage() {
  const { session, isAdmin } = await getAdminSessionState();

  if (!session?.user) {
    return (
      <main className="hero min-h-screen bg-base-200">
        <div className="hero-content w-full max-w-2xl">
          <div className="card w-full bg-base-100 shadow-xl">
            <div className="card-body gap-6">
              <h1 className="card-title text-3xl">Admin login</h1>
              <p>Sign in with Google to view customers and prepare thoughtful follow-ups.</p>
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
  const customers = await listCustomersFromOrders();

  return (
    <main className="min-h-screen bg-base-200 px-4 py-10 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Customer care
            </div>
            <h1 className="text-3xl font-bold">Customers</h1>
            <p className="mt-2 opacity-75">
              Everyone who has ordered from Good Gut Hut, with their order story and thoughtful ways to stay in touch.
            </p>
          </div>
          <AdminNav active="customers" />
        </div>

        <AdminCustomersList initialCustomers={JSON.parse(JSON.stringify(customers))} />
      </div>
    </main>
  );
}

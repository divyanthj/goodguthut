import { getServerSession } from "next-auth";
import { authOptions } from "@/libs/next-auth";
import { isAdminEmail } from "@/libs/admin";

export const getAdminSessionState = async () => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { session: null, isAdmin: false };
  }

  return {
    session,
    isAdmin: isAdminEmail(session.user.email),
  };
};

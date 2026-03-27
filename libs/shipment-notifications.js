import {
  buildPreorderShippedNotifications,
  preparePreorderShippedNotifications,
  sendPreorderShippedNotifications,
} from "@/libs/preorder-notifications";

export {
  preparePreorderShippedNotifications,
  sendPreorderShippedNotifications,
};

export const buildPreorderShippedNotificationContent = ({ preorder }) =>
  buildPreorderShippedNotifications({ preorder });

export const sendPreorderShippedEmail = async ({ preorder }) => {
  const notifications = buildPreorderShippedNotifications({ preorder });

  if (notifications.email.status !== "pending") {
    return notifications.email;
  }

  const delivery = await sendPreorderShippedNotifications({ preorder });
  return delivery.email;
};

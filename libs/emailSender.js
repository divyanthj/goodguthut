import {
  buildPreorderConfirmationNotifications,
  sendPreorderConfirmationNotifications,
} from "@/libs/preorder-notifications";

export {
  buildPreorderConfirmationNotifications,
  sendPreorderConfirmationNotifications,
};

export const sendPreorderConfirmationEmail = async ({ preorder }) => {
  const notifications = buildPreorderConfirmationNotifications({ preorder });

  if (notifications.email.status !== "pending") {
    return notifications.email;
  }

  const delivery = await sendPreorderConfirmationNotifications({ preorder });
  return delivery.email;
};

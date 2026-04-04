const config = {
  appName: "Good Gut Hut",
  appDescription:
    "Good Gut Hut crafts fermented non-alcoholic drinks that are slowly brewed and made with care.",
  domainName: "goodguthut.com",
  crisp: {
    id: "",
    onlyShowOnRoutes: ["/"],
  },
  stripe: {
    plans: [],
  },
  lemonsqueezy: {
    storeId: process.env.LEMONSQUEEZY_STORE_ID || "",
    variantId: process.env.LEMONSQUEEZY_PREORDER_VARIANT_ID || "",
    webhookSecret: process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "",
  },
  aws: {
    bucket: "bucket-name",
    bucketUrl: "https://bucket-name.s3.amazonaws.com/",
    cdn: "https://cdn-id.cloudfront.net/",
  },
  mailgun: {
    subdomain: "mg",
    fromNoReply: "Good Gut Hut <noreply@goodguthut.com>",
    fromAdmin: "Devika at Good Gut Hut <hello@goodguthut.com>",
    supportEmail: "hello@goodguthut.com",
    forwardRepliesTo: "devikamaitra4@gmail.com",
  },
  resend: {
    fromAdmin:
      process.env.RESEND_FROM_EMAIL || "Good Gut Hut <hello@goodguthut.com>",
  },
  colors: {
    theme: "goodguthut",
    main: "#355a45",
  },
  auth: {
    loginUrl: "/api/auth/signin",
    callbackUrl: "/dashboard",
  },
  preorderNotifications: {
    shippedWhatsapp: {
      intro: "Your Good Gut Hut order has been shipped.",
      itemsLabel: "Items",
      trackingPrefix: "Track your order here:",
      etaPrefix: "Estimated arrival: around",
    },
    pickupReadyWhatsapp: {
      withAddress:
        "Your Good Gut Hut order is ready for pickup from this address: {pickupAddress}. Please let us know when you are coming to pick up the order.",
      withoutAddress:
        "Your Good Gut Hut order is ready for pickup. Please let us know when you are coming to pick up the order.",
    },
  },
};

export default config;

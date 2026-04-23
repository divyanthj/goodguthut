const BOTTLE_SIZE_ML = 200;

const CONFIRMED_BILLING_STATUSES = new Set(["authenticated", "active", "pending", "completed"]);
const EXCLUDED_SUBSCRIPTION_STATUSES = new Set(["cancelled", "paused"]);

const cadenceToWeeklyFactor = (cadence = "") => {
  switch (cadence) {
    case "weekly":
      return 1;
    case "fortnightly":
      return 0.5;
    case "monthly":
      return 0.25;
    default:
      return 0;
  }
};

const toDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isDateWithinRange = (value, start, end) => {
  const date = toDate(value);

  if (!date) {
    return false;
  }

  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
};

const toDateKey = (value) => {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getWeekStartMonday = (value = new Date()) => {
  const date = new Date(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const isGramUnit = (unit = "") => /\bg\b/i.test(unit.trim());
const isSpoonOrPinchUnit = (unit = "") => /(tsp|tbsp|spoon|pinch)/i.test(unit.trim());

export const getUnitPrecision = (unit = "") => {
  if (isGramUnit(unit)) {
    return 1;
  }

  if (isSpoonOrPinchUnit(unit)) {
    return 2;
  }

  return 2;
};

export const roundForUnit = (value, unit = "") => {
  const precision = getUnitPrecision(unit);
  const multiplier = 10 ** precision;
  return Math.round((Number(value || 0) + Number.EPSILON) * multiplier) / multiplier;
};

export const computeWeeklyDemandFromSubscriptions = (subscriptions = []) => {
  const demandMap = new Map();
  let confirmedSubscriptionCount = 0;
  let totalWeeklyEquivalentBottles = 0;

  subscriptions.forEach((subscription) => {
    if (EXCLUDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      return;
    }

    const billingStatus = subscription.billing?.status || "";
    const isConfirmed =
      subscription.status === "active" || CONFIRMED_BILLING_STATUSES.has(billingStatus);
    const weeklyFactor = cadenceToWeeklyFactor(subscription.cadence);

    if (!isConfirmed || weeklyFactor <= 0) {
      return;
    }

    confirmedSubscriptionCount += 1;
    totalWeeklyEquivalentBottles += Number(subscription.totalQuantity || 0) * weeklyFactor;

    (subscription.items || []).forEach((item) => {
      const sku = String(item.sku || "").trim().toUpperCase();

      if (!sku) {
        return;
      }

      const existing = demandMap.get(sku) || {
        sku,
        productName: item.productName || sku,
        weeklyEquivalentBottles: 0,
        subscribers: 0,
      };
      existing.weeklyEquivalentBottles += Number(item.quantity || 0) * weeklyFactor;
      existing.subscribers += 1;
      demandMap.set(sku, existing);
    });
  });

  return {
    confirmedSubscriptionCount,
    totalWeeklyEquivalentBottles: roundForUnit(totalWeeklyEquivalentBottles, "bottle"),
    demandBySku: [...demandMap.values()]
      .map((item) => ({
        ...item,
        weeklyEquivalentBottles: roundForUnit(item.weeklyEquivalentBottles, "bottle"),
      }))
      .sort((left, right) => left.productName.localeCompare(right.productName)),
  };
};

const addDemandItem = (demandMap, item, quantityToAdd = 0) => {
  const sku = String(item?.sku || "").trim().toUpperCase();

  if (!sku) {
    return;
  }

  const existing = demandMap.get(sku) || {
    sku,
    productName: item.productName || sku,
    weeklyEquivalentBottles: 0,
    subscribers: 0,
  };
  existing.weeklyEquivalentBottles += Number(quantityToAdd || 0);
  existing.subscribers += 1;
  demandMap.set(sku, existing);
};

const sortDateKeys = (keys = []) => [...keys].filter(Boolean).sort((left, right) => left.localeCompare(right));

const findNextDeliveryDateKey = ({ subscriptions = [], orderPlans = [], preorders = [] }) => {
  const recurringSubscriptionDates = subscriptions
    .filter((subscription) => {
      if (EXCLUDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        return false;
      }

      const billingStatus = subscription.billing?.status || "";
      return subscription.status === "active" || CONFIRMED_BILLING_STATUSES.has(billingStatus);
    })
    .map((subscription) => toDateKey(subscription.nextDeliveryDate))
    .filter(Boolean);

  const recurringOrderPlanDates = orderPlans
    .filter((plan) => String(plan.status || "").trim() === "active" && String(plan.mode || "").trim() === "recurring")
    .map((plan) => toDateKey(plan.nextDeliveryDate || plan.firstDeliveryDate || plan.startDate))
    .filter(Boolean);

  const oneTimeOrderPlanDates = orderPlans
    .filter((plan) => String(plan.status || "").trim() === "active" && String(plan.mode || "").trim() === "one_time")
    .map((plan) => toDateKey(plan.nextDeliveryDate || plan.firstDeliveryDate || plan.startDate || plan.createdAt))
    .filter(Boolean);

  const preorderDates = preorders
    .filter((preorder) => ["confirmed", "shipped"].includes(String(preorder.status || "").trim()))
    .map((preorder) => toDateKey(preorder.deliveryDate || preorder.createdAt))
    .filter(Boolean);

  const allDateKeys = sortDateKeys([
    ...recurringSubscriptionDates,
    ...recurringOrderPlanDates,
    ...oneTimeOrderPlanDates,
    ...preorderDates,
  ]);
  const uniqueDateKeys = [...new Set(allDateKeys)];
  const todayKey = todayDateKey();
  const nextUpcoming = uniqueDateKeys.find((dateKey) => dateKey >= todayKey);

  return nextUpcoming || uniqueDateKeys[0] || "";
};

export const computeDemandForNextDeliveryDate = ({
  subscriptions = [],
  orderPlans = [],
  preorders = [],
}) => {
  const deliveryDate = findNextDeliveryDateKey({ subscriptions, orderPlans, preorders });
  const demandMap = new Map();

  if (!deliveryDate) {
    return {
      deliveryDate: "",
      demandBySku: [],
      summary: {
        committedOrderCount: 0,
        totalBottles: 0,
        subscriptionCount: 0,
        recurringOrderPlanCount: 0,
        oneTimeOrderPlanCount: 0,
        preorderCount: 0,
      },
    };
  }

  let subscriptionCount = 0;
  let recurringOrderPlanCount = 0;
  let oneTimeOrderPlanCount = 0;
  let preorderCount = 0;
  let totalBottles = 0;

  subscriptions.forEach((subscription) => {
    if (toDateKey(subscription.nextDeliveryDate) !== deliveryDate) {
      return;
    }

    if (EXCLUDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      return;
    }

    const billingStatus = subscription.billing?.status || "";
    const isConfirmed =
      subscription.status === "active" || CONFIRMED_BILLING_STATUSES.has(billingStatus);

    if (!isConfirmed) {
      return;
    }

    subscriptionCount += 1;
    totalBottles += Number(subscription.totalQuantity || 0);
    (subscription.items || []).forEach((item) => {
      addDemandItem(demandMap, item, Number(item.quantity || 0));
    });
  });

  orderPlans.forEach((plan) => {
    if (String(plan.status || "").trim() !== "active") {
      return;
    }

    const mode = String(plan.mode || "").trim();
    const planDate = toDateKey(plan.nextDeliveryDate || plan.firstDeliveryDate || plan.startDate || plan.createdAt);

    if (planDate !== deliveryDate) {
      return;
    }

    if (mode === "recurring") {
      recurringOrderPlanCount += 1;
    } else if (mode === "one_time") {
      oneTimeOrderPlanCount += 1;
    } else {
      return;
    }

    totalBottles += Number(plan.totalQuantity || 0);
    (plan.items || []).forEach((item) => {
      addDemandItem(demandMap, item, Number(item.quantity || 0));
    });
  });

  preorders.forEach((preorder) => {
    if (!["confirmed", "shipped"].includes(String(preorder.status || "").trim())) {
      return;
    }

    if (toDateKey(preorder.deliveryDate || preorder.createdAt) !== deliveryDate) {
      return;
    }

    preorderCount += 1;
    totalBottles += Number(preorder.totalQuantity || 0);
    (preorder.items || []).forEach((item) => {
      addDemandItem(demandMap, item, Number(item.quantity || 0));
    });
  });

  return {
    deliveryDate,
    demandBySku: [...demandMap.values()]
      .map((item) => ({
        ...item,
        weeklyEquivalentBottles: roundForUnit(item.weeklyEquivalentBottles, "bottle"),
      }))
      .sort((left, right) => left.productName.localeCompare(right.productName)),
    summary: {
      committedOrderCount: subscriptionCount + recurringOrderPlanCount + oneTimeOrderPlanCount + preorderCount,
      totalBottles: roundForUnit(totalBottles, "bottle"),
      subscriptionCount,
      recurringOrderPlanCount,
      oneTimeOrderPlanCount,
      preorderCount,
    },
  };
};

export const computeWeeklyDemandFromAllOrders = ({
  subscriptions = [],
  orderPlans = [],
  preorders = [],
  weekStart,
}) => {
  const start = getWeekStartMonday(weekStart || new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const demandMap = new Map();

  let activeRecurringSubscriptions = 0;
  let recurringFromSubscriptionBottles = 0;
  let activeRecurringOrderPlans = 0;
  let recurringFromOrderPlanBottles = 0;
  let oneTimeOrderPlansInWeek = 0;
  let oneTimeOrderPlanBottles = 0;
  let preordersInWeek = 0;
  let preorderBottles = 0;

  subscriptions.forEach((subscription) => {
    if (EXCLUDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      return;
    }

    const billingStatus = subscription.billing?.status || "";
    const isConfirmed =
      subscription.status === "active" || CONFIRMED_BILLING_STATUSES.has(billingStatus);
    const weeklyFactor = cadenceToWeeklyFactor(subscription.cadence);

    if (!isConfirmed || weeklyFactor <= 0) {
      return;
    }

    activeRecurringSubscriptions += 1;
    recurringFromSubscriptionBottles += Number(subscription.totalQuantity || 0) * weeklyFactor;

    (subscription.items || []).forEach((item) => {
      addDemandItem(demandMap, item, Number(item.quantity || 0) * weeklyFactor);
    });
  });

  orderPlans.forEach((plan) => {
    const status = String(plan.status || "").trim();
    const mode = String(plan.mode || "").trim();

    if (status !== "active") {
      return;
    }

    if (mode === "recurring") {
      const weeklyFactor = cadenceToWeeklyFactor(plan.cadence);

      if (weeklyFactor <= 0) {
        return;
      }

      activeRecurringOrderPlans += 1;
      recurringFromOrderPlanBottles += Number(plan.totalQuantity || 0) * weeklyFactor;
      (plan.items || []).forEach((item) => {
        addDemandItem(demandMap, item, Number(item.quantity || 0) * weeklyFactor);
      });
      return;
    }

    if (mode !== "one_time") {
      return;
    }

    const plannedDate =
      plan.nextDeliveryDate || plan.firstDeliveryDate || plan.startDate || plan.createdAt;

    if (!isDateWithinRange(plannedDate, start, end)) {
      return;
    }

    oneTimeOrderPlansInWeek += 1;
    oneTimeOrderPlanBottles += Number(plan.totalQuantity || 0);
    (plan.items || []).forEach((item) => {
      addDemandItem(demandMap, item, Number(item.quantity || 0));
    });
  });

  preorders.forEach((preorder) => {
    const status = String(preorder.status || "").trim();

    if (!["confirmed", "shipped"].includes(status)) {
      return;
    }

    if (!isDateWithinRange(preorder.deliveryDate || preorder.createdAt, start, end)) {
      return;
    }

    preordersInWeek += 1;
    preorderBottles += Number(preorder.totalQuantity || 0);
    (preorder.items || []).forEach((item) => {
      addDemandItem(demandMap, item, Number(item.quantity || 0));
    });
  });

  const totalWeeklyEquivalentBottles =
    recurringFromSubscriptionBottles +
    recurringFromOrderPlanBottles +
    oneTimeOrderPlanBottles +
    preorderBottles;

  return {
    weekStart: start,
    weekEnd: end,
    demandBySku: [...demandMap.values()]
      .map((item) => ({
        ...item,
        weeklyEquivalentBottles: roundForUnit(item.weeklyEquivalentBottles, "bottle"),
      }))
      .sort((left, right) => left.productName.localeCompare(right.productName)),
    summary: {
      activeRecurringSubscriptions,
      activeRecurringOrderPlans,
      recurringFromSubscriptionBottles: roundForUnit(recurringFromSubscriptionBottles, "bottle"),
      recurringFromOrderPlanBottles: roundForUnit(recurringFromOrderPlanBottles, "bottle"),
      oneTimeOrderPlansInWeek,
      oneTimeOrderPlanBottles: roundForUnit(oneTimeOrderPlanBottles, "bottle"),
      preordersInWeek,
      preorderBottles: roundForUnit(preorderBottles, "bottle"),
      totalWeeklyEquivalentBottles: roundForUnit(totalWeeklyEquivalentBottles, "bottle"),
      committedOrderCount:
        activeRecurringSubscriptions +
        activeRecurringOrderPlans +
        oneTimeOrderPlansInWeek +
        preordersInWeek,
    },
  };
};

export const buildIngredientSheet = ({
  weekStart,
  deliveryDate = "",
  demandBySku = [],
  approvedRecipesBySku = new Map(),
  bottleSizeMl = BOTTLE_SIZE_ML,
}) => {
  const normalizedWeekStart = getWeekStartMonday(weekStart);
  const weekEnd = new Date(normalizedWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const consolidatedMap = new Map();
  const ingredientsBySku = [];
  const missingRecipes = [];

  demandBySku.forEach((demandItem) => {
    const recipe = approvedRecipesBySku.get(demandItem.sku);

    if (!recipe) {
      missingRecipes.push({
        sku: demandItem.sku,
        productName: demandItem.productName,
        weeklyEquivalentBottles: demandItem.weeklyEquivalentBottles,
      });
      return;
    }

    const targetLitres = (Number(demandItem.weeklyEquivalentBottles || 0) * bottleSizeMl) / 1000;
    const baseYieldLitres = Number(recipe.baseYieldLitres || 1);
    const batchCount = Math.max(1, Math.ceil(targetLitres / baseYieldLitres));
    const plannedLitres = batchCount * baseYieldLitres;
    const wastageLitres = Math.max(0, plannedLitres - targetLitres);
    const scalingFactor = plannedLitres / baseYieldLitres;
    const ingredientLines = (recipe.ingredients || []).map((ingredient) => {
      const quantity = roundForUnit(Number(ingredient.quantity || 0) * scalingFactor, ingredient.unit);
      const toleranceValue =
        ingredient.toleranceType === "plus_minus"
          ? roundForUnit(Number(ingredient.toleranceValue || 0) * scalingFactor, ingredient.unit)
          : 0;
      const consolidatedKey = [
        ingredient.name.trim().toLowerCase(),
        ingredient.unit.trim().toLowerCase(),
        ingredient.toleranceType,
      ].join("__");
      const consolidated = consolidatedMap.get(consolidatedKey) || {
        name: ingredient.name,
        unit: ingredient.unit,
        quantity: 0,
        toleranceType: ingredient.toleranceType,
        toleranceValue: 0,
      };

      consolidated.quantity += quantity;
      if (ingredient.toleranceType === "plus_minus") {
        consolidated.toleranceValue += toleranceValue;
      }
      consolidatedMap.set(consolidatedKey, consolidated);

      return {
        name: ingredient.name,
        unit: ingredient.unit,
        quantity,
        toleranceType: ingredient.toleranceType,
        toleranceValue,
      };
    });

    ingredientsBySku.push({
      sku: demandItem.sku,
      skuName: recipe.skuName || demandItem.productName,
      weeklyEquivalentBottles: demandItem.weeklyEquivalentBottles,
      targetLitres: roundForUnit(targetLitres, "litre"),
      plannedLitres: roundForUnit(plannedLitres, "litre"),
      wastageLitres: roundForUnit(wastageLitres, "litre"),
      batchCount,
      formulaVersion: recipe.version,
      formulaBaseYieldLitres: baseYieldLitres,
      ingredients: ingredientLines,
    });
  });

  const consolidatedIngredients = [...consolidatedMap.values()]
    .map((ingredient) => ({
      ...ingredient,
      quantity: roundForUnit(ingredient.quantity, ingredient.unit),
      toleranceValue:
        ingredient.toleranceType === "plus_minus"
          ? roundForUnit(ingredient.toleranceValue, ingredient.unit)
          : 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    weekStart: normalizedWeekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    deliveryDate,
    bottleSizeMl,
    demandBySku,
    ingredientsBySku,
    consolidatedIngredients,
    missingRecipes,
  };
};

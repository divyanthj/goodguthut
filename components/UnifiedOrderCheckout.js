"use client";

import SubscriptionForm from "@/components/SubscriptionForm";

export default function UnifiedOrderCheckout({
  catalogItems = [],
  comboOptions = [],
  deliveryWindowId = "",
  pickupAddress = "",
  deliveryBands = [],
  deliveryDaysOfWeek = [],
  minimumLeadDays = 3,
  recurringMinTotalQuantity = 6,
  freeDeliveryThreshold = null,
  availableStartDates = [],
  defaultStartDate = "",
  currency = "INR",
}) {
  return (
    <div>
      <SubscriptionForm
        catalogItems={catalogItems}
        comboOptions={comboOptions}
        deliveryWindowId={deliveryWindowId}
        pickupAddress={pickupAddress}
        deliveryBands={deliveryBands}
        deliveryDaysOfWeek={deliveryDaysOfWeek}
        minimumLeadDays={minimumLeadDays}
        recurringMinTotalQuantity={recurringMinTotalQuantity}
        freeDeliveryThreshold={freeDeliveryThreshold}
        availableStartDates={availableStartDates}
        defaultStartDate={defaultStartDate}
        currency={currency}
        initialSelectionMode="combo"
      />
    </div>
  );
}

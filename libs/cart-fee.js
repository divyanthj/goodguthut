export const SMALL_CART_FEE_AMOUNT = 99;
export const SMALL_CART_FEE_MAX_QTY = 3;

export const calculateSmallCartFee = (totalQuantity = 0) => {
  const quantity = Math.max(0, Number(totalQuantity || 0));

  return quantity > 0 && quantity <= SMALL_CART_FEE_MAX_QTY
    ? SMALL_CART_FEE_AMOUNT
    : 0;
};

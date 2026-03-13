type ProductLike = {
  inventory_unit?: unknown;
  category?: unknown;
};

export function displayPriceUnit(product: ProductLike): "g" | "lb" {
  const inventoryUnit = String(product?.inventory_unit || "").trim().toLowerCase();
  if (inventoryUnit === "g") return "g";

  const category = String(product?.category || "").trim().toLowerCase();
  if (category === "flower") return "lb";

  return "g";
}


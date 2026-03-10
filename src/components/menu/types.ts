export type Offer = {
  id: string;
  product_id?: string | null;
  status?: string | null;
  min_order: number;
  bulk_sell_per_lb: number | null;
  allow_bulk: boolean;
  allow_copack: boolean;
  catalog_name?: string | null;
  catalog_category?: string | null;
  products: {
    id: string;
    name: string;
    category: string | null;
    type: string | null;
    tier: string | null;
    inventory_qty: number | null;
    inventory_unit: string | null;
  } | null;
  image_url: string | null;
  video_url?: string | null;
};

export type MenuMode = "bulk" | "copack";
export type MenuCategory = "flower" | "concentrate" | "vape" | "pre_roll";

export type ProductBadge = {
  label: string;
};

export type CardMode = "bulk" | "copack" | "pre_roll";
export type CardPackagingMode = "jcrad" | "customer";
export type InfusionProductOption = { id: string; name: string; category: "concentrate" | "vape" };

export type ProductCardCopackConfig = {
  expanded: boolean;
  mode: CardMode;
  startingWeightLbs: number;
  startingWeightGrams: number;
  advancedTargetUnits: number;
  showAdvancedUnits: boolean;
  expectedRangeLabel: string;
  expectedDisclaimer?: string;
  startingWeightLabel: string;
  startingWeightUnit: "lb" | "g";
  unitSize: string;
  packagingMode: CardPackagingMode;
  packagingSkuId: string;
  secondaryPackagingSkuId: string;
  preRollPackQty: number;
  preRollMode: string;
  allowedModes: CardMode[];
  internalInfusionProductId: string;
  externalLiquidProductId: string;
  externalDryProductId: string;
  internalSummary?: string;
  externalSummary?: string;
  internalInfusionGPerLb: number;
  externalDistillatePerUnit: number;
  externalKiefPerUnit: number;
  externalFlowerPerUnit: number;
  internalInfusionOptions: InfusionProductOption[];
  externalLiquidOptions: InfusionProductOption[];
  externalDryOptions: InfusionProductOption[];
  notes: string;
  frontFileName: string;
  backFileName: string;
  requiresSecondaryBag: boolean;
  secondaryPackagingLabel?: string;
  unitSizeOptions: string[];
  packagingOptions: Array<{ id: string; name: string }>;
  secondaryBagOptions: Array<{ id: string; name: string }>;
  onExpandedChange: (next: boolean) => void;
  onModeChange: (next: CardMode) => void;
  onStartingWeightLbsChange: (next: number) => void;
  onStartingWeightGramsChange: (next: number) => void;
  onAdvancedTargetUnitsChange: (next: number) => void;
  onShowAdvancedUnitsChange: (next: boolean) => void;
  onUnitSizeChange: (next: string) => void;
  onPackagingModeChange: (next: CardPackagingMode) => void;
  onPackagingSkuChange: (next: string) => void;
  onSecondaryPackagingSkuChange: (next: string) => void;
  onPreRollPackQtyChange: (next: number) => void;
  onPreRollModeChange: (next: string) => void;
  onInternalInfusionProductChange: (next: string) => void;
  onExternalLiquidProductChange: (next: string) => void;
  onExternalDryProductChange: (next: string) => void;
  onNotesChange: (next: string) => void;
  onFrontFileChange: (next: File | null) => void;
  onBackFileChange: (next: File | null) => void;
};

export type ProductCardItem = {
  id: string;
  title: string;
  href: string;
  imageUrl: string | null;
  videoUrl?: string | null;
  categoryLabel: string;
  badges: ProductBadge[];
  availabilityLabel?: string;
  pricingLabel: string;
  addDisabled: boolean;
  addLoading: boolean;
  errorText?: string;
  copackConfig?: ProductCardCopackConfig;
};

export type EstimateCartLine = {
  id: string;
  offerId: string;
  title: string;
  category?: "vape" | "flower" | "pre_roll" | "concentrate" | null;
  mode: MenuMode | "pre_roll";
  quantityLabel: string;
  lineTotal: number | null;
  notes?: string;
  packagingMode?: string | null;
  packagingSubmissionId?: string | null;
  unitSize?: string | null;
  units?: number | null;
  quantity?: number | null;
  quantityUnit?: "lb" | "g" | "units" | null;
  preRollPackQty?: number | null;
  preRollMode?: string | null;
  expectedRangeLabel?: string;
  startingWeightLabel?: string;
};

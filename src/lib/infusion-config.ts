export const INFUSION_ELIGIBILITY = {
  THCA: { internal: true, external: false },
  Kief: { internal: true, external: true },
  "Bubble Hash": { internal: true, external: true },
  "Freeze Dried Rosin": { internal: true, external: false },
  Diamonds: { internal: true, external: false },
  Shatter: { internal: false, external: false },
  Badder: { internal: false, external: false },
  Rosin: { internal: false, external: false },
} as const;

export const LIQUID_INFUSION_MEDIA = [
  "Distillate",
  "Liquid Diamonds",
  "Live Resin",
  "Liquid Rosin",
] as const;

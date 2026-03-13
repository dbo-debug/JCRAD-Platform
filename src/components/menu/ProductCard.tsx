"use client";

import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { type ProductCardItem } from "@/components/menu/types";
import { gramsFromLiters, litersFromGrams } from "@/lib/pricing";

type ProductCardProps = {
  item: ProductCardItem;
  onAdd: () => void;
};

export default function ProductCard({ item, onAdd }: ProductCardProps) {
  const imageSrc = String(item.imageUrl || "").trim();
  const hasImage = !!imageSrc;
  const videoSrc = String(item.videoUrl || "").trim();
  const hasVideo = !!videoSrc;
  const isBrandAsset = imageSrc.startsWith("/brand/");
  const [preferContain, setPreferContain] = useState(false);
  const [canHoverPreview, setCanHoverPreview] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const availabilityText = item.availabilityLabel?.replace(/^available:\s*/i, "").trim() || "";
  const hasOnlyOneExternalSelection = Boolean(
    item.copackConfig
      && item.copackConfig.mode === "pre_roll"
      && (Boolean(item.copackConfig.externalLiquidProductId) !== Boolean(item.copackConfig.externalDryProductId))
  );
  const hasBothExternalSelections = Boolean(
    item.copackConfig
      && item.copackConfig.mode === "pre_roll"
      && Boolean(item.copackConfig.externalLiquidProductId)
      && Boolean(item.copackConfig.externalDryProductId)
  );
  const showInternalInfusionSection = Boolean(
    item.copackConfig
      && (item.copackConfig.mode === "copack" || item.copackConfig.mode === "pre_roll")
      && item.copackConfig.startingWeightUnit === "lb"
  );
  const showExternalInfusionSection = Boolean(item.copackConfig && item.copackConfig.mode === "pre_roll");
  const isVapeBulk = Boolean(
    item.copackConfig
      && item.copackConfig.mode === "bulk"
      && String(item.categoryLabel || "").toLowerCase() === "vape"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCanHoverPreview(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  useEffect(() => {
    setShowVideoPreview(false);
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  }, [videoSrc]);

  function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    if (isBrandAsset) return;
    const img = event.currentTarget;
    const ratio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
    setPreferContain(ratio < 0.95);
  }

  function handleMediaMouseEnter() {
    if (!hasVideo || !canHoverPreview) return;
    setShowVideoPreview(true);
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => {});
  }

  function handleMediaMouseLeave() {
    if (!showVideoPreview) return;
    setShowVideoPreview(false);
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  }

  return (
    <article className="group flex h-full flex-col rounded-[18px] border border-[#dce6ed] bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg">
      <div
        className="relative mb-3 aspect-[4/3] overflow-hidden rounded-[14px] border border-[#d9e4ea] bg-gradient-to-br from-[#f7fafc] to-[#edf3f6]"
        onMouseEnter={handleMediaMouseEnter}
        onMouseLeave={handleMediaMouseLeave}
      >
        {hasImage ? (
          <img
            src={imageSrc}
            alt={item.title}
            loading="lazy"
            decoding="async"
            onLoad={handleImageLoad}
            className={[
              "h-full w-full transition duration-300",
              showVideoPreview ? "opacity-0" : isBrandAsset ? "opacity-60" : "opacity-100",
              isBrandAsset
                ? "object-contain p-6"
                : preferContain
                  ? "object-contain p-2.5"
                  : "object-cover object-center group-hover:scale-[1.015]",
            ].join(" ")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#f9fbfc] to-[#eef3f6]">
            <img
              src="/brand/BLACK.png"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="h-9 w-auto opacity-[0.12]"
            />
          </div>
        )}
        {hasVideo ? (
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            loop
            playsInline
            preload="metadata"
            poster={hasImage ? imageSrc : undefined}
            className={[
              "pointer-events-none absolute inset-0 h-full w-full object-cover transition duration-200",
              showVideoPreview ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
        ) : null}
        {hasVideo ? (
          <div className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-[#d6e4eb] bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-[#31596d] shadow-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-[#14b8a6]" />
            Video
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col space-y-2">
        <h3 className="line-clamp-2 min-h-[2.8rem] text-sm font-semibold text-[#1f2f3b]">{item.title}</h3>

        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-[#14b8a6]/30 bg-[#14b8a6]/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#0f766e]">
            {item.categoryLabel}
          </span>
          {item.badges.map((badge, index) => (
            <span
              key={`${item.id}-${badge.label}-${index}`}
              className="rounded-full border border-[#d4e0e7] bg-[#fbfdfe] px-2 py-0.5 text-[11px] text-[#5b7382]"
            >
              {badge.label}
            </span>
          ))}
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[15px] font-semibold text-[#1f3b44]">{item.pricingLabel}</div>
          {availabilityText ? (
            <div className="whitespace-nowrap text-[11px] font-medium text-[#6a8392]">Avail: {availabilityText}</div>
          ) : null}
        </div>

        {item.copackConfig ? (
          <div className="space-y-2 rounded-xl border border-[#dbe6ed] bg-[#f9fcfe] p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-full border border-[#d3dde4] bg-white p-1 text-[11px]">
                {item.copackConfig.allowedModes.map((modeOption) => (
                  <button
                    key={modeOption}
                    type="button"
                    onClick={() => item.copackConfig?.onModeChange(modeOption)}
                    className={[
                      "rounded-full px-2.5 py-1 font-semibold transition",
                      item.copackConfig?.mode === modeOption
                        ? "bg-[#14b8a6] text-white"
                        : "text-[#4e6473] hover:text-[#22333f]",
                    ].join(" ")}
                  >
                    {modeOption === "pre_roll" ? "Pre-roll" : modeOption === "copack" ? "Copack" : "Bulk"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => item.copackConfig?.onExpandedChange(!item.copackConfig?.expanded)}
                className="rounded-full border border-[#cfdde5] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#2f4a59] transition hover:border-[#14b8a6] hover:text-[#0f766e]"
              >
                {item.copackConfig.expanded ? "Hide details" : "Details"}
              </button>
            </div>

            {item.copackConfig.expanded ? (
              <div className="space-y-2 text-[11px] text-[#304b5a]">
                {item.copackConfig.mode === "bulk" ? (
                  <label className="grid gap-1">
                    <span className="font-medium">{isVapeBulk ? "Bulk L" : "Bulk lbs"}</span>
                    <input
                      type="number"
                      min={0}
                      step={isVapeBulk ? "0.1" : "0.01"}
                      value={isVapeBulk ? litersFromGrams(item.copackConfig.startingWeightGrams) : item.copackConfig.startingWeightLbs}
                      onChange={(e) =>
                        isVapeBulk
                          ? item.copackConfig?.onStartingWeightGramsChange(gramsFromLiters(Number(e.target.value)))
                          : item.copackConfig?.onStartingWeightLbsChange(Number(e.target.value))
                      }
                      className="rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                    />
                  </label>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1">
                        <span className="font-medium">{item.copackConfig.startingWeightLabel}</span>
                        <input
                          type="number"
                          min={0}
                          step={item.copackConfig.startingWeightUnit === "lb" ? "0.01" : "1"}
                          value={item.copackConfig.startingWeightUnit === "lb" ? item.copackConfig.startingWeightLbs : item.copackConfig.startingWeightGrams}
                          onChange={(e) =>
                            item.copackConfig?.startingWeightUnit === "lb"
                              ? item.copackConfig?.onStartingWeightLbsChange(Number(e.target.value))
                              : item.copackConfig?.onStartingWeightGramsChange(Number(e.target.value))
                          }
                          className="rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="font-medium">Unit size</span>
                        <select
                          value={item.copackConfig.unitSize}
                          onChange={(e) => item.copackConfig?.onUnitSizeChange(e.target.value)}
                          className="rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                        >
                          {item.copackConfig.unitSizeOptions.map((size) => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="rounded-lg border border-[#dbe6ed] bg-white px-2 py-1.5 text-[11px] text-[#355060]">
                      {item.copackConfig.expectedRangeLabel}
                    </div>
                    {item.copackConfig.expectedDisclaimer ? (
                      <p className="text-[11px] text-[#6a8392]">{item.copackConfig.expectedDisclaimer}</p>
                    ) : null}
                    {showInternalInfusionSection ? (
                      <div className="space-y-2">
                        <div className="space-y-1.5 rounded-lg border border-[#dbe6ed] bg-white px-2 py-2">
                          <span className="font-medium">Internal Infusion (dry only)</span>
                          <select
                            value={item.copackConfig.internalInfusionProductId}
                            onChange={(e) => item.copackConfig?.onInternalInfusionProductChange(e.target.value)}
                            className="w-full rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                          >
                            <option value="">None</option>
                            {item.copackConfig.internalInfusionOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.name}</option>
                            ))}
                          </select>
                          {item.copackConfig.internalInfusionProductId ? (
                            <div className="rounded-md border border-[#dbe6ed] bg-[#f9fcfe] px-2 py-1.5 text-[11px] text-[#355060]">
                              {item.copackConfig.internalSummary}
                            </div>
                          ) : null}
                        </div>

                        {showExternalInfusionSection ? (
                          <div className="space-y-1.5 rounded-lg border border-[#dbe6ed] bg-white px-2 py-2">
                            <span className="font-medium">External Infusion (liquid + dry)</span>
                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={item.copackConfig.externalLiquidProductId}
                                onChange={(e) => item.copackConfig?.onExternalLiquidProductChange(e.target.value)}
                                className="w-full rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                              >
                                <option value="">Liquid: None</option>
                                {item.copackConfig.externalLiquidOptions.map((option) => (
                                  <option key={option.id} value={option.id}>{option.name}</option>
                                ))}
                              </select>
                              <select
                                value={item.copackConfig.externalDryProductId}
                                onChange={(e) => item.copackConfig?.onExternalDryProductChange(e.target.value)}
                                className="w-full rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                              >
                                <option value="">Dry: None</option>
                                {item.copackConfig.externalDryOptions.map((option) => (
                                  <option key={option.id} value={option.id}>{option.name}</option>
                                ))}
                              </select>
                            </div>
                            {hasBothExternalSelections && item.copackConfig.externalSummary ? (
                              <div className="rounded-md border border-[#dbe6ed] bg-[#f9fcfe] px-2 py-1.5 text-[11px] text-[#355060]">
                                <div>{item.copackConfig.externalSummary}</div>
                              </div>
                            ) : null}
                            {hasOnlyOneExternalSelection ? (
                              <div className="text-[11px] text-[#be3a2d]">
                                Select both liquid + dry to enable external infusion.
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <label className="inline-flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={item.copackConfig.showAdvancedUnits}
                          onChange={(e) => item.copackConfig?.onShowAdvancedUnitsChange(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-[#cfdde5] text-[#14b8a6] focus:ring-[#14b8a6]"
                        />
                        Advanced target units (optional)
                      </label>
                      {item.copackConfig.showAdvancedUnits ? (
                        <input
                          type="number"
                          min={1}
                          value={item.copackConfig.advancedTargetUnits}
                          onChange={(e) => item.copackConfig?.onAdvancedTargetUnitsChange(Number(e.target.value))}
                          className="w-full rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                        />
                      ) : null}
                    </div>

                    {item.copackConfig.mode === "pre_roll" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1">
                          <span className="font-medium">Pack qty</span>
                          <select
                            value={item.copackConfig.preRollPackQty}
                            onChange={(e) => item.copackConfig?.onPreRollPackQtyChange(Number(e.target.value))}
                            className="rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                          >
                            <option value={1}>1</option>
                            <option value={5}>5</option>
                          </select>
                        </label>
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <span className="font-medium">Packaging provider</span>
                      <div className="inline-flex rounded-full border border-[#cfdde5] bg-white p-1">
                        <button
                          type="button"
                          onClick={() => item.copackConfig?.onPackagingModeChange("jcrad")}
                          className={[
                            "rounded-full px-2.5 py-1 font-semibold transition",
                            item.copackConfig.packagingMode === "jcrad"
                              ? "bg-[#14b8a6] text-white"
                              : "text-[#4e6473]",
                          ].join(" ")}
                        >
                          JC RAD
                        </button>
                        <button
                          type="button"
                          onClick={() => item.copackConfig?.onPackagingModeChange("customer")}
                          disabled={item.copackConfig.mode === "pre_roll"}
                          className={[
                            "rounded-full px-2.5 py-1 font-semibold transition",
                            item.copackConfig.packagingMode === "customer"
                              ? "bg-[#22c55e] text-white"
                              : "text-[#4e6473]",
                          ].join(" ")}
                        >
                          Client
                        </button>
                      </div>
                    </div>

                    {item.copackConfig.packagingMode === "jcrad" ? (
                      <>
                        <label className="grid gap-1">
                          <span className="font-medium">Packaging SKU</span>
                          <select
                            value={item.copackConfig.packagingSkuId}
                            onChange={(e) => item.copackConfig?.onPackagingSkuChange(e.target.value)}
                            className="rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                          >
                            <option value="">Select</option>
                            {item.copackConfig.packagingOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.name}</option>
                            ))}
                          </select>
                        </label>
                        {item.copackConfig.requiresSecondaryBag ? (
                          <label className="grid gap-1">
                            <span className="font-medium">{item.copackConfig.secondaryPackagingLabel || "Secondary bag"}</span>
                            <select
                              value={item.copackConfig.secondaryPackagingSkuId}
                              onChange={(e) => item.copackConfig?.onSecondaryPackagingSkuChange(e.target.value)}
                              className="rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                            >
                              <option value="">Select</option>
                              {item.copackConfig.secondaryBagOptions.map((option) => (
                                <option key={option.id} value={option.id}>{option.name}</option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </>
                    ) : (
                      <div className="space-y-2 rounded-lg border border-[#dbe6ed] bg-[#f9fcfe] p-2">
                        <div className="grid gap-1">
                          <span className="font-medium text-[#2f4a59]">Front artwork</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => item.copackConfig?.onFrontFileChange(e.target.files?.[0] || null)}
                            className="rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                          />
                          {item.copackConfig.frontFileName ? (
                            <span className="text-[10px] text-[#5b7382]">{item.copackConfig.frontFileName}</span>
                          ) : null}
                        </div>
                        <div className="grid gap-1">
                          <span className="font-medium text-[#2f4a59]">Back artwork</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) => item.copackConfig?.onBackFileChange(e.target.files?.[0] || null)}
                            className="rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                          />
                          {item.copackConfig.backFileName ? (
                            <span className="text-[10px] text-[#5b7382]">{item.copackConfig.backFileName}</span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-[#355060]">
                          Artwork is uploaded inline and attached to this estimate line.
                        </p>
                      </div>
                    )}

                    <label className="grid gap-1">
                      <span className="font-medium">Notes</span>
                      <input
                        value={item.copackConfig.notes}
                        onChange={(e) => item.copackConfig?.onNotesChange(e.target.value)}
                        className="rounded-lg border border-[#cfdde5] bg-white px-2 py-1.5 text-[11px] text-[#1f2937]"
                      />
                    </label>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex gap-2 pt-2">
          <button
            type="button"
            onClick={onAdd}
            disabled={item.addDisabled || item.addLoading || hasOnlyOneExternalSelection}
            className="flex-1 rounded-full bg-[#14b8a6] px-3 py-2 text-xs font-bold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {item.addLoading ? "Adding..." : "Add to Estimate"}
          </button>
        </div>

        {item.errorText ? <p className="text-xs text-[#be3a2d]">{item.errorText}</p> : null}
      </div>
    </article>
  );
}

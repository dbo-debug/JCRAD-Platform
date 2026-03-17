import {
  canUseGoogleRouteOptimization,
  canUseGoogleRouteServices,
  computeGoogleRouteSchedule,
  optimizeStopOrderWithGoogle,
} from "@/lib/googleRouteServices";

export const JC_RAD_HQ = {
  name: "JC RAD HQ",
  address: "1055 E. Cesar Chavez Ave, Los Angeles, CA 90033",
  latitude: 34.04536,
  longitude: -118.2355,
};

const DEFAULT_VISIT_MINUTES = 30;
const DEFAULT_LUNCH_MINUTES = 30;
const DEFAULT_SHIFT_START_TIME = "09:00";
const DEFAULT_REQUIRED_RETURN_TIME = "16:30";
const TIGHT_RETURN_BUFFER_MINUTES = 30;

export type RoutePlanStopInput = {
  customerId: string;
  customerName: string;
  territoryCode: string | null;
  routeDay: string | null;
  latitude: number;
  longitude: number;
  queueId?: string | null;
};

export type PlannedRouteStop = {
  customerId: string;
  customerName: string;
  territoryCode: string | null;
  routeDay: string | null;
  queueId: string | null;
  stopOrder: number;
  plannedArrivalTime: string;
  plannedDepartureTime: string;
  estimatedDriveMinutesFromPrevious: number;
  estimatedVisitMinutes: number;
  legDistanceMeters: number;
  scheduleFlag: "on_time" | "tight" | "overtime";
};

export type LunchBlock = {
  startTime: string;
  endTime: string;
  minutes: number;
};

export type PlannedRoute = {
  provider: "google" | "fallback";
  orderedStops: PlannedRouteStop[];
  lunchBlock: LunchBlock | null;
  lunchMinutes: number;
  estimatedDriveMinutes: number;
  estimatedVisitMinutes: number;
  estimatedTotalMinutes: number;
  projectedFinishTime: string | null;
  estimatedReturnTime: string | null;
  projectedReturnTime: string | null;
  returnDriveMinutes: number;
  fitsWithinShift: boolean;
  shiftStartTime: string;
  requiredReturnBy: string;
  overtimeMinutes: number;
  firstOvertimeStopIndex: number | null;
  firstOvertimeStopId: string | null;
  suggestedTrimStopIds: string[];
  polyline: string | null;
  warning: string | null;
};

function haversineMiles(args: { leftLat: number; leftLng: number; rightLat: number; rightLng: number }) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const deltaLat = toRadians(args.rightLat - args.leftLat);
  const deltaLng = toRadians(args.rightLng - args.leftLng);
  const leftLat = toRadians(args.leftLat);
  const rightLat = toRadians(args.rightLat);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2) * Math.cos(leftLat) * Math.cos(rightLat);

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateDriveMinutes(miles: number) {
  return Math.max(5, Math.round((miles / 22) * 60));
}

function parseStartDateTime(args: { routeDate: string; startTime: string }) {
  return new Date(`${args.routeDate}T${args.startTime}:00`);
}

function parseTimeText(value: string | null | undefined, fallback: string) {
  const text = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildFallbackOrder(stops: RoutePlanStopInput[]) {
  const remaining = [...stops];
  const orderedStops: RoutePlanStopInput[] = [];
  let currentLatitude = JC_RAD_HQ.latitude;
  let currentLongitude = JC_RAD_HQ.longitude;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestMiles = Number.POSITIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const miles = haversineMiles({
        leftLat: currentLatitude,
        leftLng: currentLongitude,
        rightLat: candidate.latitude,
        rightLng: candidate.longitude,
      });
      if (miles < nearestMiles) {
        nearestMiles = miles;
        nearestIndex = index;
      }
    });

    const [nextStop] = remaining.splice(nearestIndex, 1);
    orderedStops.push(nextStop);
    currentLatitude = nextStop.latitude;
    currentLongitude = nextStop.longitude;
  }

  return orderedStops;
}

function maybeInsertLunch(args: {
  currentTime: Date;
  lunchInserted: boolean;
  remainingStops: number;
  lunchMinutes: number;
}): LunchBlock | null {
  if (args.lunchInserted || args.remainingStops <= 0 || args.lunchMinutes <= 0) return null;

  const lunchThreshold = new Date(args.currentTime);
  lunchThreshold.setHours(12, 0, 0, 0);
  if (args.currentTime.getTime() < lunchThreshold.getTime()) return null;

  const startTime = new Date(args.currentTime);
  const endTime = addMinutes(startTime, args.lunchMinutes);
  return {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    minutes: args.lunchMinutes,
  } satisfies LunchBlock;
}

function estimateMinutesToOrigin(stop: RoutePlanStopInput) {
  return estimateDriveMinutes(
    haversineMiles({
      leftLat: stop.latitude,
      leftLng: stop.longitude,
      rightLat: JC_RAD_HQ.latitude,
      rightLng: JC_RAD_HQ.longitude,
    })
  );
}

function buildTrimSuggestions(args: {
  orderedStops: RoutePlanStopInput[];
  orderedScheduledStops: PlannedRouteStop[];
  requiredReturnBy: Date;
}) {
  if (args.orderedScheduledStops.length === 0) return [] as string[];

  for (let index = args.orderedScheduledStops.length - 1; index >= 0; index -= 1) {
    const prefixLastScheduledStop = args.orderedScheduledStops[index];
    const prefixLastInputStop = args.orderedStops[index];
    const projectedReturnTime = addMinutes(new Date(prefixLastScheduledStop.plannedDepartureTime), estimateMinutesToOrigin(prefixLastInputStop));

    if (projectedReturnTime.getTime() <= args.requiredReturnBy.getTime()) {
      return args.orderedScheduledStops.slice(index + 1).map((stop) => stop.customerId);
    }
  }

  return args.orderedScheduledStops.map((stop) => stop.customerId);
}

function evaluateShiftFeasibility(args: {
  orderedStops: RoutePlanStopInput[];
  orderedScheduledStops: Omit<PlannedRouteStop, "scheduleFlag">[];
  returnDriveMinutes: number;
  shiftStartTime: Date;
  requiredReturnBy: Date;
  projectedReturnTime: string | null;
}) {
  let firstOvertimeStopIndex: number | null = null;
  let firstOvertimeStopId: string | null = null;

  const orderedStops = args.orderedScheduledStops.map((stop, index) => {
    const stopReturnMinutes = index === args.orderedScheduledStops.length - 1 ? args.returnDriveMinutes : estimateMinutesToOrigin(args.orderedStops[index]);
    const projectedPrefixReturnTime = addMinutes(new Date(stop.plannedDepartureTime), stopReturnMinutes);
    const bufferMinutes = Math.round((args.requiredReturnBy.getTime() - projectedPrefixReturnTime.getTime()) / 60000);

    // This marks the first stop after which the rep can no longer finish service and get back to HQ by the required cutoff.
    if (bufferMinutes < 0 && firstOvertimeStopIndex === null) {
      firstOvertimeStopIndex = index;
      firstOvertimeStopId = stop.customerId;
    }

    let scheduleFlag: PlannedRouteStop["scheduleFlag"] = "on_time";
    if (bufferMinutes < 0) scheduleFlag = "overtime";
    else if (bufferMinutes <= TIGHT_RETURN_BUFFER_MINUTES) scheduleFlag = "tight";

    return {
      ...stop,
      scheduleFlag,
    } satisfies PlannedRouteStop;
  });

  const projectedReturnDate = args.projectedReturnTime ? new Date(args.projectedReturnTime) : null;
  const overtimeMinutes =
    projectedReturnDate && projectedReturnDate.getTime() > args.requiredReturnBy.getTime()
      ? Math.round((projectedReturnDate.getTime() - args.requiredReturnBy.getTime()) / 60000)
      : 0;

  return {
    orderedStops,
    projectedReturnTime: args.projectedReturnTime,
    fitsWithinShift: overtimeMinutes === 0,
    shiftStartTime: args.shiftStartTime.toISOString(),
    requiredReturnBy: args.requiredReturnBy.toISOString(),
    overtimeMinutes,
    firstOvertimeStopIndex,
    firstOvertimeStopId,
    suggestedTrimStopIds:
      overtimeMinutes > 0
        ? buildTrimSuggestions({
            orderedStops: args.orderedStops,
            orderedScheduledStops: orderedStops,
            requiredReturnBy: args.requiredReturnBy,
          })
        : [],
  };
}

function buildScheduledPlan(args: {
  orderedStops: RoutePlanStopInput[];
  legDriveMinutes: number[];
  legDistanceMeters: number[];
  returnDriveMinutes: number;
  routeDate: string;
  startTime: string;
  requiredReturnByTime: string;
  visitMinutes: number;
  lunchMinutes: number;
  polyline: string | null;
  provider: "google" | "fallback";
  warning: string | null;
}) {
  const shiftStartTime = parseStartDateTime({ routeDate: args.routeDate, startTime: args.startTime });
  const requiredReturnBy = parseStartDateTime({ routeDate: args.routeDate, startTime: args.requiredReturnByTime });
  let cursor = new Date(shiftStartTime);
  let lunchBlock: LunchBlock | null = null;
  let consumedLunchMinutes = 0;

  const orderedStops = args.orderedStops.map((stop, index) => {
    cursor = addMinutes(cursor, args.legDriveMinutes[index] || 0);
    const lunchCandidate = maybeInsertLunch({
      currentTime: cursor,
      lunchInserted: Boolean(lunchBlock),
      remainingStops: args.orderedStops.length - index,
      lunchMinutes: args.lunchMinutes,
    });
    if (lunchCandidate) {
      lunchBlock = lunchCandidate;
      consumedLunchMinutes = lunchCandidate.minutes;
      cursor = new Date(lunchCandidate.endTime);
    }

    const plannedArrivalTime = new Date(cursor);
    const plannedDepartureTime = addMinutes(plannedArrivalTime, args.visitMinutes);
    cursor = plannedDepartureTime;

    return {
      customerId: stop.customerId,
      customerName: stop.customerName,
      territoryCode: stop.territoryCode,
      routeDay: stop.routeDay,
      queueId: stop.queueId || null,
      stopOrder: index + 1,
      plannedArrivalTime: plannedArrivalTime.toISOString(),
      plannedDepartureTime: plannedDepartureTime.toISOString(),
      estimatedDriveMinutesFromPrevious: args.legDriveMinutes[index] || 0,
      estimatedVisitMinutes: args.visitMinutes,
      legDistanceMeters: args.legDistanceMeters[index] || 0,
    } satisfies Omit<PlannedRouteStop, "scheduleFlag">;
  });

  const projectedFinishTime = orderedStops.length > 0 ? cursor.toISOString() : null;
  const estimatedReturnTime = projectedFinishTime ? addMinutes(new Date(projectedFinishTime), args.returnDriveMinutes).toISOString() : null;
  const estimatedDriveMinutes = args.legDriveMinutes.reduce((sum, minutes) => sum + minutes, 0) + args.returnDriveMinutes;
  const estimatedVisitMinutes = orderedStops.length * args.visitMinutes;
  const feasibility = evaluateShiftFeasibility({
    orderedStops: args.orderedStops,
    orderedScheduledStops: orderedStops,
    returnDriveMinutes: args.returnDriveMinutes,
    shiftStartTime,
    requiredReturnBy,
    projectedReturnTime: estimatedReturnTime,
  });

  return {
    provider: args.provider,
    orderedStops: feasibility.orderedStops,
    lunchBlock,
    lunchMinutes: consumedLunchMinutes,
    estimatedDriveMinutes,
    estimatedVisitMinutes,
    estimatedTotalMinutes: estimatedDriveMinutes + estimatedVisitMinutes + consumedLunchMinutes,
    projectedFinishTime,
    estimatedReturnTime,
    projectedReturnTime: feasibility.projectedReturnTime,
    returnDriveMinutes: args.returnDriveMinutes,
    fitsWithinShift: feasibility.fitsWithinShift,
    shiftStartTime: feasibility.shiftStartTime,
    requiredReturnBy: feasibility.requiredReturnBy,
    overtimeMinutes: feasibility.overtimeMinutes,
    firstOvertimeStopIndex: feasibility.firstOvertimeStopIndex,
    firstOvertimeStopId: feasibility.firstOvertimeStopId,
    suggestedTrimStopIds: feasibility.suggestedTrimStopIds,
    polyline: args.polyline,
    warning: args.warning,
  } satisfies PlannedRoute;
}

export async function buildPlannedRoute(args: {
  stops: RoutePlanStopInput[];
  routeDate: string;
  startTime?: string | null;
  requiredReturnByTime?: string | null;
  visitMinutes?: number | null;
  lunchMinutes?: number | null;
}): Promise<PlannedRoute> {
  const startTime = parseTimeText(args.startTime, DEFAULT_SHIFT_START_TIME);
  const requiredReturnByTime = parseTimeText(args.requiredReturnByTime, DEFAULT_REQUIRED_RETURN_TIME);
  const visitMinutes = Math.max(0, Math.round(args.visitMinutes || DEFAULT_VISIT_MINUTES)) || DEFAULT_VISIT_MINUTES;
  const lunchMinutes = Math.max(0, Math.round(args.lunchMinutes ?? DEFAULT_LUNCH_MINUTES));
  const trimmedStops = args.stops;
  if (trimmedStops.length === 0) {
    return {
      provider: "fallback",
      orderedStops: [],
      lunchBlock: null,
      lunchMinutes: 0,
      estimatedDriveMinutes: 0,
      estimatedVisitMinutes: 0,
      estimatedTotalMinutes: 0,
      projectedFinishTime: null,
      estimatedReturnTime: null,
      projectedReturnTime: null,
      returnDriveMinutes: 0,
      fitsWithinShift: true,
      shiftStartTime: parseStartDateTime({ routeDate: args.routeDate, startTime }).toISOString(),
      requiredReturnBy: parseStartDateTime({ routeDate: args.routeDate, startTime: requiredReturnByTime }).toISOString(),
      overtimeMinutes: 0,
      firstOvertimeStopIndex: null,
      firstOvertimeStopId: null,
      suggestedTrimStopIds: [],
      polyline: null,
      warning: "No coordinate-ready stops were available to plan.",
    };
  }

  const routeDateTimeIso = parseStartDateTime({ routeDate: args.routeDate, startTime }).toISOString();

  let orderedStopsForPlanning = trimmedStops;
  let googlePlanningWarning: string | null = null;

  // Use Google Route Optimization for stop order only when its OAuth/project credentials are configured.
  if (canUseGoogleRouteOptimization()) {
    try {
      const optimizedOrder = await optimizeStopOrderWithGoogle({
        origin: {
          latitude: JC_RAD_HQ.latitude,
          longitude: JC_RAD_HQ.longitude,
        },
        stops: trimmedStops.map((stop) => ({
          stopId: stop.customerId,
          latitude: stop.latitude,
          longitude: stop.longitude,
        })),
        routeDateTimeIso,
        serviceDurationMinutes: visitMinutes,
      });

      const stopById = new Map(trimmedStops.map((stop) => [stop.customerId, stop]));
      const orderedStops = optimizedOrder.orderedStopIds.map((id) => stopById.get(id)).filter((stop): stop is RoutePlanStopInput => Boolean(stop));
      orderedStopsForPlanning =
        orderedStops.length === trimmedStops.length
          ? orderedStops
          : [...orderedStops, ...trimmedStops.filter((stop) => !optimizedOrder.orderedStopIds.includes(stop.customerId))];
    } catch (error) {
      orderedStopsForPlanning = buildFallbackOrder(trimmedStops);
      googlePlanningWarning = error instanceof Error ? error.message : "Google route optimization failed";
    }
  } else {
    orderedStopsForPlanning = buildFallbackOrder(trimmedStops);
    if (canUseGoogleRouteServices()) {
      googlePlanningWarning = "Google route optimization is not configured. Used heuristic stop order with Google road timing.";
    }
  }

  // Prefer Google Routes for road geometry and leg timing whenever the server routes key is available.
  if (canUseGoogleRouteServices()) {
    try {
      const routes = await computeGoogleRouteSchedule({
        origin: {
          latitude: JC_RAD_HQ.latitude,
          longitude: JC_RAD_HQ.longitude,
        },
        orderedStops: orderedStopsForPlanning.map((stop) => ({
          latitude: stop.latitude,
          longitude: stop.longitude,
        })),
      });

      const outboundLegs = routes.legs.slice(0, orderedStopsForPlanning.length);
      const returnLeg = routes.legs[orderedStopsForPlanning.length];

      return buildScheduledPlan({
        orderedStops: orderedStopsForPlanning,
        legDriveMinutes: outboundLegs.map((leg) => Math.max(0, Math.round(leg.durationSeconds / 60))),
        legDistanceMeters: outboundLegs.map((leg) => leg.distanceMeters),
        returnDriveMinutes: Math.max(0, Math.round((returnLeg?.durationSeconds || 0) / 60)),
        routeDate: args.routeDate,
        startTime,
        requiredReturnByTime,
        visitMinutes,
        lunchMinutes,
        polyline: routes.polyline,
        provider: "google",
        warning: googlePlanningWarning,
      });
    } catch (error) {
      googlePlanningWarning = [googlePlanningWarning, error instanceof Error ? error.message : "Google routing failed"].filter(Boolean).join(" ");
    }
  }

  const fallbackOrderedStops = orderedStopsForPlanning.length > 0 ? orderedStopsForPlanning : buildFallbackOrder(trimmedStops);
  const legDriveMinutes = fallbackOrderedStops.map((stop, index) => {
    if (index === 0) {
      return estimateDriveMinutes(
        haversineMiles({
          leftLat: JC_RAD_HQ.latitude,
          leftLng: JC_RAD_HQ.longitude,
          rightLat: stop.latitude,
          rightLng: stop.longitude,
        })
      );
    }
    const previous = fallbackOrderedStops[index - 1];
    return estimateDriveMinutes(
      haversineMiles({
        leftLat: previous.latitude,
        leftLng: previous.longitude,
        rightLat: stop.latitude,
        rightLng: stop.longitude,
      })
    );
  });
  const returnDriveMinutes = estimateDriveMinutes(
    haversineMiles({
      leftLat: fallbackOrderedStops[fallbackOrderedStops.length - 1].latitude,
      leftLng: fallbackOrderedStops[fallbackOrderedStops.length - 1].longitude,
      rightLat: JC_RAD_HQ.latitude,
      rightLng: JC_RAD_HQ.longitude,
    })
  );

  return buildScheduledPlan({
    orderedStops: fallbackOrderedStops,
    legDriveMinutes,
    legDistanceMeters: new Array(fallbackOrderedStops.length).fill(0),
    returnDriveMinutes,
    routeDate: args.routeDate,
    startTime,
    requiredReturnByTime,
    visitMinutes,
    lunchMinutes,
    polyline: null,
    provider: "fallback",
    warning: googlePlanningWarning || "Google routing is not configured. Used heuristic fallback order and timing.",
  });
}

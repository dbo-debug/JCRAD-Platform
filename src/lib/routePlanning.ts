import { canUseGoogleRouteServices, computeGoogleRouteSchedule, optimizeStopOrderWithGoogle } from "@/lib/googleRouteServices";

export const JC_RAD_HQ = {
  name: "JC RAD HQ",
  address: "1055 E. Cesar Chavez Ave, Los Angeles, CA 90033",
  latitude: 34.04536,
  longitude: -118.2355,
};

const DEFAULT_VISIT_MINUTES = 30;
const DEFAULT_LUNCH_MINUTES = 30;

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
  returnDriveMinutes: number;
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
}): LunchBlock | null {
  if (args.lunchInserted || args.remainingStops <= 0) return null;

  const lunchThreshold = new Date(args.currentTime);
  lunchThreshold.setHours(12, 0, 0, 0);
  if (args.currentTime.getTime() < lunchThreshold.getTime()) return null;

  const startTime = new Date(args.currentTime);
  const endTime = addMinutes(startTime, DEFAULT_LUNCH_MINUTES);
  return {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    minutes: DEFAULT_LUNCH_MINUTES,
  } satisfies LunchBlock;
}

function buildScheduledPlan(args: {
  orderedStops: RoutePlanStopInput[];
  legDriveMinutes: number[];
  legDistanceMeters: number[];
  returnDriveMinutes: number;
  routeDate: string;
  startTime: string;
  polyline: string | null;
  provider: "google" | "fallback";
  warning: string | null;
}) {
  let cursor = parseStartDateTime({ routeDate: args.routeDate, startTime: args.startTime });
  let lunchBlock: LunchBlock | null = null;
  let lunchMinutes = 0;

  const orderedStops = args.orderedStops.map((stop, index) => {
    cursor = addMinutes(cursor, args.legDriveMinutes[index] || 0);
    const lunchCandidate = maybeInsertLunch({
      currentTime: cursor,
      lunchInserted: Boolean(lunchBlock),
      remainingStops: args.orderedStops.length - index,
    });
    if (lunchCandidate) {
      lunchBlock = lunchCandidate;
      lunchMinutes = lunchCandidate.minutes;
      cursor = new Date(lunchCandidate.endTime);
    }

    const plannedArrivalTime = new Date(cursor);
    const plannedDepartureTime = addMinutes(plannedArrivalTime, DEFAULT_VISIT_MINUTES);
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
      estimatedVisitMinutes: DEFAULT_VISIT_MINUTES,
      legDistanceMeters: args.legDistanceMeters[index] || 0,
    } satisfies PlannedRouteStop;
  });

  const projectedFinishTime = orderedStops.length > 0 ? cursor.toISOString() : null;
  const estimatedReturnTime = projectedFinishTime ? addMinutes(new Date(projectedFinishTime), args.returnDriveMinutes).toISOString() : null;
  const estimatedDriveMinutes = args.legDriveMinutes.reduce((sum, minutes) => sum + minutes, 0) + args.returnDriveMinutes;
  const estimatedVisitMinutes = orderedStops.length * DEFAULT_VISIT_MINUTES;
  return {
    provider: args.provider,
    orderedStops,
    lunchBlock,
    lunchMinutes,
    estimatedDriveMinutes,
    estimatedVisitMinutes,
    estimatedTotalMinutes: estimatedDriveMinutes + estimatedVisitMinutes + lunchMinutes,
    projectedFinishTime,
    estimatedReturnTime,
    returnDriveMinutes: args.returnDriveMinutes,
    polyline: args.polyline,
    warning: args.warning,
  } satisfies PlannedRoute;
}

export async function buildPlannedRoute(args: {
  stops: RoutePlanStopInput[];
  routeDate: string;
  startTime: string;
}): Promise<PlannedRoute> {
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
      returnDriveMinutes: 0,
      polyline: null,
      warning: "No coordinate-ready stops were available to plan.",
    };
  }

  const routeDateTimeIso = parseStartDateTime({ routeDate: args.routeDate, startTime: args.startTime }).toISOString();

  if (canUseGoogleRouteServices()) {
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
      });

      const stopById = new Map(trimmedStops.map((stop) => [stop.customerId, stop]));
      const orderedStops = optimizedOrder.orderedStopIds.map((id) => stopById.get(id)).filter((stop): stop is RoutePlanStopInput => Boolean(stop));
      const fallbackOrderedStops =
        orderedStops.length === trimmedStops.length
          ? orderedStops
          : [...orderedStops, ...trimmedStops.filter((stop) => !optimizedOrder.orderedStopIds.includes(stop.customerId))];

      const routes = await computeGoogleRouteSchedule({
        origin: {
          latitude: JC_RAD_HQ.latitude,
          longitude: JC_RAD_HQ.longitude,
        },
        orderedStops: fallbackOrderedStops.map((stop) => ({
          latitude: stop.latitude,
          longitude: stop.longitude,
        })),
      });

      const outboundLegs = routes.legs.slice(0, fallbackOrderedStops.length);
      const returnLeg = routes.legs[fallbackOrderedStops.length];

      return buildScheduledPlan({
        orderedStops: fallbackOrderedStops,
        legDriveMinutes: outboundLegs.map((leg) => Math.max(0, Math.round(leg.durationSeconds / 60))),
        legDistanceMeters: outboundLegs.map((leg) => leg.distanceMeters),
        returnDriveMinutes: Math.max(0, Math.round((returnLeg?.durationSeconds || 0) / 60)),
        routeDate: args.routeDate,
        startTime: args.startTime,
        polyline: routes.polyline,
        provider: "google",
        warning: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google routing failed";
      const fallbackOrderedStops = buildFallbackOrder(trimmedStops);
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
        startTime: args.startTime,
        polyline: null,
        provider: "fallback",
        warning: message,
      });
    }
  }

  const fallbackOrderedStops = buildFallbackOrder(trimmedStops);
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
    startTime: args.startTime,
    polyline: null,
    provider: "fallback",
    warning: "Google routing is not configured. Used heuristic fallback order and timing.",
  });
}

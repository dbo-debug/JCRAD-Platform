"use client";

export type WindowWithGoogleMaps = Window & {
  google?: GoogleMapsClient;
  __jcRadGoogleMapsPromise?: Promise<GoogleMapsClient>;
  __jcRadGoogleMapsAuthFailed?: boolean;
  gm_authFailure?: () => void;
};

export type GoogleMapsClient = {
  maps: GoogleMapsNamespace;
};

export type GoogleLatLngLiteral = {
  lat: number;
  lng: number;
};

export type GoogleMapsNamespace = {
  Map: new (
    element: HTMLElement,
    options: {
      center: GoogleLatLngLiteral;
      zoom: number;
      mapTypeControl: boolean;
      streetViewControl: boolean;
      fullscreenControl: boolean;
      gestureHandling: string;
      zoomControl?: boolean;
    }
  ) => GoogleMapInstance;
  Marker: new (options: {
    map: GoogleMapInstance;
    position: GoogleLatLngLiteral;
    title: string;
    label?: {
      text: string;
      color: string;
      fontWeight: string;
    };
    icon?: GoogleMarkerIcon;
    zIndex?: number;
  }) => GoogleMarkerInstance;
  Polyline: new (options: {
    map: GoogleMapInstance;
    path: GoogleLatLngLiteral[];
    strokeColor: string;
    strokeOpacity: number;
    strokeWeight: number;
    icons?: Array<{
      icon: {
        path: string;
        strokeOpacity: number;
        strokeWeight: number;
        scale: number;
      };
      offset: string;
      repeat: string;
    }>;
  }) => GooglePolylineInstance;
  LatLngBounds: new () => GoogleLatLngBounds;
  SymbolPath: {
    CIRCLE: string;
  };
};

export type GoogleMapInstance = {
  fitBounds: (bounds: GoogleLatLngBounds, padding?: number) => void;
  panTo: (position: GoogleLatLngLiteral) => void;
  setZoom: (zoom: number) => void;
};

export type GoogleLatLngBounds = {
  extend: (position: GoogleLatLngLiteral) => void;
  isEmpty: () => boolean;
};

export type GoogleMarkerIcon = {
  path: string;
  scale: number;
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWeight: number;
};

export type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
  setZIndex: (zIndex: number) => void;
  setIcon: (icon: GoogleMarkerIcon) => void;
  addListener: (eventName: string, handler: () => void) => void;
};

export type GooglePolylineInstance = {
  setMap: (map: GoogleMapInstance | null) => void;
};

const GOOGLE_MAPS_AUTH_FAILURE_EVENT = "jc-rad-google-maps-auth-failure";
const GOOGLE_MAPS_AUTH_FAILURE_MESSAGE = "Google Maps authentication failed in this browser session.";

function emitGoogleMapsAuthFailure(message: string) {
  const win = window as WindowWithGoogleMaps;
  win.__jcRadGoogleMapsAuthFailed = true;
  window.dispatchEvent(new CustomEvent(GOOGLE_MAPS_AUTH_FAILURE_EVENT, { detail: { message } }));
}

function ensureGoogleMapsAuthFailureHook() {
  const win = window as WindowWithGoogleMaps;
  const previousHandler = win.gm_authFailure;

  win.gm_authFailure = () => {
    emitGoogleMapsAuthFailure(GOOGLE_MAPS_AUTH_FAILURE_MESSAGE);
    previousHandler?.();
  };
}

export function getGoogleMapsApiKey() {
  const value = String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY || "").trim();
  return value || null;
}

export function loadGoogleMapsClient(apiKey: string) {
  const win = window as WindowWithGoogleMaps;
  ensureGoogleMapsAuthFailureHook();

  if (win.__jcRadGoogleMapsAuthFailed) {
    return Promise.reject(new Error(GOOGLE_MAPS_AUTH_FAILURE_MESSAGE));
  }
  if (win.google?.maps) return Promise.resolve(win.google);
  if (win.__jcRadGoogleMapsPromise) return win.__jcRadGoogleMapsPromise;

  win.__jcRadGoogleMapsPromise = new Promise<GoogleMapsClient>((resolve, reject) => {
    const existingScript = document.querySelector('script[data-jc-rad-google-maps="true"]') as HTMLScriptElement | null;
    const handleReady = () => {
      if (win.__jcRadGoogleMapsAuthFailed) {
        reject(new Error(GOOGLE_MAPS_AUTH_FAILURE_MESSAGE));
        return;
      }
      if (win.google?.maps) resolve(win.google);
      else reject(new Error("Google Maps loaded without maps namespace"));
    };
    const handleError = () => reject(new Error("Google Maps failed to load"));

    if (existingScript) {
      existingScript.addEventListener("load", handleReady, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.jcRadGoogleMaps = "true";
    script.onload = handleReady;
    script.onerror = handleError;
    document.head.appendChild(script);
  }).catch((error) => {
    delete win.__jcRadGoogleMapsPromise;
    throw error;
  });

  return win.__jcRadGoogleMapsPromise;
}

export function subscribeToGoogleMapsFailures(onFailure: (message: string) => void) {
  const win = window as WindowWithGoogleMaps;
  ensureGoogleMapsAuthFailureHook();

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ message?: string }>).detail;
    onFailure(String(detail?.message || GOOGLE_MAPS_AUTH_FAILURE_MESSAGE));
  };

  window.addEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, handler as EventListener);

  if (win.__jcRadGoogleMapsAuthFailed) {
    onFailure(GOOGLE_MAPS_AUTH_FAILURE_MESSAGE);
  }

  return () => {
    window.removeEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, handler as EventListener);
  };
}

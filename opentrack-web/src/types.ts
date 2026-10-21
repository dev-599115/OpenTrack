export interface Coordinates { latitude: number; longitude: number }

export interface Location {
  name: string;
  type?: 'port' | 'locality';
  unlocode?: string;
  timezone?: string;
  coordinates?: Coordinates;
}

export interface Vessel {
  name: string;
  imo?: string;
  countryCode?: string | null;
  operator?: { name?: string; scacCode?: string };
}

export interface Milestone {
  milestone: string;
  location?: Location;
  timestamp?: string;
  vessel?: Vessel;
  voyageNumber?: string;
  /** timeline = ACTUAL + ESTIMATED events; history = ACTUAL only */
  status?: 'ACTUAL' | 'ESTIMATED';
}

export interface Hold {
  type: string;
  code?: string;
  remarks?: string;
  amountDue?: number;
  reportedAt?: string;
  resolvedAt?: string;
}

export interface Container {
  containerId: string;
  scacCode: string;
  masterBillNumber?: string;
  status: string;
  completionReason?: string;
  timestamp?: string;
  tradeType?: string;
  steamshipLine?: string;
  vessel?: Vessel;
  currentVessel?: Vessel;
  voyageNumber?: string;
  containerSize?: string;
  containerType?: string;
  grossWeight?: number;
  carrierReleasedDate?: string;
  customsReleasedDate?: string;
  etaAtTerminal?: string;
  etdFromOrigin?: string;
  lastFreeDay?: string;
  lineLastFreeDay?: string;
  detentionLastFreeDay?: string;
  appointmentDate?: string;
  demurrageOwedAtPort?: number;
  demurrageIncurred?: number;
  originPort?: Location;
  destinationPort?: Location;
  finalDestination?: Location;
  currentLocation?: Location;
  terminalAtDestinationPort?: { name: string; address?: string; firmsCode?: string };
  yardLocation?: string;
  holds?: Hold[];
  history?: Milestone[];
  timeline?: Milestone[];
  etaAtDestination?: string;
  isRailMove?: boolean;
  railCarrier?: { name?: string; scacCode?: string };
  finalRailStation?: { name?: string; unlocode?: string };
  lastFreeDayAtRailStation?: string;
  demurrageOwedAtRailStation?: number;
  trackingPage?: string;
  customFields?: unknown; // object or [] depending on account
}

export interface ContainerSummary {
  containerId: string;
  scacCode: string;
  masterBillNumber?: string;
  status: string;
  etaAtTerminal?: string;
  lastFreeDay?: string;
  demurrageOwed?: number;
  destination?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }

export interface MasterBill {
  status: 'LOCATING' | 'TRACKED' | 'ARCHIVED';
  number: string;
  scacCode?: string;
  containers?: Container[];
}

export type LngLat = [number, number];

export interface RoutePoint {
  geometry: { type: 'Point'; coordinates: LngLat };
  properties: { name?: string; city?: string; country?: string; status?: string };
}

export interface RouteSegment {
  from: RoutePoint;
  to: RoutePoint;
  points?: { geometry?: { type: 'LineString'; coordinates: LngLat[] } };
  segment: 'origin' | 'ocean' | 'destination';
  modeOfTransport: 'VESSEL' | 'BARGE' | 'TRUCK' | 'RAIL';
  eventClassifierCode: 'ACT' | 'EST';
}

export interface RouteResponse {
  data: {
    containerId: string;
    masterBillId: string;
    /** GeoJSON Point {coordinates:[lng,lat]} in practice; docs show {coordinates:{latitude,longitude}} */
    lastKnownPosition?: unknown;
    status: string;
    route: RouteSegment[];
  };
}
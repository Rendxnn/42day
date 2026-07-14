import { useEffect, useMemo } from "react";
import L from "leaflet";
import { Circle, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type DeliveryCoverageMapProps = {
  latitude: number;
  longitude: number;
  radiusKm: number;
  customerLatitude?: number;
  customerLongitude?: number;
  compact?: boolean;
  draggableMarker?: boolean;
  onLocationChange: (latitude: number, longitude: number) => void;
};

export function DeliveryCoverageMap({
  compact = false,
  customerLatitude,
  customerLongitude,
  draggableMarker = true,
  latitude,
  longitude,
  onLocationChange,
  radiusKm,
}: DeliveryCoverageMapProps) {
  const center = useMemo(() => L.latLng(latitude, longitude), [latitude, longitude]);
  const restaurantIcon = useMemo(() => L.divIcon({
    className: "parahoy-map-pin",
    html: '<span aria-hidden="true"></span>',
    iconAnchor: [18, 36],
    iconSize: [36, 36],
  }), []);
  const customerIcon = useMemo(() => L.divIcon({
    className: "parahoy-map-pin parahoy-map-pin--customer",
    html: '<span aria-hidden="true"></span>',
    iconAnchor: [18, 36],
    iconSize: [36, 36],
  }), []);
  const customerPosition = customerLatitude !== undefined && customerLongitude !== undefined
    ? L.latLng(customerLatitude, customerLongitude)
    : undefined;

  return (
    <div className={`delivery-coverage-map ${compact ? "delivery-coverage-map--compact" : ""} overflow-hidden rounded-[18px] border border-[rgba(118,93,71,0.14)]`}>
      <MapContainer
        center={center}
        className="h-full min-h-[300px] w-full sm:min-h-[380px]"
        scrollWheelZoom
        zoom={14}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle
          center={center}
          pathOptions={{ color: "#4f7a61", fillColor: "#7fb08d", fillOpacity: 0.2, weight: 2 }}
          radius={radiusKm * 1000}
        />
        <Marker
          draggable={draggableMarker}
          eventHandlers={{
            dragend: (event) => {
              const next = event.target.getLatLng();
              onLocationChange(roundCoordinate(next.lat), roundCoordinate(next.lng));
            },
          }}
          icon={restaurantIcon}
          position={center}
        />
        {customerPosition ? <Marker icon={customerIcon} position={customerPosition} /> : null}
        <MapViewport center={center} customerPosition={customerPosition} radiusKm={radiusKm} />
      </MapContainer>
    </div>
  );
}

function MapViewport({ center, customerPosition, radiusKm }: { center: L.LatLng; customerPosition?: L.LatLng; radiusKm: number }) {
  const map = useMap();

  useEffect(() => {
    const radiusMeters = Math.max(radiusKm, 0.1) * 1000;
    const bounds = customerPosition
      ? L.latLngBounds([center, customerPosition]).pad(0.25)
      : center.toBounds(radiusMeters * 2.4);
    map.fitBounds(bounds, { animate: true, padding: [24, 24], maxZoom: 16 });
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [center, customerPosition, map, radiusKm]);

  return null;
}

function roundCoordinate(value: number) {
  return Math.round(value * 10_000_000) / 10_000_000;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type SearchResult = {
  lat: string;
  lon: string;
  display_name: string;
};

type LocationMapProps = {
  initialLocation?: string;
  onConfirm: (location: {
    address: string;
    latitude: number;
    longitude: number;
  }) => void;
};

const DEFAULT_CENTER: [number, number] = [12.9141, 74.8560];

const markerIcon = L.divIcon({
  className: "civicvoice-map-marker",
  html: '<div class="civicvoice-map-marker-pin"><span></span></div>',
  iconSize: [30, 42],
  iconAnchor: [15, 40],
});

function FlyToLocation({ position }: { position: Coordinates | null }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(
        [position.latitude, position.longitude],
        17,
        { duration: 1.4 }
      );
    }
  }, [map, position]);

  return null;
}

function MapClickHandler({
  onSelect,
}: {
  onSelect: (position: Coordinates) => void;
}) {
  useMapEvents({
    click(event) {
      onSelect({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

export default function LocationMap({
  initialLocation = "",
  onConfirm,
}: LocationMapProps) {
  const [query, setQuery] = useState(initialLocation);
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const mapCenter = useMemo<[number, number]>(() => {
    return position
      ? [position.latitude, position.longitude]
      : DEFAULT_CENTER;
  }, [position]);

  async function searchLocation(event?: FormEvent) {
    event?.preventDefault();

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSearchError("Enter an address, area or landmark to search.");
      return;
    }

    setSearching(true);
    setSearchError("");
    setPosition(null);
    setSelectedAddress("");

    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        q: trimmedQuery,
        limit: "1",
        countrycodes: "in",
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("The map search service is temporarily unavailable.");
      }

      const results = (await response.json()) as SearchResult[];

      if (!results.length) {
        throw new Error(
          "Location not found. Try adding the city or landmark. Or select it manually by clicking the map and moving the pin."
        );
      }

      const result = results[0];
      const nextPosition = {
        latitude: Number(result.lat),
        longitude: Number(result.lon),
      };

      if (
        !Number.isFinite(nextPosition.latitude) ||
        !Number.isFinite(nextPosition.longitude)
      ) {
        throw new Error("The map service returned an invalid location.");
      }

      setPosition(nextPosition);
      setSelectedAddress(result.display_name);
      setQuery(result.display_name);
    } catch (error) {
      setSearchError(
        error instanceof Error
          ? error.message
          : "Unable to search for this location."
      );
    } finally {
      setSearching(false);
    }
  }

  function moveMarker(nextPosition: Coordinates) {
    setPosition(nextPosition);
    setSelectedAddress("");
    setSearchError(
      "Marker moved. Confirm the pin to use its coordinates. The address label may need updating."
    );
  }

  async function confirmLocation() {
    if (!position) {
      setSearchError("Search for a location before confirming.");
      return;
    }

    setConfirming(true);
    setSearchError("");

    try {
      let address = selectedAddress;

      // Reverse geocode a location selected manually on the map.
      if (!selectedAddress) {
        const params = new URLSearchParams({
          format: "jsonv2",
          lat: String(position.latitude),
          lon: String(position.longitude),
        });

        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );

        if (response.ok) {
          const result = await response.json();
          if (result.display_name) {
            address = result.display_name;
          }
        }
      }

      if (!address) {
        throw new Error(
          "We couldn't identify this pin's address. Move the pin near a road or landmark and try again."
        );
      }

      onConfirm({
        address,
        latitude: position.latitude,
        longitude: position.longitude,
      });
    } catch (error) {
      setSearchError(
        error instanceof Error
          ? error.message
          : "Unable to confirm this location."
      );
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <form onSubmit={searchLocation} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search area, street or landmark..."
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          aria-label="Search complaint location"
        />

        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="rounded-lg bg-[#123b70] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {searching ? "Searching..." : "Search map"}
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <MapContainer
          center={mapCenter}
          zoom={12}
          scrollWheelZoom
          className="z-0 h-80 w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FlyToLocation position={position} />
          <MapClickHandler onSelect={moveMarker} />

          {position && (
            <Marker
              position={[position.latitude, position.longitude]}
              icon={markerIcon}
              draggable
              eventHandlers={{
                dragend(event) {
                  const marker = event.target;
                  const point = marker.getLatLng();
                  moveMarker({
                    latitude: point.lat,
                    longitude: point.lng,
                  });
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <p className="text-xs text-slate-500">
        Search for a location. If it is not found, click directly on the map to choose your location manually, then drag the pin to fine-tune it.
      </p>

      {searchError && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          {searchError}
        </p>
      )}

      <button
        type="button"
        onClick={confirmLocation}
        disabled={!position || confirming}
        className="w-full rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {confirming ? "Confirming..." : "Confirm this location"}
      </button>
    </div>
  );
}

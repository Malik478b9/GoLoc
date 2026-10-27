import React, { useEffect, useMemo, useRef } from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { palette } from "../theme";
import type { MapMarker } from "./MapView";

export type { MapMarker } from "./MapView";

/**
 * Desktop/browser version of MapView: same Leaflet + OpenStreetMap page, in an
 * iframe instead of a native WebView. Markers update in place.
 */
export function MapView({ markers, center, zoom = 14, style, follow = true }: { markers: MapMarker[]; center?: { lat: number; lng: number }; zoom?: number; style?: StyleProp<ViewStyle>; follow?: boolean }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);
  const start = center ?? markers[0] ?? { lat: 20.5937, lng: 78.9629 };

  const html = useMemo(
    () => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:${palette.sand2}}
.pin{width:34px;height:34px;border-radius:17px;border:3px solid #fff;color:#fff;font:700 12px -apple-system,sans-serif;
display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.25)}</style></head>
<body><div id="m"></div><script>
var map=L.map('m',{zoomControl:true}).setView([${start.lat},${start.lng}],${zoom});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var pins={};
window.setMarkers=function(list,follow){var seen={};list.forEach(function(p){seen[p.id]=1;
var icon=L.divIcon({className:'',html:'<div class="pin" style="background:'+(p.color||'${palette.rickshaw}')+'">'+p.label+'</div>',iconSize:[34,34],iconAnchor:[17,17]});
if(pins[p.id]){pins[p.id].setLatLng([p.lat,p.lng]);pins[p.id].setIcon(icon)}else{pins[p.id]=L.marker([p.lat,p.lng],{icon:icon}).addTo(map)}});
Object.keys(pins).forEach(function(k){if(!seen[k]){map.removeLayer(pins[k]);delete pins[k]}});
if(follow&&list.length){if(list.length===1){map.panTo([list[0].lat,list[0].lng])}else{map.fitBounds(list.map(function(p){return[p.lat,p.lng]}),{padding:[50,50],maxZoom:16})}}};
parent.postMessage('goloc-map-ready','*');
</script></body></html>`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const push = () => {
    const win = frame.current?.contentWindow as (Window & { setMarkers?: (m: MapMarker[], f: boolean) => void }) | null;
    win?.setMarkers?.(markers, follow);
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data === "goloc-map-ready" && e.source === frame.current?.contentWindow) {
        ready.current = true;
        push();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready.current) push();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(markers)]);

  return (
    <View style={[{ overflow: "hidden", backgroundColor: palette.sand2 }, style]}>
      {React.createElement("iframe", {
        ref: frame,
        srcDoc: html,
        title: "Map",
        style: { border: 0, width: "100%", height: "100%" },
      })}
    </View>
  );
}

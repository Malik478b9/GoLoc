import React, { useEffect, useMemo, useRef } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { WebView, WebViewMessageEvent, WebViewProps } from "react-native-webview";

import { palette } from "../theme";

// WebView 14 is typed as a plain function component; it still forwards a ref at runtime.
type WebViewHandle = { injectJavaScript: (js: string) => void };
const RefWebView = WebView as unknown as React.ComponentType<WebViewProps & { ref?: React.Ref<WebViewHandle> }>;

export type MapMarker = { id: string; lat: number; lng: number; label: string; color?: string };

/**
 * OpenStreetMap via Leaflet in a WebView — no API keys, works in Expo Go and
 * production builds alike. Markers update in place (no reload), so a live
 * trip polled every few seconds moves smoothly.
 */
export function MapView({ markers, center, zoom = 14, style, follow = true }: { markers: MapMarker[]; center?: { lat: number; lng: number }; zoom?: number; style?: StyleProp<ViewStyle>; follow?: boolean }) {
  const ref = useRef<WebViewHandle>(null);
  const ready = useRef(false);
  const start = center ?? markers[0] ?? { lat: 20.5937, lng: 78.9629 };

  const html = useMemo(
    () => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:${palette.sand2}}
.pin{width:34px;height:34px;border-radius:17px;border:3px solid #fff;color:#fff;font:700 12px -apple-system,sans-serif;
display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.25)}</style></head>
<body><div id="m"></div><script>
var map=L.map('m',{zoomControl:false,attributionControl:true}).setView([${start.lat},${start.lng}],${zoom});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var pins={};
window.setMarkers=function(list,follow){var seen={};list.forEach(function(p){seen[p.id]=1;
var icon=L.divIcon({className:'',html:'<div class="pin" style="background:'+(p.color||'${palette.rickshaw}')+'">'+p.label+'</div>',iconSize:[34,34],iconAnchor:[17,17]});
if(pins[p.id]){pins[p.id].setLatLng([p.lat,p.lng]);pins[p.id].setIcon(icon)}else{pins[p.id]=L.marker([p.lat,p.lng],{icon:icon}).addTo(map)}});
Object.keys(pins).forEach(function(k){if(!seen[k]){map.removeLayer(pins[k]);delete pins[k]}});
if(follow&&list.length){if(list.length===1){map.panTo([list[0].lat,list[0].lng])}else{map.fitBounds(list.map(function(p){return[p.lat,p.lng]}),{padding:[50,50],maxZoom:16})}}};
window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('ready');
</script></body></html>`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const push = () => ref.current?.injectJavaScript(`window.setMarkers(${JSON.stringify(markers)},${follow});true;`);

  useEffect(() => {
    if (ready.current) push();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(markers)]);

  return (
    <View style={[{ overflow: "hidden", backgroundColor: palette.sand2 }, style]}>
      <RefWebView
        ref={ref}
        source={{ html }}
        originWhitelist={["*"]}
        onMessage={(e: WebViewMessageEvent) => {
          if (e.nativeEvent.data === "ready") {
            ready.current = true;
            push();
          }
        }}
        javaScriptEnabled
        scrollEnabled={false}
        style={{ backgroundColor: "transparent" }}
      />
    </View>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { api, currentPosition, fonts, palette, Place, radius, Sheet, space, T, toast, toastError } from "@goloc/core";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { changeCity, changePlace, useCities, usePlaceSearch } from "./data";

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  State: "map-outline", District: "grid-outline", "Mandal / taluk": "grid-outline", Region: "grid-outline",
  City: "business-outline", Town: "home-outline", Village: "leaf-outline", Area: "navigate-outline",
  Island: "boat-outline", "Place to visit": "camera-outline",
};

/** Pick where you're exploring from: any state, district, mandal, town, village or landmark in India. */
export function PlacePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [locating, setLocating] = useState(false);
  const cities = useCities();
  const results = usePlaceSearch(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!visible) setQ("");
  }, [visible]);

  const pick = async (p: Place) => {
    onClose();
    try {
      await changePlace(p);
    } catch (e) {
      toastError(e);
    }
  };

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const pos = await currentPosition();
      if (!pos) return toast("Allow location access, or search for your place instead.");
      const p = await api.get<Place>("/cities/places/reverse/", { lat: pos.lat, lng: pos.lng });
      await pick(p);
    } catch (e) {
      toastError(e);
    } finally {
      setLocating(false);
    }
  };

  const searching = debounced.trim().length >= 2;
  const rows = results.data ?? [];

  return (
    <Sheet visible={visible} onClose={onClose} title="Where are you exploring?">
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={palette.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="State, district, town or village"
          placeholderTextColor={palette.muted}
          style={styles.input}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
        {results.isFetching ? <ActivityIndicator size="small" color={palette.rickshaw} /> : q ? <Ionicons name="close-circle" size={18} color={palette.muted} onPress={() => setQ("")} /> : null}
      </View>

      <ScrollView style={{ maxHeight: 440, marginTop: space.md }} keyboardShouldPersistTaps="handled">
        {!searching ? (
          <>
            <Pressable onPress={useMyLocation} style={styles.row} disabled={locating}>
              <View style={[styles.icon, { backgroundColor: palette.rickshaw }]}>
                {locating ? <ActivityIndicator size="small" color={palette.white} /> : <Ionicons name="locate" size={18} color={palette.white} />}
              </View>
              <View style={{ flex: 1 }}>
                <T variant="bodyBold" color={palette.rickshaw}>Use my current location</T>
                <T variant="caption">Wherever you are in India</T>
              </View>
            </Pressable>
            <T variant="label" style={styles.group}>GoLoc cities</T>
            {(cities.data ?? []).map((c) => (
              <Pressable
                key={c.id}
                style={styles.row}
                onPress={async () => {
                  onClose();
                  try {
                    await changeCity(c.id);
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                <View style={styles.icon}><Ionicons name="business-outline" size={18} color={palette.rickshaw} /></View>
                <View style={{ flex: 1 }}>
                  <T variant="bodyBold">{c.name}</T>
                  <T variant="caption">{c.state}</T>
                </View>
              </Pressable>
            ))}
          </>
        ) : rows.length ? (
          rows.map((p) => (
            <Pressable key={p.id} style={styles.row} onPress={() => pick(p)}>
              <View style={styles.icon}><Ionicons name={KIND_ICON[p.kind] ?? "location-outline"} size={18} color={palette.rickshaw} /></View>
              <View style={{ flex: 1 }}>
                <T variant="bodyBold" numberOfLines={1}>{p.name}</T>
                <T variant="caption" numberOfLines={1}>{p.kind} · {p.label}</T>
              </View>
            </Pressable>
          ))
        ) : results.isFetching ? null : (
          <T variant="caption" center style={{ paddingVertical: space.xl }}>
            {results.isError ? "Search isn't reachable right now. Try again in a moment." : `No place in India called “${debounced.trim()}”. Check the spelling.`}
          </T>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.sand, borderRadius: radius.pill, paddingHorizontal: space.lg, height: 50 },
  input: { flex: 1, fontSize: 15, color: palette.ink, fontFamily: fonts.body },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 12, paddingHorizontal: 4 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.rickshawSoft, alignItems: "center", justifyContent: "center" },
  group: { marginTop: space.lg, marginBottom: space.xs, paddingHorizontal: 4 },
});

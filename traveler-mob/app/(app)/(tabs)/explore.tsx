import { Ionicons } from "@expo/vector-icons";
import { Button, Chip, Empty, ErrorView, palette, radius, SkeletonList, space, T, titleCase } from "@goloc/core";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CaptainRow } from "../../../lib/cards";
import { useCity, useCompare, useDiscovery } from "../../../lib/data";

const CATEGORIES = ["food", "heritage", "culture", "adventure", "photography", "nature", "shopping", "spiritual", "nightlife", "family"];
const SORTS = [
  ["", "Recommended"],
  ["rating", "Top rated"],
  ["price_low", "Price ↑"],
  ["price_high", "Price ↓"],
  ["trips", "Most trips"],
] as const;
const LANGS = ["English", "Hindi", "Telugu", "Tamil", "Urdu", "Rajasthani"];

export default function Explore() {
  const params = useLocalSearchParams<{ category?: string }>();
  const city = useCity();
  const compare = useCompare();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState(params.category ?? "");
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState("");
  const [language, setLanguage] = useState("");

  useEffect(() => setCategory(params.category ?? ""), [params.category]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const res = useDiscovery({ city: city?.slug, q: debounced, category, kind, sort, language, page_size: "30" });
  const rows = res.data?.results ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <T variant="title">Find Captains</T>
        <T variant="caption">{city?.name} · verified locals with clear prices</T>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={palette.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Name, trip, or CAP-ID" placeholderTextColor={palette.muted} style={styles.input} autoCapitalize="none" returnKeyType="search" />
          {q ? <Ionicons name="close-circle" size={18} color={palette.muted} onPress={() => setQ("")} /> : null}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
        <Chip label="Packages" icon="bed" active={kind === "package"} onPress={() => setKind(kind === "package" ? "" : "package")} />
        <Chip label="Day trips" icon="sunny" active={kind === "experience"} onPress={() => setKind(kind === "experience" ? "" : "experience")} />
        {CATEGORIES.map((c) => <Chip key={c} label={titleCase(c)} active={category === c} onPress={() => setCategory(category === c ? "" : c)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { paddingTop: 0 }]} style={{ flexGrow: 0 }}>
        {SORTS.map(([v, l]) => <Chip key={l} label={l} active={sort === v} onPress={() => setSort(v)} />)}
        {LANGS.map((l) => <Chip key={l} label={l} icon="language" active={language === l} onPress={() => setLanguage(language === l ? "" : l)} />)}
      </ScrollView>

      {res.isLoading ? (
        <View style={{ padding: space.lg }}><SkeletonList rows={5} /></View>
      ) : res.error ? (
        <ErrorView error={res.error} onRetry={res.refetch} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: space.lg, gap: 10, paddingBottom: compare.ids.length ? 120 : 40 }}
          onRefresh={res.refetch}
          refreshing={res.isRefetching}
          initialNumToRender={8}
          windowSize={7}
          ListHeaderComponent={<T variant="caption">{res.data?.count ?? rows.length} Captain{rows.length === 1 ? "" : "s"}{res.isFetching ? " · updating…" : ""}</T>}
          ListEmptyComponent={<Empty icon="search-outline" title="No Captains match" body="Try fewer filters or another city." />}
          renderItem={({ item }) => (
            <CaptainRow
              c={item}
              right={
                <Pressable hitSlop={10} onPress={() => compare.toggle(item.id)} accessibilityLabel="Add to compare">
                  <Ionicons name={compare.ids.includes(item.id) ? "git-compare" : "git-compare-outline"} size={22} color={compare.ids.includes(item.id) ? palette.rickshaw : palette.muted} />
                </Pressable>
              }
            />
          )}
        />
      )}

      {compare.ids.length ? (
        <View style={styles.tray}>
          <T variant="bodyBold" color={palette.white} style={{ flex: 1 }}>{compare.ids.length} selected to compare</T>
          <Button title="Clear" kind="ghost" small onPress={compare.clear} />
          <Button title="Compare" small disabled={compare.ids.length < 2} onPress={() => router.push("/compare")} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: palette.white, borderRadius: radius.md, paddingHorizontal: space.md, height: 48, marginTop: space.md, borderWidth: 1, borderColor: palette.line },
  input: { flex: 1, fontSize: 15, color: palette.ink },
  chips: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: 8 },
  tray: { position: "absolute", left: space.lg, right: space.lg, bottom: space.lg, backgroundColor: palette.ink, borderRadius: radius.lg, padding: space.md, flexDirection: "row", alignItems: "center", gap: 8 },
});

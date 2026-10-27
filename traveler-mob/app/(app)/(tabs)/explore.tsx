import { Ionicons } from "@expo/vector-icons";
import { Button, Chip, Empty, ErrorView, palette, radius, Segmented, SkeletonList, space, T, titleCase, useWide } from "@goloc/core";
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
  const params = useLocalSearchParams<{ category?: string; type?: string }>();
  const city = useCity();
  const compare = useCompare();
  const wide = useWide();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState(params.category ?? "");
  const [kind, setKind] = useState("");
  // "" = everyone, "captain" = does everything (stays, transport, packages), "guide" = walks with you, you plan the rest.
  const [type, setType] = useState<"" | "captain" | "guide">((params.type as "captain" | "guide") ?? "");
  const [sort, setSort] = useState("");
  const [language, setLanguage] = useState("");

  useEffect(() => setCategory(params.category ?? ""), [params.category]);
  useEffect(() => {
    if (params.type === "captain" || params.type === "guide") setType(params.type);
  }, [params.type]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const res = useDiscovery({ city: city?.slug, q: debounced, category, kind, type, sort, language, page_size: "30" });
  const noun = type === "guide" ? "guide" : type === "captain" ? "Captain" : "local";
  const rows = res.data?.results ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <T variant="title">Find locals</T>
        <T variant="caption">{city?.name} · verified locals with clear prices</T>
        <View style={{ marginTop: space.md }}>
          <Segmented
            options={[{ value: "", label: "All" }, { value: "captain", label: "Captains" }, { value: "guide", label: "Guides" }]}
            value={type}
            onChange={setType}
          />
          <T variant="caption" style={{ marginTop: 6 }}>
            {type === "guide"
              ? "A guide walks with you in person and shows you where to go, what to see and how to get around. You plan your own stay and travel."
              : type === "captain"
                ? "A Captain does everything: stays, meals, transport and permits, plus guiding."
                : "Captains handle everything. Guides walk with you while you plan the rest."}
          </T>
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={palette.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Name, trip, or CAP-ID" placeholderTextColor={palette.muted} style={styles.input} autoCapitalize="none" returnKeyType="search" />
          {q ? <Ionicons name="close-circle" size={18} color={palette.muted} onPress={() => setQ("")} /> : null}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
        <Chip label="Packages" icon="bed" active={kind === "package"} onPress={() => setKind(kind === "package" ? "" : "package")} />
        <Chip label="Day trips" icon="sunny" active={kind === "experience"} onPress={() => setKind(kind === "experience" ? "" : "experience")} />
        <Chip label="Guide by day" icon="walk" active={kind === "guide"} onPress={() => setKind(kind === "guide" ? "" : "guide")} />
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
          key={wide ? "grid" : "list"}
          data={rows}
          keyExtractor={(c) => c.id}
          numColumns={wide ? 2 : 1}
          columnWrapperStyle={wide ? { gap: 10 } : undefined}
          contentContainerStyle={{ padding: space.lg, gap: 10, paddingBottom: compare.ids.length ? 120 : 40 }}
          onRefresh={res.refetch}
          refreshing={res.isRefetching}
          initialNumToRender={8}
          windowSize={7}
          ListHeaderComponent={<T variant="caption">{res.data?.count ?? rows.length} {noun}{rows.length === 1 ? "" : "s"}{res.isFetching ? " · updating…" : ""}</T>}
          ListEmptyComponent={<Empty icon="search-outline" title={`No ${noun}s match`} body="Try fewer filters or another city." />}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
            <CaptainRow
              c={item}
              right={
                <Pressable hitSlop={10} onPress={() => compare.toggle(item.id)} accessibilityLabel="Add to compare">
                  <Ionicons name={compare.ids.includes(item.id) ? "git-compare" : "git-compare-outline"} size={22} color={compare.ids.includes(item.id) ? palette.rickshaw : palette.muted} />
                </Pressable>
              }
            />
            </View>
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

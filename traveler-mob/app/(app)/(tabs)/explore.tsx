import { Ionicons } from "@expo/vector-icons";
import {
  Button, Card, Chip, DateRangeCalendar, dateRange, Empty, ErrorView, longDate, palette, radius, Row, Segmented, Sheet, SkeletonList, space, T, titleCase, useWide,
} from "@goloc/core";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CaptainRow } from "../../../lib/cards";
import { useCities, useCompare, useDiscovery } from "../../../lib/data";

const CATEGORIES = ["food", "heritage", "culture", "adventure", "photography", "nature", "shopping", "spiritual", "nightlife", "family"];
const SORTS = [
  ["", "Recommended"],
  ["rating", "Top rated"],
  ["trips", "Most trips"],
  ["experience", "Most experienced"],
  ["price_low", "Price ↑"],
  ["price_high", "Price ↓"],
] as const;
const LANGS = ["English", "Hindi", "Telugu", "Tamil", "Urdu", "Rajasthani"];
// [value, label]; "" = any
const GROUPS = [["", "Any"], ["2", "2+"], ["4", "4+"], ["6", "6+"], ["8", "8+"], ["12", "12+"]] as const;
const RATINGS = [["", "Any"], ["4", "4.0+"], ["4.5", "4.5+"]] as const;
const TRIPS = [["", "Any"], ["5", "5+"], ["20", "20+"], ["50", "50+"]] as const;
const EXPERIENCE = [["", "Any"], ["2", "2+ yrs"], ["5", "5+ yrs"], ["10", "10+ yrs"]] as const;

type Filters = { guests: string; min_rating: string; min_trips: string; min_exp: string; verified: boolean; language: string; sort: string };
const NO_FILTERS: Filters = { guests: "", min_rating: "", min_trips: "", min_exp: "", verified: false, language: "", sort: "" };

function Choice({ title, options, value, onChange }: { title: string; options: readonly (readonly [string, string])[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <T variant="label" style={{ marginBottom: 8 }}>{title}</T>
      <View style={styles.wrap}>
        {options.map(([v, l]) => <Chip key={l} label={l} active={value === v} onPress={() => onChange(v)} />)}
      </View>
    </View>
  );
}

export default function Explore() {
  const params = useLocalSearchParams<{ category?: string; type?: string; city?: string }>();
  const cities = useCities();
  const compare = useCompare();
  const wide = useWide();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  // "" = every live city, so nobody is hidden just because the traveler's home city has no locals yet.
  const [city, setCity] = useState(params.city ?? "");
  const [category, setCategory] = useState(params.category ?? "");
  const [kind, setKind] = useState("");
  // "" = everyone, "captain" = does everything (stays, transport, packages), "guide" = walks with you, you plan the rest.
  const [type, setType] = useState<"" | "captain" | "guide">((params.type as "captain" | "guide") ?? "");
  // Arrival / departure: only locals free on every one of these days are listed.
  const [start, setStart] = useState<string | undefined>();
  const [end, setEnd] = useState<string | undefined>();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [sheet, setSheet] = useState(false);

  useEffect(() => setCategory(params.category ?? ""), [params.category]);
  useEffect(() => {
    if (params.city) setCity(params.city);
  }, [params.city]);
  useEffect(() => {
    if (params.type === "captain" || params.type === "guide") setType(params.type);
  }, [params.type]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const res = useDiscovery({
    city, q: debounced, category, kind, type, start, end: start ? end : undefined,
    guests: filters.guests, min_rating: filters.min_rating, min_trips: filters.min_trips, min_exp: filters.min_exp,
    verified: filters.verified ? "1" : undefined, language: filters.language, sort: filters.sort, page_size: "30",
  });
  const noun = type === "guide" ? "guide" : type === "captain" ? "Captain" : "local";
  const rows = res.data?.results ?? [];
  const activeFilters = (Object.keys(NO_FILTERS) as (keyof Filters)[]).filter((k) => filters[k] !== NO_FILTERS[k]).length;
  const cityName = cities.data?.find((c) => c.slug === city)?.name;
  const when = start ? (end && end !== start ? dateRange(start, end) : longDate(start)) : "";
  const freeLabel = start ? (end && end !== start ? `Free ${dateRange(start, end)}` : `Free on ${longDate(start)}`) : undefined;

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.sm }}>
      <View>
        <T variant="title">Find locals</T>
        <T variant="caption">Search by name, city or trip · verified locals with clear prices</T>
      </View>
      <View>
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
        <TextInput value={q} onChangeText={setQ} placeholder="Name, city, trip or CAP-ID" placeholderTextColor={palette.muted} style={styles.input} autoCapitalize="none" returnKeyType="search" />
        {q ? <Ionicons name="close-circle" size={18} color={palette.muted} onPress={() => setQ("")} /> : null}
      </View>

      <Card>
        <Row style={{ justifyContent: "space-between", marginBottom: space.sm }}>
          <T variant="bodyBold">When are you visiting?</T>
          {start ? <Pressable hitSlop={8} onPress={() => { setStart(undefined); setEnd(undefined); }}><T variant="small" color={palette.rickshaw}>Any dates</T></Pressable> : null}
        </Row>
        <DateRangeCalendar start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} maxSpan={60} />
        {start ? <T variant="caption" style={{ marginTop: 6 }}>Showing only {noun}s free on every day you're there.</T> : null}
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All cities" icon="earth" active={!city} onPress={() => setCity("")} />
        {(cities.data ?? []).map((c) => <Chip key={c.id} label={c.name} active={city === c.slug} onPress={() => setCity(city === c.slug ? "" : c.slug)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={activeFilters ? `Filters · ${activeFilters}` : "Filters"} icon="options" active={!!activeFilters} onPress={() => { setDraft(filters); setSheet(true); }} />
        <Chip label="Packages" icon="bed" active={kind === "package"} onPress={() => setKind(kind === "package" ? "" : "package")} />
        <Chip label="Day trips" icon="sunny" active={kind === "experience"} onPress={() => setKind(kind === "experience" ? "" : "experience")} />
        <Chip label="Guide by day" icon="walk" active={kind === "guide"} onPress={() => setKind(kind === "guide" ? "" : "guide")} />
        {CATEGORIES.map((c) => <Chip key={c} label={titleCase(c)} active={category === c} onPress={() => setCategory(category === c ? "" : c)} />)}
      </ScrollView>
      <T variant="caption">
        {res.data?.count ?? rows.length} {noun}{(res.data?.count ?? rows.length) === 1 ? "" : "s"}
        {cityName ? ` in ${cityName}` : " across all cities"}
        {when ? ` · free ${when}` : ""}
        {res.isFetching ? " · updating…" : ""}
      </T>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }} edges={["top"]}>
      {res.error && !res.data ? (
        <View style={{ flex: 1, padding: space.lg }}>
          {header}
          <ErrorView error={res.error} onRetry={res.refetch} />
        </View>
      ) : (
        <FlatList
          key={wide ? "grid" : "list"}
          data={res.isLoading ? [] : rows}
          keyExtractor={(c) => c.id}
          numColumns={wide ? 2 : 1}
          columnWrapperStyle={wide ? { gap: 10 } : undefined}
          contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: 10, paddingBottom: compare.ids.length ? 120 : 40 }}
          keyboardShouldPersistTaps="handled"
          onRefresh={res.refetch}
          refreshing={res.isRefetching}
          initialNumToRender={8}
          windowSize={7}
          ListHeaderComponent={header}
          ListEmptyComponent={
            res.isLoading ? <SkeletonList rows={5} /> : (
              <Empty
                icon={start ? "calendar-outline" : "search-outline"}
                title={start ? `No ${noun}s free on those dates` : `No ${noun}s match`}
                body={start ? "Try other dates, or clear them to see everyone and check each calendar." : cityName ? `Try All cities, or fewer filters.` : "Try fewer filters."}
              />
            )
          }
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <CaptainRow
                c={item}
                note={freeLabel}
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

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Filters">
        <ScrollView style={{ maxHeight: 520 }}>
          <Choice title="Group size" options={GROUPS} value={draft.guests} onChange={(guests) => setDraft({ ...draft, guests })} />
          <Choice title="Rating" options={RATINGS} value={draft.min_rating} onChange={(min_rating) => setDraft({ ...draft, min_rating })} />
          <Choice title="Trips completed" options={TRIPS} value={draft.min_trips} onChange={(min_trips) => setDraft({ ...draft, min_trips })} />
          <Choice title="Experience" options={EXPERIENCE} value={draft.min_exp} onChange={(min_exp) => setDraft({ ...draft, min_exp })} />
          <Choice title="Speaks" options={[["", "Any"], ...LANGS.map((l) => [l, l] as const)]} value={draft.language} onChange={(language) => setDraft({ ...draft, language })} />
          <Choice title="Sort by" options={SORTS} value={draft.sort} onChange={(sort) => setDraft({ ...draft, sort })} />
          <Row style={{ justifyContent: "space-between", marginBottom: space.lg }}>
            <View style={{ flex: 1 }}>
              <T variant="bodyBold">GoLoc Verified only</T>
              <T variant="caption">Locals GoLoc has personally vetted.</T>
            </View>
            <Switch value={draft.verified} onValueChange={(verified) => setDraft({ ...draft, verified })} trackColor={{ true: palette.rickshaw }} />
          </Row>
        </ScrollView>
        <Row gap={10} style={{ marginTop: space.sm }}>
          <Button title="Reset" kind="secondary" style={{ flex: 1 }} onPress={() => setDraft(NO_FILTERS)} />
          <Button title="Show results" style={{ flex: 2 }} onPress={() => { setFilters(draft); setSheet(false); }} />
        </Row>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: palette.white, borderRadius: radius.md, paddingHorizontal: space.md, height: 48, borderWidth: 1, borderColor: palette.line },
  input: { flex: 1, fontSize: 15, color: palette.ink },
  chips: { gap: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tray: { position: "absolute", left: space.lg, right: space.lg, bottom: space.lg, backgroundColor: palette.ink, borderRadius: radius.lg, padding: space.md, flexDirection: "row", alignItems: "center", gap: 8 },
});

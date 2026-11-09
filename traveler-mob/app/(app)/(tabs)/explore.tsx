import { Ionicons } from "@expo/vector-icons";
import {
  Button, Chip, DateRangeCalendar, dateRange, Empty, ErrorView, fonts, longDate, palette, radius, Row, Segmented, shadow, Sheet, SkeletonList, space, T, titleCase, useWide,
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
    <View style={{ marginBottom: space.xl }}>
      <T variant="label" style={{ marginBottom: 10 }}>{title}</T>
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
  const [datesOpen, setDatesOpen] = useState(false);

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
    <View style={{ paddingBottom: space.lg }}>
      <T variant="display">Find a local</T>
      <T variant="caption" style={{ marginTop: 4 }}>
        {type === "guide"
          ? "Guides walk with you. You plan your own stay and travel."
          : type === "captain"
            ? "Captains handle everything: stay, meals, transport and guiding."
            : "Verified locals with clear prices."}
      </T>

      <View style={[styles.search, { marginTop: space.xl }]}>
        <Ionicons name="search" size={19} color={palette.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Name, city, trip or GLAC-ID" placeholderTextColor={palette.muted} style={styles.input} autoCapitalize="none" returnKeyType="search" />
        {q ? <Ionicons name="close-circle" size={18} color={palette.muted} onPress={() => setQ("")} /> : null}
      </View>

      <View style={{ marginTop: space.lg }}>
        <Segmented
          options={[{ value: "", label: "All" }, { value: "captain", label: "Captains" }, { value: "guide", label: "Guides" }]}
          value={type}
          onChange={setType}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
        <Chip label={when || "Any dates"} icon="calendar-outline" active={!!start} onPress={() => setDatesOpen(true)} />
        <Chip label={activeFilters ? `Filters · ${activeFilters}` : "Filters"} icon="options-outline" active={!!activeFilters} onPress={() => { setDraft(filters); setSheet(true); }} />
        <Chip label="All cities" active={!city} onPress={() => setCity("")} />
        {(cities.data ?? []).map((c) => <Chip key={c.id} label={c.name} active={city === c.slug} onPress={() => setCity(city === c.slug ? "" : c.slug)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ marginTop: space.sm, marginHorizontal: -space.xl }}>
        <Chip label="Packages" active={kind === "package"} onPress={() => setKind(kind === "package" ? "" : "package")} />
        <Chip label="Day trips" active={kind === "experience"} onPress={() => setKind(kind === "experience" ? "" : "experience")} />
        <Chip label="Guide by day" active={kind === "guide"} onPress={() => setKind(kind === "guide" ? "" : "guide")} />
        {CATEGORIES.map((c) => <Chip key={c} label={titleCase(c)} active={category === c} onPress={() => setCategory(category === c ? "" : c)} />)}
      </ScrollView>

      <T variant="caption" style={{ marginTop: space.xl }}>
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
        <View style={{ flex: 1, padding: space.xl }}>
          {header}
          <ErrorView error={res.error} onRetry={res.refetch} />
        </View>
      ) : (
        <FlatList
          key={wide ? "grid" : "list"}
          data={res.isLoading ? [] : rows}
          keyExtractor={(c) => c.id}
          numColumns={wide ? 2 : 1}
          columnWrapperStyle={wide ? { gap: space.lg } : undefined}
          contentContainerStyle={{ padding: space.xl, paddingTop: space.lg, gap: space.lg, paddingBottom: compare.ids.length ? 120 : 48 }}
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

      <Sheet visible={datesOpen} onClose={() => setDatesOpen(false)} title="When are you visiting?">
        <T variant="caption" style={{ marginBottom: space.md }}>We'll show only {noun}s free on every day you're there.</T>
        <DateRangeCalendar start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e); }} maxSpan={60} />
        <Row gap={10} style={{ marginTop: space.lg }}>
          <Button title="Any dates" kind="secondary" style={{ flex: 1 }} onPress={() => { setStart(undefined); setEnd(undefined); setDatesOpen(false); }} />
          <Button title="Done" style={{ flex: 2 }} onPress={() => setDatesOpen(false)} />
        </Row>
      </Sheet>

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
  search: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: palette.paper, borderRadius: radius.pill, paddingHorizontal: space.xl, height: 56, ...shadow },
  input: { flex: 1, fontSize: 15, color: palette.ink, fontFamily: fonts.body },
  chipRow: { marginTop: space.xl, marginHorizontal: -space.xl },
  chips: { gap: 8, paddingHorizontal: space.xl },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tray: { position: "absolute", left: space.xl, right: space.xl, bottom: space.lg, backgroundColor: palette.night, borderRadius: radius.xl, padding: space.md, paddingLeft: space.lg, flexDirection: "row", alignItems: "center", gap: 8, ...shadow },
});

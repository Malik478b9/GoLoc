import { Ionicons } from "@expo/vector-icons";
import {
  api, Avatar, Badge, Button, Calendar, CaptainCard, Card, Chip, DateRangeCalendar, dateRange, Empty, Field, isoDate, longDate, money,
  palette, Quote, radius, Rating, Row, Screen, space, Stepper, T, TIER_LABEL, titleCase, tripDays,
} from "@goloc/core";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useCities, useCity } from "../../lib/data";

type Match = {
  captain: CaptainCard;
  service: { id: string; title: string; kind: string; category: string };
  quote: Quote;
  match: number;
  available: boolean;
  unavailable_reason: string | null;
  within_budget: boolean;
};
const INTERESTS = ["food", "heritage", "culture", "adventure", "photography", "nature", "shopping", "spiritual", "nightlife", "family", "wildlife", "trekking"];
const LANGS = ["English", "Hindi", "Telugu", "Tamil", "Urdu", "Rajasthani"];

export default function BuildTrip() {
  const current = useCity();
  const cities = useCities();
  const [step, setStep] = useState(0);
  const [city, setCity] = useState<string | undefined>(current?.slug);
  const [kind, setKind] = useState<"experience" | "guide" | "package">("experience");
  const [tier, setTier] = useState<"normal" | "medium" | "lavish">("medium");
  const [date, setDate] = useState<string | undefined>(isoDate(new Date(Date.now() + 3 * 86400000)));
  const [end, setEnd] = useState<string | undefined>();
  const multiDay = kind !== "experience";
  const datesReady = !!date && (!multiDay || !!end);
  const whenLabel = date ? (multiDay && end ? `${dateRange(date, end)} · ${tripDays(date, end)} days` : longDate(date)) : "";
  const [guests, setGuests] = useState(2);
  const [interests, setInterests] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [budget, setBudget] = useState("");

  const match = useMutation({
    mutationFn: () =>
      api.post<{ tier: string; results: Match[] }>("/captains/match/", {
        city: city ?? current?.slug, start_date: date, end_date: multiDay ? end : undefined, guests, kind, tier, interests, languages, budget: budget ? Number(budget) : null,
      }),
    onSuccess: () => setStep(3),
  });
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const steps = [
    // 0 — what kind of trip
    <View key="0" style={{ gap: space.md }}>
      <T variant="h2">Where to?</T>
      <View style={styles.wrap}>
        {(cities.data ?? []).map((c) => <Chip key={c.id} label={c.name} active={(city ?? current?.slug) === c.slug} onPress={() => setCity(c.slug)} />)}
      </View>
      <T variant="h2" style={{ marginTop: space.md }}>How do you want to travel?</T>
      {([
        ["package", "briefcase", "Hire a Captain · they do everything", "Multi-day. Your Captain books stays, meals, cabs and permits, and guides you too."],
        ["guide", "walk", "Plan it yourself · hire a guide", "A local guide walks with you each day, showing where to go, what to see and how to get around. You book your own stay and travel."],
        ["experience", "sunny", "Just a day experience", "A food trail, heritage walk or day trip. A few hours, no hotel."],
      ] as const).map(([v, icon, title, body]) => (
        <Pressable key={v} onPress={() => setKind(v)} style={[styles.option, kind === v && styles.optionActive]}>
          <View style={styles.optIcon}><Ionicons name={icon} size={22} color={palette.rickshaw} /></View>
          <View style={{ flex: 1 }}>
            <T variant="h2">{title}</T>
            <T variant="caption">{body}</T>
          </View>
          <Ionicons name={kind === v ? "radio-button-on" : "radio-button-off"} size={22} color={kind === v ? palette.rickshaw : palette.muted} />
        </Pressable>
      ))}
      {kind === "package" ? (
        <>
          <T variant="h2" style={{ marginTop: space.md }}>Comfort level</T>
          <Row gap={8}>
            {(["normal", "medium", "lavish"] as const).map((t) => (
              <Pressable key={t} onPress={() => setTier(t)} style={[styles.tier, tier === t && styles.optionActive]}>
                <T variant="bodyBold">{TIER_LABEL[t]}</T>
                <T variant="caption" style={{ fontSize: 11 }}>{t === "normal" ? "Guesthouse · local food" : t === "medium" ? "3★ · private cab" : "4–5★ · fine dining"}</T>
              </Pressable>
            ))}
          </Row>
        </>
      ) : null}
    </View>,
    // 1 — when & who
    <View key="1" style={{ gap: space.md }}>
      <Card>
        {multiDay ? (
          <>
            <T variant="h2">Arrival and return</T>
            <T variant="caption" style={{ marginBottom: space.md }}>Tap the day you arrive, then the day you leave.</T>
            <DateRangeCalendar start={date} end={end} onChange={(s, e) => { setDate(s); setEnd(e); }} maxSpan={30} />
          </>
        ) : (
          <>
            <T variant="h2" style={{ marginBottom: space.md }}>Date</T>
            <Calendar value={date} onChange={setDate} />
            {date ? <T variant="bodyBold" color={palette.rickshaw} style={{ marginTop: 6 }}>{longDate(date)}</T> : null}
          </>
        )}
      </Card>
      <Card><Stepper label="Travelers" value={guests} onChange={setGuests} max={kind === "package" ? 8 : 12} /></Card>
      <Field label="Budget for the whole trip (optional)" prefix="₹" keyboardType="number-pad" value={budget} onChangeText={(v) => setBudget(v.replace(/\D/g, ""))} placeholder="e.g. 50000" />
    </View>,
    // 2 — interests
    <View key="2" style={{ gap: space.md }}>
      <T variant="h2">What do you love?</T>
      <View style={styles.wrap}>{INTERESTS.map((i) => <Chip key={i} label={titleCase(i)} active={interests.includes(i)} onPress={() => toggle(interests, setInterests, i)} />)}</View>
      <T variant="h2" style={{ marginTop: space.md }}>Languages you speak</T>
      <View style={styles.wrap}>{LANGS.map((l) => <Chip key={l} label={l} active={languages.includes(l)} onPress={() => toggle(languages, setLanguages, l)} />)}</View>
    </View>,
    // 3 — matches
    <View key="3" style={{ gap: space.md }}>
      <T variant="caption">
        {kind === "package" ? `${TIER_LABEL[tier]} package` : kind === "guide" ? "Guide by the day" : "Day experience"} · {guests} traveler{guests > 1 ? "s" : ""} · {whenLabel}
      </T>
      {(match.data?.results ?? []).length === 0 ? (
        <Empty icon="search-outline" title="No matches yet" body={kind === "package" ? "Try a longer stay (packages must fit between arrival and return), another date, or hire a guide instead." : "Try other dates, fewer interests, or a different way to travel."} action="Change plan" onAction={() => setStep(0)} />
      ) : (
        match.data!.results.map((m) => (
          <Card key={m.captain.id} onPress={() => router.push({ pathname: "/book/[serviceId]", params: {
            serviceId: m.service.id, date: m.available ? date : undefined, end: m.available && kind === "guide" ? end : undefined, guests: String(guests), tier,
          } })}>
            <Row gap={space.md}>
              <Avatar uri={m.captain.avatar} name={m.captain.name} size={52} verified />
              <View style={{ flex: 1 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <T variant="h2">{m.captain.name}</T>
                  <Badge label={`${m.match}% match`} bg={palette.successSoft} fg={palette.success} />
                </Row>
                <T variant="caption" numberOfLines={1}>{m.service.title}</T>
                <Rating value={m.captain.rating_avg} count={m.captain.rating_count} />
              </View>
            </Row>
            <Row style={{ justifyContent: "space-between", marginTop: space.md }}>
              {m.available ? (
                <Badge label="Available" icon="checkmark-circle" bg={palette.successSoft} fg={palette.success} />
              ) : (
                <Badge label={m.unavailable_reason ?? "Unavailable"} bg={palette.coralSoft} fg={palette.coral} />
              )}
              <View style={{ alignItems: "flex-end" }}>
                <T variant="h2">{money(m.quote.total)}</T>
                <T variant="caption" style={{ fontSize: 11 }}>incl. insurance{m.within_budget ? "" : " · over budget"}</T>
              </View>
            </Row>
          </Card>
        ))
      )}
    </View>,
  ];

  const titles = ["Plan your trip", "When & who", "Your interests", "Your matches"];
  return (
    <Screen
      title={titles[step]}
      subtitle={step < 3 ? `Step ${step + 1} of 3` : `${match.data?.results.length ?? 0} matches`}
      footer={
        step < 3 ? (
          <Row gap={10}>
            {step > 0 ? <Button title="Back" kind="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
            <Button
              title={step === 2 ? "Find my Captains" : "Next"}
              loading={match.isPending}
              disabled={step === 1 && !datesReady}
              onPress={() => (step === 2 ? match.mutate() : setStep(step + 1))}
              style={{ flex: 2 }}
            />
          </Row>
        ) : (
          <Button title="Adjust plan" kind="secondary" onPress={() => setStep(0)} />
        )
      }
    >
      {match.error && step === 2 ? <T color={palette.coral} style={{ marginBottom: space.md }}>{(match.error as any).message}</T> : null}
      {steps[step]}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: palette.line, backgroundColor: palette.paper },
  optionActive: { borderColor: palette.rickshaw, backgroundColor: palette.rickshawSoft },
  optIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: palette.white, alignItems: "center", justifyContent: "center" },
  tier: { flex: 1, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.line, backgroundColor: palette.paper },
});

import {
  AIButton, AIField, api, ApiError, Banner, Button, Card, Field, Itinerary, ItineraryContent, ItineraryDay, ItineraryPoster, Loading, Row, Screen,
  ScheduleItem, Sheet, space, T, toast, Toggle, useAIEnabled,
} from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { fromLines, toLines } from "../../../../lib/itinerary";

const TYPES: ScheduleItem["type"][] = ["travel", "sightseeing", "meal", "stay", "activity", "ticket", "free"];

/** Schedule as editable text: one line per item, "09:00 | Activity | Place | details". */
const scheduleToText = (items: ScheduleItem[] = []) =>
  items.map((s) => [s.time, s.activity, s.place, s.details].map((x) => x ?? "").join(" | ").replace(/( \| )+$/, "")).join("\n");

function textToSchedule(text: string, previous: ScheduleItem[] = []): ScheduleItem[] {
  return toLines(text).map((line, i) => {
    const [time = "", activity = "", place = "", details = ""] = line.split("|").map((x) => x.trim());
    const old = previous.find((p) => p.activity === activity) ?? previous[i];
    const guess: ScheduleItem["type"] = /lunch|dinner|breakfast|meal|café|cafe/i.test(activity) ? "meal" : /drive|flight|train|transfer|pickup|drop/i.test(activity) ? "travel" : "sightseeing";
    return { time, activity, place, details, type: old && TYPES.includes(old.type) ? old.type : guess, cost: old?.cost ?? "" };
  });
}

type DayForm = { title: string; overview: string; schedule: string; hotel: string; area: string; confirmed: boolean; breakfast: string; lunch: string; dinner: string; transport: string; tips: string };

const dayToForm = (d: ItineraryDay): DayForm => ({
  title: d.title ?? "", overview: d.overview ?? "", schedule: scheduleToText(d.schedule), hotel: d.stay?.hotel ?? "", area: d.stay?.area ?? "",
  confirmed: !!d.stay?.confirmed, breakfast: d.meals?.breakfast ?? "", lunch: d.meals?.lunch ?? "", dinner: d.meals?.dinner ?? "",
  transport: d.transport ?? "", tips: fromLines(d.tips),
});

/** The form back into a day, keeping fields the form doesn't show (tickets, costs, item types). */
const formToDay = (f: DayForm, i: number, old?: ItineraryDay): ItineraryDay => ({
  ...(old as ItineraryDay),
  day: i + 1,
  title: f.title.trim(),
  overview: f.overview.trim(),
  schedule: textToSchedule(f.schedule, old?.schedule),
  stay: { ...old?.stay, hotel: f.hotel.trim(), area: f.area.trim(), confirmed: f.confirmed, category: old?.stay?.category ?? "", notes: old?.stay?.notes ?? "" },
  meals: { breakfast: f.breakfast.trim(), lunch: f.lunch.trim(), dinner: f.dinner.trim() },
  transport: f.transport.trim(),
  tips: toLines(f.tips),
});

export default function EditItinerary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const aiOn = useAIEnabled();
  const q = useQuery({ queryKey: ["itinerary", id], queryFn: () => api.get<Itinerary>(`/captain/itineraries/${id}/`) });
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [highlights, setHighlights] = useState("");
  const [days, setDays] = useState<DayForm[]>([]);
  const [extras, setExtras] = useState<(ItineraryDay | undefined)[]>([]);
  const [open, setOpen] = useState(0);
  const [poster, setPoster] = useState<Partial<ItineraryPoster>>({});
  const [posterHighlights, setPosterHighlights] = useState("");
  const [rewriteIndex, setRewriteIndex] = useState<number | null>(null);
  const [rewriteText, setRewriteText] = useState("");

  useEffect(() => {
    const it = q.data;
    if (!it) return;
    setTitle(it.content.title || it.title);
    setSummary(it.content.summary ?? "");
    setHighlights(fromLines(it.content.highlights));
    setDays((it.content.days ?? []).map(dayToForm));
    setExtras(it.content.days ?? []);
    setPoster(it.poster);
    setPosterHighlights(fromLines(it.poster.highlights));
  }, [q.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDay = (i: number, patch: Partial<DayForm>) => setDays((all) => all.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const rewrite = useMutation({
    mutationFn: (i: number) =>
      api.post<ItineraryDay>(`/captain/itineraries/${id}/days/${i + 1}/rewrite/`, { instructions: rewriteText.trim(), day: formToDay(days[i], i, extras[i]) }),
    onSuccess: (day, i) => {
      setDay(i, dayToForm(day));
      setExtras((all) => all.map((d, j) => (j === i ? day : d)));
      setRewriteIndex(null);
      setRewriteText("");
      toast(`Day ${i + 1} rewritten. Check it, then save.`, "success");
    },
  });

  const save = useMutation({
    mutationFn: () => {
      const it = q.data!;
      const content: Partial<ItineraryContent> = {
        ...it.content,
        title: title.trim(),
        summary: summary.trim(),
        highlights: toLines(highlights),
        days: days.map((f, i) => formToDay(f, i, extras[i])),
      };
      return api.patch<Itinerary>(`/captain/itineraries/${id}/`, {
        title: title.trim() || it.title, content, poster: { ...poster, highlights: toLines(posterHighlights).slice(0, 5) },
      });
    },
    onSuccess: (it) => {
      qc.setQueryData(["itinerary", id], it);
      qc.invalidateQueries({ queryKey: ["itineraries"] });
      toast("Itinerary saved", "success");
      router.back();
    },
  });

  if (q.isLoading || !q.data) return <Loading />;
  const err = save.error as ApiError | null;
  const trip = { trip: title, destination: q.data.destination, comfort_level: q.data.tier_label, days: days.length, travelers: q.data.guests };
  const dayCtx = (i: number) => ({ ...trip, day: i + 1, day_title: days[i]?.title, stay_area: days[i]?.area });

  return (
    <Screen title="Edit itinerary" subtitle={q.data.code} footer={<Button title="Save changes" loading={save.isPending} onPress={() => save.mutate()} />}>
      {aiOn ? <T variant="caption" style={{ marginBottom: space.md }}>Tap ✨ AI on any field to improve, shorten, expand or translate it.</T> : null}
      <AIField purpose="itinerary_title" context={trip} label="Title" value={title} onChangeText={setTitle} maxLength={140} />
      <AIField purpose="itinerary_summary" context={trip} label="Summary" multiline value={summary} onChangeText={setSummary} maxLength={1500} />
      <AIField purpose="itinerary_highlights" context={trip} label="Highlights (one per line)" multiline value={highlights} onChangeText={setHighlights} />

      <T variant="title" style={{ marginTop: space.md, marginBottom: space.sm }}>Days</T>
      <T variant="caption" style={{ marginBottom: space.md }}>Schedule: one line per stop, written as time | activity | place | details.</T>
      {days.map((d, i) => (
        <Card key={i} style={{ marginBottom: space.md }}>
          <Pressable onPress={() => setOpen(open === i ? -1 : i)}>
            <Row style={{ justifyContent: "space-between" }}>
              <T variant="h2" style={{ flex: 1 }}>Day {i + 1} · {d.title || "Untitled"}</T>
              <T variant="caption">{open === i ? "Close" : "Edit"}</T>
            </Row>
          </Pressable>
          {open === i ? (
            <View style={{ marginTop: space.md }}>
              {aiOn ? (
                <Row style={{ marginBottom: space.md }}>
                  <AIButton label="Rewrite this day with AI" onPress={() => setRewriteIndex(i)} />
                </Row>
              ) : null}
              <AIField purpose="itinerary_day_title" context={dayCtx(i)} label="Day title" value={d.title} onChangeText={(v) => setDay(i, { title: v })} />
              <AIField purpose="itinerary_overview" context={dayCtx(i)} label="Overview" multiline value={d.overview} onChangeText={(v) => setDay(i, { overview: v })} />
              <AIField purpose="itinerary_schedule" context={dayCtx(i)} label="Schedule" multiline value={d.schedule} onChangeText={(v) => setDay(i, { schedule: v })}
                placeholder={"09:00 | Breakfast | Hotel\n10:00 | Visit | Shanti Stupa | Sunrise views"} />
              <AIField purpose="itinerary_hotel" context={dayCtx(i)} label="Hotel" value={d.hotel} onChangeText={(v) => setDay(i, { hotel: v })} placeholder="Hotel name" />
              <Field label="Area" value={d.area} onChangeText={(v) => setDay(i, { area: v })} />
              <Toggle label="Hotel confirmed" hint="Off = suggestion still to book" value={d.confirmed} onChange={(v) => setDay(i, { confirmed: v })} />
              <AIField purpose="itinerary_meal" context={{ ...dayCtx(i), meal: "breakfast" }} label="Breakfast" value={d.breakfast} onChangeText={(v) => setDay(i, { breakfast: v })} />
              <AIField purpose="itinerary_meal" context={{ ...dayCtx(i), meal: "lunch" }} label="Lunch" value={d.lunch} onChangeText={(v) => setDay(i, { lunch: v })} />
              <AIField purpose="itinerary_meal" context={{ ...dayCtx(i), meal: "dinner" }} label="Dinner" value={d.dinner} onChangeText={(v) => setDay(i, { dinner: v })} />
              <AIField purpose="itinerary_transport" context={dayCtx(i)} label="Transport" value={d.transport} onChangeText={(v) => setDay(i, { transport: v })} />
              <AIField purpose="itinerary_tips" context={dayCtx(i)} label="Tips (one per line)" multiline value={d.tips} onChangeText={(v) => setDay(i, { tips: v })} />
            </View>
          ) : null}
        </Card>
      ))}

      <T variant="title" style={{ marginTop: space.md, marginBottom: space.sm }}>Poster</T>
      <AIField purpose="poster_headline" context={trip} label="Headline" value={poster.headline ?? ""} onChangeText={(v) => setPoster({ ...poster, headline: v })} maxLength={80} />
      <AIField purpose="poster_tagline" context={trip} label="Tagline" value={poster.tagline ?? ""} onChangeText={(v) => setPoster({ ...poster, tagline: v })} maxLength={140} />
      <Field label="Duration label" value={poster.duration_label ?? ""} onChangeText={(v) => setPoster({ ...poster, duration_label: v })} placeholder="5 Days · 4 Nights" maxLength={40} />
      <AIField purpose="poster_price_line" context={trip} label="Price line" value={poster.price_line ?? ""} onChangeText={(v) => setPoster({ ...poster, price_line: v })} placeholder="From ₹38,000 per person" maxLength={80} />
      <AIField purpose="poster_highlights" context={trip} label="Highlights (up to 5, one per line)" multiline value={posterHighlights} onChangeText={setPosterHighlights} />
      {err ? <Banner tone="danger" title={err.message} /> : null}

      <Sheet visible={rewriteIndex !== null} onClose={() => setRewriteIndex(null)} title={`Rewrite day ${(rewriteIndex ?? 0) + 1} with AI`}>
        <T variant="caption" style={{ marginBottom: space.md }}>The AI rewrites this day only, keeping your hotel names. You review it before saving.</T>
        <Field multiline autoFocus value={rewriteText} onChangeText={setRewriteText} maxLength={1000}
          placeholder={"Start later, guests are tired from the flight\nAdd a sunset boat ride and a rooftop dinner"} />
        {rewrite.error ? <View style={{ marginBottom: space.md }}><Banner tone="danger" title={(rewrite.error as ApiError).message} /></View> : null}
        <Button title="Rewrite day" icon="sparkles" disabled={!rewriteText.trim()} loading={rewrite.isPending} onPress={() => rewrite.mutate(rewriteIndex!)} />
      </Sheet>
    </Screen>
  );
}

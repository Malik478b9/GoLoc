import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";

import type { ItineraryContent, ItineraryDay, ItineraryPoster, ItinerarySummary, ScheduleItem, TravelLeg } from "../api/types";
import { dateRange } from "../format";
import { palette, radius, space } from "../theme";
import { Badge, Card, Row, T, useAccent } from "../ui/primitives";

const TYPE_ICON: Record<ScheduleItem["type"], keyof typeof Ionicons.glyphMap> = {
  travel: "car-outline",
  sightseeing: "camera-outline",
  meal: "restaurant-outline",
  stay: "bed-outline",
  activity: "walk-outline",
  ticket: "ticket-outline",
  free: "cafe-outline",
};

const hasText = (v?: string | null) => !!v && v.trim().length > 0;

/** One-glance poster: headline, duration, comfort level, highlights, price. */
export function PosterCard({ poster, it, compact }: { poster: Partial<ItineraryPoster>; it: Pick<ItinerarySummary, "title" | "destination" | "days" | "tier_label">; compact?: boolean }) {
  const highlights = (poster.highlights ?? []).filter(hasText).slice(0, compact ? 3 : 5);
  return (
    <View style={[styles.poster, compact && { padding: space.lg }]}>
      <View style={styles.posterGlow} />
      <T variant="label" color={palette.marigold}>
        {poster.duration_label || `${it.days} days`} · {poster.tier_label || it.tier_label}
      </T>
      <T style={[styles.posterHead, compact && { fontSize: 22, lineHeight: 28 }]} numberOfLines={compact ? 2 : undefined}>{poster.headline || it.title}</T>
      <T variant="caption" color="#C9D6D2" numberOfLines={compact ? 1 : undefined}>{poster.tagline || it.destination}</T>
      {highlights.length ? (
        <View style={{ marginTop: space.md, gap: 6 }}>
          {highlights.map((h) => (
            <Row key={h} gap={8}>
              <Ionicons name="checkmark-circle" size={15} color={palette.marigold} />
              <T variant="small" color="#E6EEEB" style={{ flex: 1 }}>{h}</T>
            </Row>
          ))}
        </View>
      ) : null}
      {hasText(poster.price_line) ? <T variant="h2" color={palette.marigold} style={{ marginTop: space.md }}>{poster.price_line}</T> : null}
    </View>
  );
}

function Leg({ title, leg, icon }: { title: string; leg?: Partial<TravelLeg>; icon: keyof typeof Ionicons.glyphMap }) {
  if (!leg || ![leg.mode, leg.point, leg.time, leg.notes].some(hasText)) return null;
  return (
    <Card style={{ flex: 1, minWidth: 220 }}>
      <Row gap={8}><Ionicons name={icon} size={18} color={palette.rickshaw} /><T variant="h2">{title}</T></Row>
      {[leg.date_label, leg.time].filter(hasText).length ? <T variant="bodyBold" style={{ marginTop: 6 }}>{[leg.date_label, leg.time].filter(hasText).join(" · ")}</T> : null}
      {hasText(leg.mode) || hasText(leg.point) ? <T>{[leg.mode, leg.point].filter(hasText).join(" · ")}</T> : null}
      {hasText(leg.pickup) && leg.pickup !== leg.point ? <T variant="caption">Pickup: {leg.pickup}</T> : null}
      {hasText(leg.notes) ? <T variant="caption">{leg.notes}</T> : null}
    </Card>
  );
}

function Line({ label, value, tag }: { label: string; value?: string; tag?: React.ReactNode }) {
  if (!hasText(value)) return null;
  return (
    <Row gap={10} style={{ alignItems: "flex-start", marginTop: 4 }}>
      <T variant="small" style={{ width: 78, color: palette.muted }}>{label}</T>
      <T variant="small" style={{ flex: 1 }}>{value}{tag}</T>
    </Row>
  );
}

function Day({ d }: { d: ItineraryDay }) {
  const accent = useAccent();
  const stay = d.stay ?? ({} as ItineraryDay["stay"]);
  const hotel = [stay.hotel, stay.area, stay.category].filter(hasText).join(" · ");
  return (
    <Card style={{ marginBottom: space.md }}>
      <Row gap={10} style={{ alignItems: "flex-start" }}>
        <View style={[styles.dayNum, { backgroundColor: accent.main }]}><T variant="bodyBold" color={accent.onMain}>Day {d.day}</T></View>
        <View style={{ flex: 1 }}>
          <T variant="h2">{d.title}</T>
          <T variant="caption">{[d.date_label, d.base].filter(hasText).join(" · ")}</T>
        </View>
      </Row>
      {hasText(d.overview) ? <T style={{ marginTop: space.sm }}>{d.overview}</T> : null}
      {(d.schedule ?? []).length ? (
        <View style={{ marginTop: space.md, gap: 10 }}>
          {d.schedule.map((s, i) => (
            <Row key={i} gap={10} style={{ alignItems: "flex-start" }}>
              <T variant="bodyBold" style={{ width: 50 }}>{s.time}</T>
              <Ionicons name={TYPE_ICON[s.type] ?? "ellipse-outline"} size={16} color={palette.rickshaw} style={{ marginTop: 3 }} />
              <View style={{ flex: 1 }}>
                <T variant="bodyBold">{s.activity}{hasText(s.place) ? <T variant="body"> · {s.place}</T> : null}</T>
                {hasText(s.details) ? <T variant="caption">{s.details}</T> : null}
              </View>
              {hasText(s.cost) ? <T variant="caption" style={{ maxWidth: 90, textAlign: "right" }}>{s.cost}</T> : null}
            </Row>
          ))}
        </View>
      ) : null}
      <View style={styles.facts}>
        <Line label="Stay" value={hotel} tag={hasText(stay.hotel) && !stay.confirmed ? <T variant="small" color={palette.warning}>  · to confirm</T> : null} />
        {hasText(stay.notes) ? <Line label="" value={stay.notes} /> : null}
        <Line label="Breakfast" value={d.meals?.breakfast} />
        <Line label="Lunch" value={d.meals?.lunch} />
        <Line label="Dinner" value={d.meals?.dinner} />
        <Line label="Transport" value={d.transport} />
        {(d.tickets ?? []).filter((x) => hasText(x.item)).map((x, i) => (
          <Line key={i} label={i === 0 ? "Tickets" : ""} value={[x.item, x.price, x.notes].filter(hasText).join(" · ")} />
        ))}
      </View>
      {(d.tips ?? []).filter(hasText).map((tip) => <T key={tip} variant="caption" style={{ marginTop: 4 }}>💡 {tip}</T>)}
    </Card>
  );
}

function Bullets({ title, items }: { title: string; items?: string[] }) {
  const rows = (items ?? []).filter(hasText);
  if (!rows.length) return null;
  return (
    <Card style={{ marginBottom: space.md }}>
      <T variant="h2" style={{ marginBottom: 4 }}>{title}</T>
      {rows.map((r) => <T key={r} variant="small" style={{ marginTop: 3 }}>• {r}</T>)}
    </Card>
  );
}

/** The detailed itinerary: arrival, every day hour by hour, stays, meals, tickets, costs. */
export function ItineraryDocument({ it, content }: { it: Pick<ItinerarySummary, "title" | "destination" | "days" | "guests" | "tier_label" | "start_date" | "end_date">; content: Partial<ItineraryContent> }) {
  const costs = (content.cost_estimate ?? []).filter((c) => hasText(c.item));
  return (
    <View>
      <View style={styles.hero}>
        <T variant="label" color={palette.marigold}>{it.tier_label} · {it.days} day{it.days > 1 ? "s" : ""} · {it.guests} traveler{it.guests > 1 ? "s" : ""}</T>
        <T style={styles.posterHead}>{content.title || it.title}</T>
        <T variant="caption" color="#C9D6D2">{it.destination}{it.start_date && it.end_date ? ` · ${dateRange(it.start_date, it.end_date)}` : ""}</T>
        {hasText(content.summary) ? <T color="#E6EEEB" style={{ marginTop: space.sm }}>{content.summary}</T> : null}
        {(content.highlights ?? []).length ? (
          <Row gap={6} style={{ flexWrap: "wrap", marginTop: space.md }}>
            {content.highlights!.filter(hasText).slice(0, 8).map((h) => <Badge key={h} label={h} bg="#ffffff1f" fg="#fff" />)}
          </Row>
        ) : null}
      </View>
      <Row gap={space.md} style={{ flexWrap: "wrap", marginTop: space.md }}>
        <Leg title="Arrival" leg={content.arrival} icon="airplane" />
        <Leg title="Departure" leg={content.departure} icon="exit-outline" />
      </Row>
      <T variant="title" style={{ marginTop: space.lg, marginBottom: space.md }}>Day by day</T>
      {(content.days ?? []).map((d) => <Day key={d.day} d={d} />)}
      {costs.length ? (
        <Card style={{ marginBottom: space.md }}>
          <T variant="h2" style={{ marginBottom: 4 }}>Estimated costs</T>
          {costs.map((c) => (
            <Row key={c.item} style={{ justifyContent: "space-between", marginTop: 4 }}><T variant="small" style={{ flex: 1 }}>{c.item}</T><T variant="bodyBold">{c.amount}</T></Row>
          ))}
        </Card>
      ) : null}
      <Bullets title="What's included" items={content.inclusions} />
      <Bullets title="Not included" items={content.exclusions} />
      <Bullets title="Packing list" items={content.packing_list} />
      <Bullets title="Important notes" items={content.important_notes} />
    </View>
  );
}

const styles = StyleSheet.create({
  poster: { backgroundColor: palette.night, borderRadius: radius.lg, padding: space.xl, overflow: "hidden" },
  posterGlow: { position: "absolute", right: -50, top: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: palette.marigold, opacity: 0.16 },
  posterHead: { fontSize: 28, lineHeight: 34, fontWeight: "800", color: palette.white, marginTop: 6, letterSpacing: -0.4 },
  hero: { backgroundColor: palette.night, borderRadius: radius.lg, padding: space.xl },
  dayNum: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  facts: { marginTop: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: palette.line },
});

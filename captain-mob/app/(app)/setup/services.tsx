import { api, Badge, Banner, Button, Card, Empty, Loading, money, palette, Row, Screen, Service, space, T, titleCase } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { View } from "react-native";

import { useProfile } from "../../../lib/data";

export default function Services() {
  const q = useQuery({ queryKey: ["my-services"], queryFn: () => api.get<Service[]>("/captain/services/") });
  const profile = useProfile().data;
  const isGuide = profile?.captain_type === "guide";
  const agency = profile?.agency;
  const add = (kind: string) => router.push({ pathname: "/setup/service", params: { kind } });
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  return (
    <Screen
      title="Services & pricing"
      onRefresh={q.refetch}
      footer={agency ? undefined : (
        <Row gap={10}>
          <Button title="Day experience" icon="add" kind="secondary" small style={{ flex: 1 }} onPress={() => add("experience")} />
          <Button title="Guide day" icon="add" kind={isGuide ? "primary" : "secondary"} small style={{ flex: 1 }} onPress={() => add("guide")} />
          {!isGuide ? <Button title="Package" icon="add" small style={{ flex: 1 }} onPress={() => add("package")} /> : null}
        </Row>
      )}
    >
      {agency ? (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="info" icon="business" title={`${agency.name} sets your trips and prices`} body="These are the trips travelers can book with you. Ask your agency to add or change one." />
        </View>
      ) : null}
      <T variant="caption" style={{ marginBottom: space.md }}>
        Day experiences have one group price. Guide days are priced per day: travelers pick their arrival and return, and you walk with them every day.
        {isGuide
          ? " As a local guide you don't sell packages. Switch to Captain in your profile if you also arrange stays and transport."
          : " Packages are multi-day and priced per person at Normal, Medium and Lavish, and you arrange stays, meals and transport to match."}
      </T>
      {rows.length === 0 ? (
        <Empty icon="pricetags-outline" title="No services yet" body="Add at least one to go live." />
      ) : (
        <View style={{ gap: space.md }}>
          {rows.map((s) => (
            <Card key={s.id} onPress={s.managed_by_agency ? undefined : () => router.push({ pathname: "/setup/service", params: { id: s.id } })} style={!s.is_active ? { opacity: 0.55 } : undefined}>
              <Row style={{ justifyContent: "space-between" }}>
                <Badge label={s.kind === "package" ? `${s.duration_days}-day package` : s.kind === "guide" ? `Guide · ${s.duration_hours}h a day` : `${s.duration_hours}h experience`} bg={s.kind === "package" ? palette.marigoldSoft : palette.emberSoft} fg={s.kind === "package" ? palette.warning : palette.ember} />
                {!s.is_active ? <Badge label="Paused" /> : s.managed_by_agency ? <Badge label="Agency trip" icon="business" /> : <T variant="caption">{titleCase(s.category)}</T>}
              </Row>
              <T variant="h2" style={{ marginTop: 6 }}>{s.title}</T>
              <T variant="bodyBold" style={{ marginTop: 4 }}>
                {s.kind === "package"
                  ? `${money(s.normal_price)} · ${money(s.medium_price)} · ${money(s.lavish_price)} /person`
                  : `${money(s.price)}${s.kind === "guide" ? " /day" : ""} for ${s.included_guests} · +${money(s.extra_guest_price)}/extra`}
              </T>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

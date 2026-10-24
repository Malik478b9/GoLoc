import { api, Badge, Button, Card, Empty, Loading, money, palette, Row, Screen, Service, space, T, titleCase } from "@goloc/core";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { View } from "react-native";

export default function Services() {
  const q = useQuery({ queryKey: ["my-services"], queryFn: () => api.get<Service[]>("/captain/services/") });
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  return (
    <Screen
      title="Services & pricing"
      onRefresh={q.refetch}
      footer={
        <Row gap={10}>
          <Button title="Day experience" icon="add" kind="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/setup/service", params: { kind: "experience" } })} />
          <Button title="Package" icon="add" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/setup/service", params: { kind: "package" } })} />
        </Row>
      }
    >
      <T variant="caption" style={{ marginBottom: space.md }}>
        Day experiences have one group price. Packages are multi-day and priced per person at Normal, Medium and Lavish — you arrange stays, meals and transport to match.
      </T>
      {rows.length === 0 ? (
        <Empty icon="pricetags-outline" title="No services yet" body="Add at least one to go live." />
      ) : (
        <View style={{ gap: space.md }}>
          {rows.map((s) => (
            <Card key={s.id} onPress={() => router.push({ pathname: "/setup/service", params: { id: s.id } })} style={!s.is_active ? { opacity: 0.55 } : undefined}>
              <Row style={{ justifyContent: "space-between" }}>
                <Badge label={s.kind === "package" ? `${s.duration_days}-day package` : `${s.duration_hours}h experience`} bg={s.kind === "package" ? palette.marigoldSoft : palette.emberSoft} fg={s.kind === "package" ? palette.warning : palette.ember} />
                {!s.is_active ? <Badge label="Paused" /> : <T variant="caption">{titleCase(s.category)}</T>}
              </Row>
              <T variant="h2" style={{ marginTop: 6 }}>{s.title}</T>
              <T variant="bodyBold" style={{ marginTop: 4 }}>
                {s.kind === "package"
                  ? `${money(s.normal_price)} · ${money(s.medium_price)} · ${money(s.lavish_price)} /person`
                  : `${money(s.price)} for ${s.included_guests} · +${money(s.extra_guest_price)}/extra`}
              </T>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

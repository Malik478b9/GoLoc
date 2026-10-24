import { Ionicons } from "@expo/vector-icons";
import { api, Badge, Button, Card, COMPATIBLE, filePart, Loading, palette, Row, Screen, Sheet, space, T, timeAgo, toast, toastError } from "@goloc/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { View } from "react-native";

import { Checklist, useOptions, useRefreshBusiness } from "../../../lib/data";

type Doc = { id: string; doc_type: string; doc_type_label: string; status: "pending" | "approved" | "rejected"; note: string; created_at: string };
const STATUS = {
  pending: { label: "In review", bg: palette.infoSoft, fg: palette.info },
  approved: { label: "Approved", bg: palette.successSoft, fg: palette.success },
  rejected: { label: "Re-upload", bg: palette.coralSoft, fg: palette.coral },
};

export default function Documents() {
  const qc = useQueryClient();
  const refresh = useRefreshBusiness();
  const options = useOptions();
  const docs = useQuery({ queryKey: ["documents"], queryFn: () => api.get<Doc[]>("/captain/documents/") });
  const check = useQuery({ queryKey: ["checklist"], queryFn: () => api.get<Checklist>("/captain/checklist/") });
  const [picking, setPicking] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const upload = async (docType: string, uri: string, name: string, type: string) => {
    const form = new FormData();
    form.append("doc_type", docType);
    form.append("file", filePart(uri, name, type));
    setUploading(docType);
    try {
      await api.upload("/captain/documents/", form);
      qc.invalidateQueries({ queryKey: ["documents"] });
      refresh();
      toast("Uploaded — we'll review it shortly", "success");
    } catch (e) {
      toastError(e);
    } finally {
      setUploading(null);
    }
  };

  const fromCamera = async () => {
    const type = picking!;
    setPicking(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return toast("Camera permission is needed to photograph documents.");
    const res = await ImagePicker.launchCameraAsync({ quality: 0.7, ...COMPATIBLE });
    if (!res.canceled) upload(type, res.assets[0].uri, "document.jpg", "image/jpeg");
  };
  const fromFiles = async () => {
    const type = picking!;
    setPicking(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], copyToCacheDirectory: true });
    if (!res.canceled) {
      const a = res.assets[0];
      if ((a.size ?? 0) > 10 * 1024 * 1024) return toast("File must be under 10 MB.", "error");
      upload(type, a.uri, a.name, a.mimeType ?? "application/pdf");
    }
  };

  if (docs.isLoading || options.isLoading) return <Loading />;
  const required = new Set(check.data?.required_documents ?? []);
  const latest = new Map<string, Doc>();
  for (const d of docs.data ?? []) if (!latest.has(d.doc_type)) latest.set(d.doc_type, d);
  const types = [...(options.data?.document_types ?? [])].sort((a, b) => Number(required.has(b.value)) - Number(required.has(a.value)));

  return (
    <Screen title="Verification documents" onRefresh={docs.refetch}>
      <Card style={{ backgroundColor: palette.emberSoft, marginBottom: space.lg }}>
        <Row gap={8}><Ionicons name="lock-closed" size={16} color={palette.ember} /><T variant="bodyBold" color={palette.ember}>Private & encrypted</T></Row>
        <T variant="small" style={{ marginTop: 4 }}>Only GoLoc's verification team can see these. Travelers just see a "Verified" badge.</T>
      </Card>
      <View style={{ gap: space.md }}>
        {types.map((t) => {
          const d = latest.get(t.value);
          const s = d ? STATUS[d.status] : null;
          return (
            <Card key={t.value}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <T variant="bodyBold">{t.label}</T>
                  <T variant="caption">{required.has(t.value) ? "Required" : "Optional — builds trust"}{d ? ` · uploaded ${timeAgo(d.created_at)}` : ""}</T>
                </View>
                {s ? <Badge label={s.label} bg={s.bg} fg={s.fg} /> : required.has(t.value) ? <Badge label="Missing" bg={palette.warningSoft} fg={palette.warning} /> : null}
              </Row>
              {d?.status === "rejected" && d.note ? <T variant="small" color={palette.coral} style={{ marginTop: 6 }}>{d.note}</T> : null}
              {d?.status !== "approved" ? (
                <Button title={d ? "Upload again" : "Upload"} icon="cloud-upload" small kind={required.has(t.value) && !d ? "primary" : "secondary"} loading={uploading === t.value} onPress={() => setPicking(t.value)} style={{ alignSelf: "flex-start", marginTop: space.md }} />
              ) : null}
            </Card>
          );
        })}
      </View>
      <Sheet visible={!!picking} onClose={() => setPicking(null)} title="Add document">
        <Button title="Take a photo" icon="camera" onPress={fromCamera} />
        <Button title="Choose PDF or image" icon="document" kind="secondary" onPress={fromFiles} style={{ marginTop: space.md }} />
        <T variant="caption" center style={{ marginTop: space.md }}>Make sure all four corners and the text are clearly visible.</T>
      </Sheet>
    </Screen>
  );
}

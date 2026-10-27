import { Ionicons } from "@expo/vector-icons";
import {
  AIField, api, assetPart, Button, Chip, COMPATIBLE, filePart, palette, radius, Row, Screen, Service, space, T, toast, toastError,
} from "@goloc/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, View } from "react-native";

type Picked = { uri: string; kind: "reel" | "photo"; thumb?: string; size?: number };

export default function NewPost() {
  const qc = useQueryClient();
  const services = useQuery({ queryKey: ["my-services"], queryFn: () => api.get<Service[]>("/captain/services/") });
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos", "images"], quality: 0.85, videoMaxDuration: 90, allowsEditing: true, ...COMPATIBLE });
    if (res.canceled) return;
    const a = res.assets[0];
    const isVideo = a.type === "video";
    if ((a.fileSize ?? 0) > (isVideo ? 100 : 10) * 1024 * 1024) return toast(isVideo ? "Video must be under 100 MB." : "Photo must be under 10 MB.", "error");
    let thumb: string | undefined;
    if (isVideo) {
      try {
        // Loaded on demand so a missing native module can never crash app startup.
        const VideoThumbnails: typeof import("expo-video-thumbnails") = require("expo-video-thumbnails");
        thumb = (await VideoThumbnails.getThumbnailAsync(a.uri, { time: 1000, quality: 0.7 })).uri;
      } catch {
        thumb = undefined;
      }
    }
    setPicked({ uri: a.uri, kind: isVideo ? "reel" : "photo", thumb, size: a.fileSize });
  };

  const publish = async () => {
    if (!picked) return;
    const form = new FormData();
    form.append("kind", picked.kind);
    form.append("media", await assetPart(picked.uri, picked.kind === "reel" ? "reel.mp4" : "photo.jpg"));
    if (picked.thumb) form.append("thumbnail", await filePart(picked.thumb, "thumb.jpg", "image/jpeg"));
    form.append("caption", caption.trim());
    if (serviceId) form.append("service_id", serviceId);
    setProgress(0);
    try {
      await api.upload("/social/mine/", form, "post", setProgress);
      qc.invalidateQueries({ queryKey: ["my-posts"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
      toast("Published — travelers in your city can see it now", "success");
      router.back();
    } catch (e) {
      toastError(e);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Screen
      title="New reel or photo"
      footer={<Button title={progress != null ? `Uploading ${Math.round(progress * 100)}%` : "Publish"} disabled={!picked || progress != null} loading={progress != null && progress >= 1} onPress={publish} />}
    >
      <Pressable onPress={pick} style={{ height: 380, borderRadius: radius.lg, backgroundColor: palette.night2, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
        {picked ? (
          <>
            <Image source={{ uri: picked.thumb ?? picked.uri }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
            {picked.kind === "reel" ? <Ionicons name="play-circle" size={56} color="#ffffffdd" /> : null}
          </>
        ) : (
          <View style={{ alignItems: "center", gap: 8 }}>
            <Ionicons name="cloud-upload-outline" size={44} color={palette.white} />
            <T variant="bodyBold" color={palette.white}>Choose a video or photo</T>
            <T variant="caption" color="#D6E6E1">Vertical 9:16 looks best · up to 90 s</T>
          </View>
        )}
      </Pressable>
      {picked ? <Button title="Choose another" kind="ghost" small onPress={pick} style={{ alignSelf: "center", marginTop: 6 }} /> : null}

      <AIField purpose="post_caption" label="Caption" multiline value={caption} onChangeText={setCaption} maxLength={500} placeholder="Sunrise at Pangong · we leave at 4:30 AM ☀️" style={{ minHeight: 70 }} />
      {(services.data ?? []).length ? (
        <>
          <T variant="small" style={{ marginBottom: 8, fontWeight: "700" }}>Link a trip (adds a "Book your trip" button)</T>
          <Row style={{ flexWrap: "wrap" }} gap={8}>
            {services.data!.filter((s) => s.is_active).map((s) => (
              <Chip key={s.id} label={s.title} active={serviceId === s.id} onPress={() => setServiceId(serviceId === s.id ? null : s.id)} />
            ))}
          </Row>
        </>
      ) : null}
      <T variant="caption" style={{ marginTop: space.lg }}>Keep it real: your own photos and videos only. No contact numbers — posts sharing phone numbers are removed.</T>
    </Screen>
  );
}

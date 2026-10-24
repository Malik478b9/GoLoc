import { Ionicons } from "@expo/vector-icons";
import { api, ApiError, assetPart, Avatar, Button, Chip, City, COMPATIBLE, Field, Loading, palette, Row, Screen, space, T, titleCase, toast, toastError, useAuth } from "@goloc/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { CaptainProfile, useOptions, useProfile, useRefreshBusiness } from "../../../lib/data";

export default function ProfileSetup() {
  const user = useAuth((s) => s.user);
  const profile = useProfile();
  const options = useOptions();
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api.get<City[]>("/cities/") });
  const refresh = useRefreshBusiness();
  const qc = useQueryClient();
  const p = profile.data;
  const [name, setName] = useState(user?.full_name ?? "");
  const [cityId, setCityId] = useState<string | undefined>();
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [years, setYears] = useState("0");
  const [languages, setLanguages] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!p) return;
    setName(p.full_name);
    setCityId(p.city_id);
    setTagline(p.tagline);
    setBio(p.bio);
    setYears(String(p.years_experience));
    setLanguages(p.languages);
    setCategories(p.categories);
  }, [p]);

  const save = useMutation({
    mutationFn: () =>
      api.put<CaptainProfile>("/captain/profile/", {
        full_name: name.trim(), city_id: cityId, tagline: tagline.trim(), bio: bio.trim(),
        years_experience: Number(years) || 0, languages, categories,
      }),
    onSuccess: (saved) => {
      qc.setQueryData(["captain-profile"], saved);
      refresh();
      toast("Profile saved", "success");
      if (!p) router.replace("/checklist");
      else router.back();
    },
  });

  const pickAvatar = async () => {
    if (!p) return toast("Save your profile first, then add a photo.");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8, ...COMPATIBLE });
    if (res.canceled) return;
    const asset = res.assets[0];
    const form = new FormData();
    form.append("avatar", assetPart(asset.uri, "avatar.jpg"));
    setUploading(true);
    try {
      qc.setQueryData(["captain-profile"], await api.upload<CaptainProfile>("/captain/profile/avatar/", form));
      refresh();
      toast("Photo updated", "success");
    } catch (e) {
      toastError(e);
    } finally {
      setUploading(false);
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, v: string, max: number) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]);
  const err = save.error as ApiError | null;
  const cityLocked = !!p && p.review_status !== "draft";

  if (profile.isLoading || options.isLoading) return <Loading />;
  return (
    <Screen
      title={p ? "Business profile" : "Set up your business"}
      footer={<Button title={p ? "Save" : "Save & continue"} loading={save.isPending} disabled={!name.trim() || !cityId} onPress={() => save.mutate()} />}
    >
      <Pressable onPress={pickAvatar} style={{ alignItems: "center", marginVertical: space.md }}>
        <Avatar uri={p?.avatar} name={name || "Captain"} size={96} />
        <Row gap={4} style={{ marginTop: space.sm }}>
          <Ionicons name="camera" size={16} color={palette.ember} />
          <T variant="small" color={palette.ember}>{uploading ? "Uploading…" : p?.avatar ? "Change photo" : "Add a clear face photo"}</T>
        </Row>
      </Pressable>

      <Field label="Your name (as on your ID)" value={name} onChangeText={setName} error={err?.field("full_name")} />
      <T variant="small" style={{ marginBottom: 6, fontWeight: "700" }}>Your city</T>
      <T variant="caption" style={{ marginBottom: 8 }}>{cityLocked ? "Locked after submission — contact support to change." : "You can host trips only in this city."}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.lg }}>
        {(cities.data ?? []).map((c) => <Chip key={c.id} label={c.name} active={cityId === c.id} onPress={cityLocked ? undefined : () => setCityId(c.id)} />)}
      </View>
      {err?.field("city_id") ? <T variant="small" color={palette.coral}>{err.field("city_id")}</T> : null}
      <Field label="Tagline" placeholder="e.g. Old City food & heritage specialist" value={tagline} onChangeText={setTagline} maxLength={140} />
      <Field label="About you" placeholder="Where you grew up, what you love showing people, what makes your trips different…" value={bio} onChangeText={setBio} multiline maxLength={2000} error={err?.field("bio")} />
      <Field label="Years hosting / guiding" value={years} onChangeText={(v) => setYears(v.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" />

      <T variant="small" style={{ marginBottom: 8, fontWeight: "700" }}>Languages you speak</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.lg }}>
        {(options.data?.languages ?? []).map((l) => <Chip key={l} label={l} active={languages.includes(l)} onPress={() => toggle(languages, setLanguages, l, 8)} />)}
      </View>
      <T variant="small" style={{ marginBottom: 8, fontWeight: "700" }}>Specialties (up to 6)</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.lg }}>
        {(options.data?.categories ?? []).map((c) => <Chip key={c} label={titleCase(c)} active={categories.includes(c)} onPress={() => toggle(categories, setCategories, c, 6)} />)}
      </View>
      {err && !err.fields ? <T color={palette.coral}>{err.message}</T> : null}
    </Screen>
  );
}

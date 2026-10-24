import { api, ApiError, Button, Field, Loading, Screen, space, T, toast, useAuth } from "@goloc/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";

type TravelerProfile = { emergency_contact_name: string; emergency_contact_phone: string };

export default function EditProfile() {
  const { user, setUser } = useAuth();
  const profile = useQuery({ queryKey: ["traveler-profile"], queryFn: () => api.get<TravelerProfile>("/auth/traveler-profile/") });
  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [ecName, setEcName] = useState("");
  const [ecPhone, setEcPhone] = useState("");
  useEffect(() => {
    if (profile.data) {
      setEcName(profile.data.emergency_contact_name);
      setEcPhone(profile.data.emergency_contact_phone.replace(/^\+91/, ""));
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const me = await api.patch<any>("/auth/me/", { full_name: name.trim(), email: email.trim() });
      await api.put("/auth/traveler-profile/", { emergency_contact_name: ecName.trim(), emergency_contact_phone: ecPhone.trim() });
      return me;
    },
    onSuccess: (me) => {
      setUser(me);
      toast("Saved", "success");
      router.back();
    },
  });
  const err = save.error as ApiError | null;
  if (profile.isLoading) return <Loading />;
  return (
    <Screen title="Profile" footer={<Button title="Save" loading={save.isPending} disabled={!name.trim()} onPress={() => save.mutate()} />}>
      <Field label="Full name" value={name} onChangeText={setName} error={err?.field("full_name")} />
      <Field label="Email (for receipts)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={err?.field("email")} />
      <T variant="h2" style={{ marginTop: space.lg }}>Emergency contact</T>
      <T variant="caption" style={{ marginBottom: space.md }}>Our safety team calls this person if you raise an SOS and we can't reach you.</T>
      <Field label="Name" value={ecName} onChangeText={setEcName} placeholder="e.g. Ravi (brother)" />
      <Field label="Phone" prefix="+91" value={ecPhone} onChangeText={setEcPhone} keyboardType="phone-pad" error={err?.field("emergency_contact_phone")} />
      {err && !err.fields ? <T color="#E15B3F">{err.message}</T> : null}
    </Screen>
  );
}

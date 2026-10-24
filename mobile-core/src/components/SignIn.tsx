import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError } from "../api/client";
import { useAuth } from "../auth";
import { fonts, palette, radius, space } from "../theme";
import { Field } from "../ui/inputs";
import { Button, T, useAccent } from "../ui/primitives";

/**
 * One screen for sign-in and sign-up (the OTP verifies the number; new
 * numbers get an account). Taglines follow the spec's dual-tagline rule.
 */
export function SignIn({ appName, tagline, supporting, bullets }: { appName: string; tagline: string; supporting: string; bullets: string[] }) {
  const accent = useAccent();
  const { requestOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const codeRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const send = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return setError("Enter your 10-digit mobile number.");
    setBusy(true);
    setError(undefined);
    try {
      const res = await requestOtp(digits);
      setDevCode(res.dev_code);
      setResendIn(res.resend_in ?? 30);
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (e) {
      const err = e as ApiError;
      setError(err.retryAfter ? `${err.message} Try again in ${err.retryAfter}s.` : err.field("phone_number") ?? err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6) return setError("Enter the 6-digit code.");
    setBusy(true);
    setError(undefined);
    try {
      await verifyOtp(phone.replace(/\D/g, ""), value, name.trim());
    } catch (e) {
      setError((e as ApiError).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.night }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.hero}>
          <View style={[styles.logo, { backgroundColor: accent.main }]}>
            <T style={styles.logoText}>G</T>
          </View>
          <T variant="label" color={palette.marigold} style={{ marginTop: space.xl }}>{appName}</T>
          <T style={styles.tagline}>{tagline}</T>
          <T variant="body" color="#C9D6D2" style={{ marginTop: space.sm }}>{supporting}</T>
          <View style={{ marginTop: space.lg, gap: 8 }}>
            {bullets.map((b) => (
              <View key={b} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Ionicons name="checkmark-circle" size={16} color={palette.marigold} />
                <T variant="small" color="#E6EEEB">{b}</T>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.panel}>
          {step === "phone" ? (
            <>
              <T variant="title">Sign in or create account</T>
              <T variant="caption" style={{ marginBottom: space.lg }}>We'll text you a 6-digit code.</T>
              <Field label="Mobile number" prefix="+91" keyboardType="phone-pad" maxLength={14} placeholder="98765 43210" value={phone} onChangeText={setPhone} autoFocus textContentType="telephoneNumber" />
              <Field label="Your name (new accounts)" placeholder="e.g. Ananya Reddy" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" />
              {error ? <T variant="small" color={palette.coral} style={{ marginBottom: space.sm }}>{error}</T> : null}
              <Button title="Send code" onPress={send} loading={busy} />
            </>
          ) : (
            <>
              <Pressable onPress={() => setStep("phone")} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: space.sm }}>
                <Ionicons name="chevron-back" size={16} color={accent.main} />
                <T variant="small" color={accent.main}>Change number</T>
              </Pressable>
              <T variant="title">Enter the code</T>
              <T variant="caption" style={{ marginBottom: space.lg }}>Sent to +91 {phone.replace(/\D/g, "").slice(-10)}</T>
              <TextInput
                ref={codeRef}
                value={code}
                onChangeText={(v) => {
                  const digits = v.replace(/\D/g, "").slice(0, 6);
                  setCode(digits);
                  if (digits.length === 6) verify(digits);
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                style={styles.code}
                placeholder="••••••"
                placeholderTextColor={palette.lineStrong}
              />
              {devCode ? <T variant="caption" center style={{ marginTop: 6 }}>Development code: {devCode}</T> : null}
              {error ? <T variant="small" color={palette.coral} center style={{ marginTop: space.sm }}>{error}</T> : null}
              <Button title="Verify & continue" onPress={() => verify()} loading={busy} style={{ marginTop: space.lg }} />
              <Button title={resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"} kind="ghost" disabled={resendIn > 0 || busy} onPress={send} style={{ marginTop: space.sm }} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, paddingHorizontal: space.xl, justifyContent: "flex-end", paddingBottom: space.xl },
  logo: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  logoText: { fontFamily: fonts.display, fontSize: 28, color: palette.white, lineHeight: 34 },
  tagline: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: palette.white, marginTop: space.sm, letterSpacing: -0.5 },
  panel: { backgroundColor: palette.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space.xl, paddingBottom: space.xxl },
  code: { fontFamily: fonts.bold, fontSize: 30, letterSpacing: 14, textAlign: "center", backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.lineStrong, paddingVertical: 14, color: palette.ink },
});

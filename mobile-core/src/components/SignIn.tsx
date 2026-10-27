import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError } from "../api/client";
import { useAuth } from "../auth";
import { fonts, palette, radius, space } from "../theme";
import { Field, Segmented } from "../ui/inputs";
import { Button, T, useAccent, useWide } from "../ui/primitives";

type Mode = "signin" | "signup";

/**
 * Sign in = number → code. Create account = name + number → code.
 * The last number used on this device is remembered, so signing back in
 * after a logout is one tap. Taglines follow the spec's dual-tagline rule.
 */
export function SignIn({ appName, tagline, supporting, bullets }: { appName: string; tagline: string; supporting: string; bullets: string[] }) {
  const accent = useAccent();
  const wide = useWide();
  const { requestOtp, verifyOtp, lastPhone } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  const codeRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    lastPhone().then((p) => {
      if (p) setPhone((cur) => cur || p);
    });
  }, [lastPhone]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(undefined);
    setInfo(undefined);
  };

  const send = async () => {
    const digits = phone.replace(/\D/g, "");
    if (mode === "signup" && name.trim().length < 2) return setError("Enter your name.");
    if (digits.length < 10) return setError("Enter your 10-digit mobile number.");
    setBusy(true);
    setError(undefined);
    setInfo(undefined);
    try {
      const res = await requestOtp(digits, mode);
      if (mode === "signup" && res.is_new === false) setInfo("This number already has a GoLoc account, so we'll sign you in.");
      setDevCode(res.dev_code);
      setResendIn(res.resend_in ?? 30);
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 300);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "account_not_found") {
        setMode("signup");
        setInfo("No account with this number yet. Add your name to create one.");
        return;
      }
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
      await verifyOtp(phone.replace(/\D/g, ""), value, mode === "signup" ? name.trim() : undefined);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "name_required") {
        setMode("signup");
        setStep("phone");
        setInfo("Add your name to finish creating your account.");
        return;
      }
      setError(err.message);
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.night }}>
      <KeyboardAvoidingView style={[{ flex: 1 }, wide && styles.wideRow]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.hero, wide && styles.wideHero]}>
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

        <View style={[styles.panel, wide && styles.widePanel]}>
          {step === "phone" ? (
            <>
              <Segmented<Mode>
                options={[{ value: "signin", label: "Sign in" }, { value: "signup", label: "Create account" }]}
                value={mode}
                onChange={switchMode}
              />
              <T variant="title" style={{ marginTop: space.lg }}>{mode === "signin" ? "Welcome back" : "Create your account"}</T>
              <T variant="caption" style={{ marginBottom: space.lg }}>
                {mode === "signin" ? "Enter your number and we'll text you a 6-digit code." : "Your name and number, then a 6-digit code. That's it."}
              </T>
              {mode === "signup" ? (
                <Field label="Your name" placeholder="e.g. Ananya Reddy" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" autoFocus maxLength={150} />
              ) : null}
              <Field label="Mobile number" prefix="+91" keyboardType="phone-pad" maxLength={14} placeholder="98765 43210" value={phone} onChangeText={setPhone} autoFocus={mode === "signin"} textContentType="telephoneNumber" onSubmitEditing={send} />
              {info ? <T variant="small" color={accent.main} style={{ marginBottom: space.sm }}>{info}</T> : null}
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
              <T variant="caption" style={{ marginBottom: info ? space.sm : space.lg }}>Sent to +91 {phone.replace(/\D/g, "").slice(-10)}</T>
              {info ? <T variant="small" color={accent.main} style={{ marginBottom: space.lg }}>{info}</T> : null}
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
              <Button title={mode === "signup" ? "Create account" : "Sign in"} onPress={() => verify()} loading={busy} style={{ marginTop: space.lg }} />
              <Button title={resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"} kind="ghost" disabled={resendIn > 0 || busy} onPress={send} style={{ marginTop: space.sm }} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wideRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 64, padding: 48 },
  // Explicit grow/shrink/basis: the base `flex: 1` would otherwise win over the width on web.
  wideHero: { flexGrow: 0, flexShrink: 0, flexBasis: 460, width: 460, justifyContent: "center", paddingBottom: 0 },
  widePanel: { width: 440, borderRadius: 28 },
  hero: { flex: 1, paddingHorizontal: space.xl, justifyContent: "flex-end", paddingBottom: space.xl },
  logo: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  logoText: { fontFamily: fonts.display, fontSize: 28, color: palette.white, lineHeight: 34 },
  tagline: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: palette.white, marginTop: space.sm, letterSpacing: -0.5 },
  panel: { backgroundColor: palette.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space.xl, paddingBottom: space.xxl },
  code: { fontFamily: fonts.bold, fontSize: 30, letterSpacing: 14, textAlign: "center", backgroundColor: palette.white, borderRadius: radius.md, borderWidth: 1, borderColor: palette.lineStrong, paddingVertical: 14, color: palette.ink },
});

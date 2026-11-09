import { Ionicons } from "@expo/vector-icons";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { api, filePart } from "../api/client";
import { tr, useLang } from "../i18n";
import { palette, radius, space } from "../theme";
import { toast, toastError } from "../ui/feedback";
import { Field, FieldProps } from "../ui/inputs";
import { Pulse } from "../ui/motion";
import { T, useAccent } from "../ui/primitives";

const MAX_SECONDS = 180;

/**
 * Speak instead of type, in your own language. Tap once to start, tap again to stop;
 * the words come back as text in the language you spoke.
 */
export function VoiceButton({ onText, size = "big", label }: { onText: (text: string) => void; size?: "big" | "small"; label?: string }) {
  const accent = useAccent();
  const lang = useLang((s) => s.lang);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  useEffect(() => {
    if (state === "recording" && seconds >= MAX_SECONDS) stop();
  }, [seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return toast("Allow the microphone in your phone settings to speak.", "error");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      setState("idle");
      toastError(e);
    }
  };

  const stop = async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setState("working");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const uri = recorder.uri;
      if (!uri) throw new Error(tr("We didn't hear anything. Hold the mic and speak."));
      const form = new FormData();
      form.append("audio", await filePart(uri, "voice.m4a", "audio/m4a"));
      form.append("language", lang);
      const res = await api.upload<{ text: string }>("/ai/transcribe/", form);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onText(res.text);
    } catch (e) {
      toastError(e);
    } finally {
      setState("idle");
    }
  };

  const onPress = () => (state === "idle" ? start() : state === "recording" ? stop() : undefined);
  const recording = state === "recording";
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  if (size === "small") {
    return (
      <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={recording ? "Stop" : "Speak"}
        style={[styles.small, { backgroundColor: recording ? palette.coral : accent.soft }]}>
        {state === "working" ? <ActivityIndicator size="small" color={accent.main} /> : (
          <Ionicons name={recording ? "stop" : "mic"} size={18} color={recording ? palette.white : accent.main} />
        )}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={recording ? "Stop" : "Speak"}
      style={({ pressed }) => [styles.big, { backgroundColor: recording ? palette.coralSoft : accent.soft }, pressed && { opacity: 0.85 }]}>
      <View style={[styles.mic, { backgroundColor: recording ? palette.coral : accent.main }]}>
        {recording ? <Pulse style={[StyleSheet.absoluteFill, styles.ring]} min={0.2} /> : null}
        {state === "working" ? <ActivityIndicator color={palette.white} /> : (
          <Ionicons name={recording ? "stop" : "mic"} size={30} color={palette.white} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <T variant="h2" color={recording ? palette.coral : accent.main}>
          {state === "working" ? "Writing down your words…" : recording ? `Listening… ${mm}` : (label ?? "Tap and speak")}
        </T>
        <T variant="caption">{recording ? "Tap again when you finish" : state === "working" ? "One moment" : "Speak in your own language"}</T>
      </View>
    </Pressable>
  );
}

/** A text box with a mic: speak and the words are added to the box. */
export function VoiceField({ value, onChangeText, ...rest }: FieldProps & { value: string; onChangeText: (v: string) => void }) {
  return (
    <View>
      <Field
        value={value}
        onChangeText={onChangeText}
        labelRight={<VoiceButton size="small" onText={(t) => onChangeText(value.trim() ? `${value.trim()}\n${t}` : t)} />}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  big: { flexDirection: "row", alignItems: "center", gap: space.lg, borderRadius: radius.xl, padding: space.lg },
  mic: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  ring: { borderRadius: 32, backgroundColor: palette.white },
  small: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});


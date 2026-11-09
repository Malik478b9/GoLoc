import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { LangCode, LANGUAGES, useLang } from "../i18n";
import { fonts, palette, radius, shadow, space } from "../theme";
import { BrandMark } from "../ui/brand";
import { T, useAccent } from "../ui/primitives";

/** Big tiles, each language in its own script, so anyone can find theirs without reading English. */
export function LanguageGrid({ onPick }: { onPick?: (code: LangCode) => void }) {
  const accent = useAccent();
  const { lang, chosen, set } = useLang();
  return (
    <View style={styles.grid}>
      {LANGUAGES.map((l) => {
        const on = chosen && l.code === lang;
        return (
          <Pressable
            key={l.code}
            accessibilityRole="button"
            accessibilityLabel={l.english}
            onPress={() => {
              set(l.code);
              onPick?.(l.code);
            }}
            style={({ pressed }) => [styles.tile, on && { borderColor: accent.main, backgroundColor: accent.soft }, pressed && { opacity: 0.8 }]}
          >
            <T style={[styles.native, on && { color: accent.main }]} numberOfLines={1}>{l.native}</T>
            {l.code !== "en" ? <T variant="caption" numberOfLines={1}>{l.english}</T> : <T variant="caption"> </T>}
            {on ? <Ionicons name="checkmark-circle" size={20} color={accent.main} style={styles.tick} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Full-screen first step for Captains: choose your language. */
export function LanguageScreen({ onDone }: { onDone: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.sand }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: space.xxl }}>
        <BrandMark size={44} />
        <T variant="display" style={{ marginTop: space.lg }}>Choose your language</T>
        <T variant="body" style={{ marginTop: space.sm, marginBottom: space.xl }}>
          भाषा चुनें · భాష ఎంచుకోండి · மொழியைத் தேர்ந்தெடுக்கவும் · ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ
        </T>
        <LanguageGrid onPick={onDone} />
        <T variant="caption" center style={{ marginTop: space.xl }}>You can change this any time in Account.</T>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  tile: {
    width: "47.5%", flexGrow: 1, minHeight: 84, backgroundColor: palette.paper, borderRadius: radius.lg, padding: space.lg,
    justifyContent: "center", borderWidth: 2, borderColor: "transparent", ...shadow,
  },
  native: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, color: palette.ink },
  tick: { position: "absolute", top: 10, right: 10 },
});

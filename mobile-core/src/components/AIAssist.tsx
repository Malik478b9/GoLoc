import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, View } from "react-native";

import { api, ApiError } from "../api/client";
import { palette, radius, space } from "../theme";
import { Banner, Sheet } from "../ui/feedback";
import { Field, FieldProps } from "../ui/inputs";
import { Button, Chip, Row, T, useAccent } from "../ui/primitives";

type AssistResult = { text: string; alternatives: string[]; format: "text" | "lines" };

const ACTIONS: { value: string; label: string; needsText: boolean }[] = [
  { value: "write", label: "Write it for me", needsText: false },
  { value: "improve", label: "Improve", needsText: true },
  { value: "shorten", label: "Shorter", needsText: true },
  { value: "expand", label: "More detail", needsText: true },
  { value: "fix", label: "Fix grammar", needsText: true },
  { value: "professional", label: "Professional", needsText: true },
  { value: "friendly", label: "Friendly", needsText: true },
  { value: "english", label: "English", needsText: true },
  { value: "hindi", label: "हिन्दी", needsText: true },
  { value: "telugu", label: "తెలుగు", needsText: true },
];

/** Whether the server has an AI provider. AI buttons hide when it doesn't. */
export function useAIEnabled() {
  const q = useQuery({ queryKey: ["ai-status"], queryFn: () => api.get<{ enabled: boolean }>("/ai/status/"), staleTime: 10 * 60_000 });
  return !!q.data?.enabled;
}

/** The small "✨ AI" pill. */
export function AIButton({ onPress, label = "AI" }: { onPress: () => void; label?: string }) {
  const accent = useAccent();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: accent.soft, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Ionicons name="sparkles" size={13} color={accent.main} />
      <T variant="small" color={accent.main} style={{ fontWeight: "700" }}>{label}</T>
    </Pressable>
  );
}

/**
 * "Edit with AI" for one field: quick presets (improve, shorten, translate…) or a
 * free instruction. Shows the suggestion(s); nothing changes until one is applied.
 */
export function AIAssistSheet({ visible, onClose, purpose, value, context, onApply, title }: {
  visible: boolean; onClose: () => void; purpose: string; value: string; context?: Record<string, unknown>; onApply: (text: string) => void; title?: string;
}) {
  const accent = useAccent();
  const [instruction, setInstruction] = useState("");
  const run = useMutation({
    mutationFn: (action: string) => api.post<AssistResult>("/ai/assist/", { purpose, text: value, action, instruction: instruction.trim(), context }),
  });
  const hasText = value.trim().length > 0;
  const results = run.data ? [run.data.text, ...run.data.alternatives] : [];
  const close = () => {
    run.reset();
    setInstruction("");
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title={title ?? "Edit with AI"}>
      {hasText ? (
        <View style={{ backgroundColor: palette.sand2, borderRadius: radius.md, padding: space.md, marginBottom: space.md }}>
          <T variant="label">Now</T>
          <T variant="small" numberOfLines={4} style={{ marginTop: 2 }}>{value}</T>
        </View>
      ) : null}
      <Row gap={8} style={{ flexWrap: "wrap", marginBottom: space.md }}>
        {ACTIONS.filter((a) => hasText || !a.needsText).map((a) => (
          <Chip key={a.value} label={a.label} active={run.isPending && run.variables === a.value} onPress={() => run.mutate(a.value)} />
        ))}
      </Row>
      <Field
        placeholder={hasText ? "Or say how to change it…" : "Or say what to write…"}
        value={instruction}
        onChangeText={setInstruction}
        maxLength={1000}
        multiline
        style={{ minHeight: 60 }}
      />
      <Button title={instruction.trim() ? "Ask AI" : hasText ? "Improve" : "Write it"} icon="sparkles" loading={run.isPending} onPress={() => run.mutate(hasText ? "improve" : "write")} />
      {run.error ? <View style={{ marginTop: space.md }}><Banner tone="danger" title={(run.error as ApiError).message} /></View> : null}
      {results.length ? (
        <View style={{ marginTop: space.lg, gap: space.sm }}>
          <T variant="label">{results.length > 1 ? "Pick one" : "Suggestion"}</T>
          {results.map((r, i) => (
            <View key={i} style={{ borderWidth: 1.5, borderColor: i === 0 ? accent.main : palette.line, borderRadius: radius.md, padding: space.md, backgroundColor: palette.white }}>
              <T>{r}</T>
              <Row gap={8} style={{ marginTop: space.sm }}>
                <Button title="Use this" small onPress={() => { onApply(r); close(); }} />
                {i === 0 ? <Button title="Try again" small kind="ghost" onPress={() => run.mutate(run.variables ?? "improve")} /> : null}
              </Row>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}

/** A Field with an "AI" button by its label that opens the assistant for this field. */
export function AIField({ purpose, context, value, onChangeText, label, ...rest }: FieldProps & {
  purpose: string; context?: Record<string, unknown>; value: string; onChangeText: (v: string) => void;
}) {
  const enabled = useAIEnabled();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Field {...rest} label={label} value={value} onChangeText={onChangeText} labelRight={enabled ? <AIButton onPress={() => setOpen(true)} /> : undefined} />
      {enabled ? (
        <AIAssistSheet visible={open} onClose={() => setOpen(false)} purpose={purpose} value={value} context={context} onApply={onChangeText} title={label ? `${label} · AI` : undefined} />
      ) : null}
    </>
  );
}

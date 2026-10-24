import { ChatThread } from "@goloc/core";
import { useLocalSearchParams } from "expo-router";

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatThread id={id} />;
}

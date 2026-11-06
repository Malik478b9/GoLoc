import { Platform } from "react-native";

/**
 * KeyboardAvoidingView behaviour for every screen.
 * Android is edge-to-edge (RN 0.81+), so the window no longer resizes when the keyboard opens;
 * "padding" lifts the content on both platforms. Web has no on-screen keyboard to avoid.
 */
export const keyboardBehavior = Platform.OS === "web" ? undefined : ("padding" as const);

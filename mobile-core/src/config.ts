import Constants from "expo-constants";

/**
 * Where the API lives.
 *   1. EXPO_PUBLIC_API_URL (set it for staging/production builds)
 *   2. In development: the same machine that serves the JS bundle, port 8001 —
 *      so a phone on the LAN finds your laptop without editing any file.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(":")[0];
  return `http://${host || "localhost"}:8001/api/v1`;
}

export const API_URL = resolveApiUrl();
export const EAS_PROJECT_ID: string | undefined =
  (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;

import { Platform, Share } from "react-native";

import { toast } from "./ui/feedback";

/**
 * Share a message: the phone's share sheet, or on desktop the browser's share
 * dialog where available, falling back to copying it to the clipboard.
 */
export async function shareText(message: string) {
  if (Platform.OS !== "web") {
    await Share.share({ message });
    return;
  }
  const nav = window.navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
  try {
    if (nav.share) {
      await nav.share({ text: message });
      return;
    }
  } catch {
    // user cancelled, or share not allowed: fall through to copy
  }
  try {
    await nav.clipboard.writeText(message);
    toast("Copied — paste it to your family on WhatsApp or SMS", "success");
  } catch {
    toast("Couldn't copy. Select and copy the link from your booking instead.", "error");
  }
}

import { SignIn } from "@goloc/core";

// Spec §1: Captain path shows the Captain tagline.
export default function SignInScreen() {
  return (
    <SignIn
      appName="GOLOC · CAPTAIN"
      tagline="Your city. Your business. Your income."
      supporting="Don't work for a travel company. Build your own."
      bullets={["Keep ~82% of every trip", "Part-time or full-time", "Day experiences & full packages", "Paid after every completed trip"]}
    />
  );
}

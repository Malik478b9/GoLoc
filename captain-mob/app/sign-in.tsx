import { LanguageScreen, SignIn, useLang } from "@goloc/core";

// Spec §1: Captain path shows the Captain tagline. First time on this phone: pick a language.
export default function SignInScreen() {
  const chosen = useLang((s) => s.chosen);
  if (!chosen) return <LanguageScreen onDone={() => {}} />;
  return (
    <SignIn
      appName="GOLOC · CAPTAIN"
      tagline="Your city. Your business. Your income."
      supporting="Don't work for a travel company. Build your own."
      bullets={["Keep ~82% of every trip", "Part-time or full-time", "Day experiences & full packages", "Paid after every completed trip"]}
    />
  );
}

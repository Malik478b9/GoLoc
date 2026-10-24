import { SignIn } from "@goloc/core";

// Spec §1: Traveler path shows the Traveler tagline.
export default function SignInScreen() {
  return (
    <SignIn
      appName="GOLOC · TRAVELER"
      tagline="Local people. Real places. Safe bookings."
      supporting="Skip the package. Meet the local."
      bullets={["Verified Captains", "Trip insurance on every booking", "Live tracking & SOS", "Clear prices, flexible plans"]}
    />
  );
}

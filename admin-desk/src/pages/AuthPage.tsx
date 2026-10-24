import React, { useEffect, useRef, useState } from "react";

import { apiError, requestOTP, verifyOTP, type User } from "../api/client";

interface Props {
  onSignedIn: (user: User) => void;
}

const TAGLINE = "Command Center — authorised staff only";
const NAME_HINT = "";

/** Same flow in traveler-desk, captain-desk and admin-desk — kept in sync intentionally. */
export default function AuthPage({ onSignedIn }: Props) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // countdown for "Resend code"
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (step === "otp") codeRef.current?.focus();
  }, [step]);

  const digits = phone.replace(/\D/g, "");
  const phoneLooksValid = digits.length === 10 && /^[6-9]/.test(digits);

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!phoneLooksValid) {
      setError("Enter your 10-digit mobile number.");
      return;
    }
    setLoading(true);
    try {
      const sent = await requestOTP(digits);
      setSentTo(sent.phone_number);
      setDevCode(sent.dev_code);
      setResendIn(sent.resend_in);
      setCode("");
      setStep("otp");
    } catch (err) {
      const info = apiError(err);
      setError(info.fields?.phone_number?.[0] || info.message);
      if (info.retryAfter && info.code === "otp_cooldown") {
        // A code was already sent moments ago — go to the code screen.
        setSentTo(`+91${digits}`);
        setResendIn(info.retryAfter);
        setStep("otp");
        setError("");
      }
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const { user } = await verifyOTP(digits, code, fullName.trim() || undefined);
      onSignedIn(user);
    } catch (err) {
      const info = apiError(err);
      setError(info.message);
      setCode("");
      codeRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const formatted = sentTo.startsWith("+91") ? `+91 ${sentTo.slice(3, 8)} ${sentTo.slice(8)}` : sentTo;

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand">GoLoc</div>
        <div className="tagline">{TAGLINE}</div>

        {step === "phone" ? (
          <form onSubmit={sendOtp} noValidate>
            <label className="field-label" htmlFor="phone">Mobile number</label>
            <div className="phone-input">
              <span className="phone-prefix">+91</span>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                maxLength={14}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, ""))}
                autoFocus
              />
            </div>
            {NAME_HINT && (
              <>
                <label className="field-label" htmlFor="name">{NAME_HINT}</label>
                <input
                  id="name"
                  autoComplete="name"
                  placeholder="Your name"
                  maxLength={150}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary" disabled={loading}>
              {loading ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <label className="field-label" htmlFor="code">Enter the 6-digit code sent to {formatted}</label>
            {devCode && <div className="hint">Development server — your code is <strong>{devCode}</strong></div>}
            <input
              id="code"
              ref={codeRef}
              className="code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="••••••"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="primary" disabled={loading || code.length !== 6}>
              {loading ? "Verifying…" : "Verify & continue"}
            </button>
            <div className="auth-links">
              <button type="button" className="back-link" onClick={() => { setStep("phone"); setError(""); }}>
                Change number
              </button>
              <button type="button" className="back-link" disabled={resendIn > 0 || loading} onClick={() => sendOtp()}>
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

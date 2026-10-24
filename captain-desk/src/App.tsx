import React, { useCallback, useEffect, useState } from "react";

import { apiError, fetchMe, hasSession, logout as apiLogout, type User } from "./api/client";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import "./styles.css";

export type { User };

type Boot = "loading" | "ready" | "offline";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [boot, setBoot] = useState<Boot>(hasSession() ? "loading" : "ready");

  const loadSession = useCallback(() => {
    if (!hasSession()) {
      setBoot("ready");
      return;
    }
    setBoot("loading");
    fetchMe()
      .then((me) => {
        setUser(me);
        setBoot("ready");
      })
      .catch((err) => {
        // Network trouble: keep the session and offer a retry instead of logging out.
        if (apiError(err).code === "network") setBoot("offline");
        else setBoot("ready");
      });
  }, []);

  useEffect(loadSession, [loadSession]);

  useEffect(() => {
    const onSignedOut = () => setUser(null);
    window.addEventListener("goloc:signed-out", onSignedOut);
    return () => window.removeEventListener("goloc:signed-out", onSignedOut);
  }, []);

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  if (boot === "loading") {
    return <div className="boot-screen"><div className="boot-spinner" aria-label="Loading" /></div>;
  }
  if (boot === "offline") {
    return (
      <div className="boot-screen">
        <p>Can't reach GoLoc right now.</p>
        <button className="primary narrow" onClick={loadSession}>Try again</button>
      </div>
    );
  }

  return user ? (
    <HomePage user={user} onUserChange={setUser} onLogout={logout} />
  ) : (
    <AuthPage onSignedIn={setUser} />
  );
}

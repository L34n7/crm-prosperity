"use client";

import { useEffect } from "react";
import {
  enviarEventoSessao,
  getClientSessionId,
} from "@/lib/auth/browser-session";

const HEARTBEAT_INTERVAL_MS = 60_000;

export default function SessionActivityTracker() {
  useEffect(() => {
    getClientSessionId();
    void enviarEventoSessao("login");

    const interval = window.setInterval(() => {
      void enviarEventoSessao("heartbeat");
    }, HEARTBEAT_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void enviarEventoSessao("heartbeat");
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}

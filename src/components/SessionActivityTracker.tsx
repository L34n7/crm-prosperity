"use client";

import { useEffect } from "react";
import {
  enviarEventoSessao,
  getClientSessionId,
  registrarAtividadeSessao,
} from "@/lib/auth/browser-session";

const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  "click",
  "keydown",
  "submit",
];

export default function SessionActivityTracker() {
  useEffect(() => {
    getClientSessionId();
    void enviarEventoSessao("login");

    function registrarAtividade() {
      void registrarAtividadeSessao();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void registrarAtividadeSessao();
      }
    }

    ACTIVITY_EVENTS.forEach((evento) => {
      document.addEventListener(evento, registrarAtividade, true);
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      ACTIVITY_EVENTS.forEach((evento) => {
        document.removeEventListener(evento, registrarAtividade, true);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}

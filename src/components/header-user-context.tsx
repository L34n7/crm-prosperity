"use client";

import { createContext, useContext } from "react";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";

export type HeaderUser = {
  profileName: string;
  avatarUrl: string;
  permissoes: string[];
  assinatura: AssinaturaEmpresa | null;
  isAdmin: boolean;
};

const HeaderUserContext = createContext<HeaderUser>({
  profileName: "Usuario",
  avatarUrl: "",
  permissoes: [],
  assinatura: null,
  isAdmin: false,
});

export function HeaderUserProvider({
  value,
  children,
}: {
  value: HeaderUser;
  children: React.ReactNode;
}) {
  return (
    <HeaderUserContext.Provider value={value}>
      {children}
    </HeaderUserContext.Provider>
  );
}

export function useHeaderUser() {
  return useContext(HeaderUserContext);
}

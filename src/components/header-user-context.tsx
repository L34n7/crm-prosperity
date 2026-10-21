"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AssinaturaEmpresa } from "@/lib/assinaturas/status";
import type { NichoCodigo } from "@/lib/nichos/config";

export type HeaderUser = {
  profileName: string;
  avatarUrl: string;
  permissoes: string[];
  assinatura: AssinaturaEmpresa | null;
  isAdmin: boolean;
  nichoCodigo: NichoCodigo;
  atualizarPerfilHeader: (patch: {
    profileName?: string;
    avatarUrl?: string;
  }) => void;
};

const HeaderUserContext = createContext<HeaderUser>({
  profileName: "Usuario",
  avatarUrl: "",
  permissoes: [],
  assinatura: null,
  isAdmin: false,
  nichoCodigo: "comercio",
  atualizarPerfilHeader: () => undefined,
});

export function HeaderUserProvider({
  value,
  children,
}: {
  value: Omit<HeaderUser, "atualizarPerfilHeader">;
  children: React.ReactNode;
}) {
  const [profileName, setProfileName] = useState(value.profileName);
  const [avatarUrl, setAvatarUrl] = useState(value.avatarUrl);

  useEffect(() => {
    setProfileName(value.profileName);
  }, [value.profileName]);

  useEffect(() => {
    setAvatarUrl(value.avatarUrl);
  }, [value.avatarUrl]);

  const atualizarPerfilHeader = useCallback(
    (patch: { profileName?: string; avatarUrl?: string }) => {
      if (patch.profileName !== undefined) {
        setProfileName(patch.profileName);
      }
      if (patch.avatarUrl !== undefined) {
        setAvatarUrl(patch.avatarUrl);
      }
    },
    []
  );

  return (
    <HeaderUserContext.Provider
      value={{
        ...value,
        profileName,
        avatarUrl,
        atualizarPerfilHeader,
      }}
    >
      {children}
    </HeaderUserContext.Provider>
  );
}

export function useHeaderUser() {
  return useContext(HeaderUserContext);
}

"use client";

import { createContext, useContext } from "react";

export type HeaderUser = {
  profileName: string;
  avatarUrl: string;
};

const HeaderUserContext = createContext<HeaderUser>({
  profileName: "Usuário",
  avatarUrl: "",
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
declare module "@/components/Header" {
  import type { ReactElement } from "react";

  type HeaderProps = {
    title?: string;
    subtitle?: string;
    profileName?: string;
    creditLabel?: string;
    avatarUrl?: string;
    mobileBackHref?: string;
    mobileBackLabel?: string;
  };

  export default function Header(props: HeaderProps): ReactElement;
}

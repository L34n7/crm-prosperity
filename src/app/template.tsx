import FooterSocialLinks from "@/components/site/FooterSocialLinks";
import LegalDocumentModalProvider from "@/components/legal/LegalDocumentModalProvider";

export default function RootTemplate({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <LegalDocumentModalProvider />
      <FooterSocialLinks />
      {children}
    </>
  );
}

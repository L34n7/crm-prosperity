"use client";

import { useState } from "react";
import { Boxes, CircleDollarSign } from "lucide-react";
import Header from "@/components/Header";
import PrecosPromocoesPanel from "@/components/estoque/PrecosPromocoesPanel";
import { useHeaderUser } from "@/components/header-user-context";
import EstoqueOperacaoPage from "./EstoqueOperacaoPage";
import styles from "./estoque.module.css";
import shellStyles from "./precos-shell.module.css";

type VisaoEstoque = "operacao" | "precos";

export default function EstoquePage() {
  const { permissoes, nichoCodigo } = useHeaderUser();
  const [visao, setVisao] = useState<VisaoEstoque>("operacao");

  const subtituloPagina = ["medicina", "odontologia", "podologia"].includes(nichoCodigo)
    ? "Controle produtos, insumos, preços e consumos vinculados aos atendimentos."
    : nichoCodigo === "imobiliaria"
      ? "Controle materiais, suprimentos, preços e regras comerciais da operação imobiliária."
      : "Controle estoque, preços, promoções e condições comerciais em uma única operação.";

  return (
    <>
      <div className={shellStyles.switcher} role="tablist" aria-label="Áreas principais do estoque">
        <button
          type="button"
          role="tab"
          aria-selected={visao === "operacao"}
          className={visao === "operacao" ? shellStyles.active : ""}
          onClick={() => setVisao("operacao")}
        >
          <Boxes size={17} /> Operação do estoque
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={visao === "precos"}
          className={visao === "precos" ? shellStyles.active : ""}
          onClick={() => setVisao("precos")}
        >
          <CircleDollarSign size={17} /> Preços e promoções
        </button>
      </div>

      {visao === "operacao" ? <EstoqueOperacaoPage /> : (
        <>
          <Header title="Estoque" subtitle={subtituloPagina} />
          <main className={styles.page}>
            <section className={styles.hero}>
              <div className={styles.heroIntro}>
                <span className={styles.eyebrow}>Gestão comercial</span>
                <h1>Preços e promoções</h1>
                <p>
                  Defina preço-base, valores por canal, condições de pagamento e promoções programadas sem duplicar produtos ou alterar a estrutura física do estoque.
                </p>
              </div>
            </section>

            <section className={styles.workspace}>
              <div className={`${styles.workspaceMain} ${shellStyles.fullWidth}`}>
                <header className={styles.contentHeader}>
                  <div>
                    <span className={styles.contentEyebrow}>Estoque / Preços e promoções</span>
                    <h2>Preços e promoções</h2>
                    <p>Gerencie produtos individualmente ou em massa e programe promoções com data e hora de início e término.</p>
                  </div>
                </header>
                <PrecosPromocoesPanel permissoes={permissoes} />
              </div>
            </section>
          </main>
        </>
      )}
    </>
  );
}

"use client";

import { useContext, useEffect, useState } from "react";
import {
  MENSAGEM_CHECKOUT_PAGAMENTO_PADRAO,
  MENSAGEM_RECUPERACAO_CHECKOUT_PADRAO,
  SAIDAS_CHECKOUT_PAGAMENTO,
} from "../../checkout-pagamento-editor";
import {
  atualizarDraftCheckoutPagamento,
  definirDraftCheckoutPagamento,
  normalizarDraftCheckoutPagamento,
} from "../../checkout-pagamento-draft";
import { PropertiesPanelNodeContext } from "../PropertiesPanel";
import styles from "../../fluxos.module.css";

type CheckoutPagamentoConfigProps = {
  mensagem: string;
  onMensagemChange: (valor: string) => void;
};

export default function CheckoutPagamentoConfig({
  mensagem,
  onMensagemChange,
}: CheckoutPagamentoConfigProps) {
  const node = useContext(PropertiesPanelNodeContext);
  const noId = node?.id || "";
  const configuracao =
    (node?.data?.configuracao_json || {}) as Record<string, unknown>;
  const inicial = normalizarDraftCheckoutPagamento(configuracao, mensagem);

  const [expiracaoMinutos, setExpiracaoMinutos] = useState(
    inicial.expiracao_minutos
  );
  const [recuperacaoAtiva, setRecuperacaoAtiva] = useState(
    inicial.recuperacao_ativa
  );
  const [recuperacaoAposMinutos, setRecuperacaoAposMinutos] = useState(
    inicial.recuperacao_apos_minutos
  );
  const [mensagemRecuperacao, setMensagemRecuperacao] = useState(
    inicial.mensagem_recuperacao
  );

  useEffect(() => {
    if (!noId) return;

    const draftInicial = normalizarDraftCheckoutPagamento(
      configuracao,
      mensagem
    );

    setExpiracaoMinutos(draftInicial.expiracao_minutos);
    setRecuperacaoAtiva(draftInicial.recuperacao_ativa);
    setRecuperacaoAposMinutos(draftInicial.recuperacao_apos_minutos);
    setMensagemRecuperacao(draftInicial.mensagem_recuperacao);
    definirDraftCheckoutPagamento(noId, draftInicial);

    if (!String(mensagem || "").trim()) {
      onMensagemChange(MENSAGEM_CHECKOUT_PAGAMENTO_PADRAO);
      atualizarDraftCheckoutPagamento(noId, {
        mensagem: MENSAGEM_CHECKOUT_PAGAMENTO_PADRAO,
      });
    }
    // O nodeId identifica uma nova sessão de edição. As mudanças seguintes
    // são sincronizadas pelos handlers abaixo sem reinicializar os campos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noId]);

  useEffect(() => {
    if (!noId) return;
    atualizarDraftCheckoutPagamento(noId, { mensagem });
  }, [mensagem, noId]);

  function alterarExpiracao(valor: string) {
    setExpiracaoMinutos(valor);
    atualizarDraftCheckoutPagamento(noId, {
      expiracao_minutos: valor,
    });
  }

  function alterarRecuperacaoAtiva(ativo: boolean) {
    setRecuperacaoAtiva(ativo);
    atualizarDraftCheckoutPagamento(noId, {
      recuperacao_ativa: ativo,
    });
  }

  function alterarRecuperacaoApos(valor: string) {
    setRecuperacaoAposMinutos(valor);
    atualizarDraftCheckoutPagamento(noId, {
      recuperacao_apos_minutos: valor,
    });
  }

  function alterarMensagemRecuperacao(valor: string) {
    setMensagemRecuperacao(valor);
    atualizarDraftCheckoutPagamento(noId, {
      mensagem_recuperacao: valor,
    });
  }

  return (
    <>
      <div className={styles.field}>
        <span className={styles.label}>Como o checkout funciona</span>
        <p className={styles.help}>
          O preço WhatsApp é o preço usado nas vendas automatizadas deste fluxo.
          O sistema multiplica esse preço pela {"{{quantidade_desejada}}"} e usa o
          total para gerar o Checkout Pro do Mercado Pago. Se não houver preço
          específico para WhatsApp, o sistema herda o preço-base. O pedido e o
          estoque são reservados antes de gerar o checkout, e o fluxo só continua
          quando o gateway confirmar o resultado.
        </p>
      </div>

      <div
        className={styles.field}
        style={{
          border: "1px solid var(--crm-ui-private-content-hex-cbd5e1)",
          borderRadius: 10,
          padding: 10,
        }}
      >
        <span className={styles.label}>Tarifas do Mercado Pago</span>
        <p className={styles.help} style={{ marginBottom: 0 }}>
          O preço WhatsApp define o valor cobrado na venda automatizada e enviado
          ao checkout do Mercado Pago. O Mercado Pago pode descontar tarifas do
          valor recebido pela empresa, conforme o meio de pagamento e as condições
          da conta. A Prosperity não acrescenta essa tarifa automaticamente. Se a
          empresa quiser considerar esse custo, deve configurar o preço WhatsApp já
          com a margem desejada em Estoque → Preços e promoções.
        </p>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Vencimento do checkout</span>
        <span className={styles.help}>Entre 5 minutos e 24 horas.</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            className={styles.input}
            type="number"
            min={5}
            max={1440}
            step={1}
            value={expiracaoMinutos}
            onChange={(event) => alterarExpiracao(event.target.value)}
          />
          <span className={styles.help}>minutos</span>
        </div>
      </label>

      <div className={styles.field}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={recuperacaoAtiva}
            onChange={(event) => alterarRecuperacaoAtiva(event.target.checked)}
          />
          <span className={styles.label}>Recuperar checkout sem pagamento</span>
        </label>
        <p className={styles.help}>
          Se o pagamento continuar pendente, envia uma única mensagem de recuperação
          e mantém o fluxo aguardando a confirmação do Mercado Pago.
        </p>
      </div>

      {recuperacaoAtiva && (
        <>
          <label className={styles.field}>
            <span className={styles.label}>Enviar recuperação após</span>
            <span className={styles.help}>
              O tempo precisa ser menor que o vencimento do checkout.
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                className={styles.input}
                type="number"
                min={1}
                step={1}
                value={recuperacaoAposMinutos}
                onChange={(event) => alterarRecuperacaoApos(event.target.value)}
              />
              <span className={styles.help}>minutos</span>
            </div>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Mensagem de recuperação</span>
            <textarea
              className={styles.textarea}
              value={mensagemRecuperacao}
              onChange={(event) => alterarMensagemRecuperacao(event.target.value)}
              placeholder={MENSAGEM_RECUPERACAO_CHECKOUT_PADRAO}
            />
            <span className={styles.help}>
              Pode usar {"{{checkout_url}}"}, {"{{pagamento_valor_formatado}}"},
              {" {{estoque_produto_nome}}"} e outras variáveis do fluxo.
            </span>
          </label>
        </>
      )}

      <div className={styles.field}>
        <span className={styles.label}>Conexões necessárias</span>
        <p className={styles.help}>
          Arraste cada saída do bloco até o próximo passo. O ID da resposta é
          configurado automaticamente pela própria saída e não precisa ser digitado.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {SAIDAS_CHECKOUT_PAGAMENTO.map((saida) => (
            <div
              key={saida.valor}
              style={{
                border: "1px solid var(--crm-ui-private-content-hex-cbd5e1)",
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              <strong>{saida.titulo}</strong>
              <div className={styles.help}>
                ID da resposta: <code>{saida.valor}</code>
              </div>
            </div>
          ))}
        </div>
        <p className={styles.help}>
          Recomendação: Pagamento aprovado → confirmação; Sem estoque → nova
          consulta; Expirado / cancelado → oferecer novo pagamento; Erro →
          transferir para atendimento.
        </p>
      </div>
    </>
  );
}

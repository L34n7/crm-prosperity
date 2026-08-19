"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanBarcode, Usb, X } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import styles from "./CodigoBarrasScannerModal.module.css";

type ResultadoLeitura = { ok: boolean; message?: string } | void;

type CodigoBarrasScannerModalProps = {
  title: string;
  description: string;
  continuous?: boolean;
  onDetected: (codigo: string) => ResultadoLeitura;
  onClose: () => void;
};

type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorInstance = { detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "codabar"];

function normalizarCodigo(valor: string) {
  return valor.trim().replace(/\s+/g, "");
}

export default function CodigoBarrasScannerModal({
  title,
  description,
  continuous = false,
  onDetected,
  onClose,
}: CodigoBarrasScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const processandoRef = useRef(false);
  const ultimaCameraRef = useRef({ codigo: "", instante: 0 });
  const [codigoManual, setCodigoManual] = useState("");
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [cameraDisponivel, setCameraDisponivel] = useState<boolean | null>(null);
  const [erro, setErro] = useState("");
  const [ultimaLeitura, setUltimaLeitura] = useState("");
  const [totalLeituras, setTotalLeituras] = useState(0);

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
  }, [onClose, onDetected]);

  const pararCamera = useCallback(() => {
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
    setCameraAtiva(false);
  }, []);

  const registrarLeitura = useCallback((entrada: string, origem: "camera" | "leitor") => {
    const codigo = normalizarCodigo(entrada);
    if (!codigo) return;

    if (origem === "camera") {
      const agora = Date.now();
      if (ultimaCameraRef.current.codigo === codigo && agora - ultimaCameraRef.current.instante < 1200) return;
      ultimaCameraRef.current = { codigo, instante: agora };
    }

    const resultado = onDetectedRef.current(codigo);
    if (resultado && !resultado.ok) {
      setErro(resultado.message || "Código não encontrado.");
      return;
    }

    setErro("");
    setUltimaLeitura(codigo);
    setTotalLeituras((total) => total + 1);
    setCodigoManual("");
    if (!continuous) onCloseRef.current();
  }, [continuous]);

  useEffect(() => {
    setCameraDisponivel(Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  useEffect(() => {
    if (!cameraAtiva) return;

    const videoElement = videoRef.current;
    let cancelado = false;
    let intervalo: ReturnType<typeof setInterval> | null = null;

    async function iniciar() {
      try {
        setErro("");
        const video = videoElement;
        if (!video) return;

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        if (window.BarcodeDetector) {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (cancelado) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          streamRef.current = stream;
          video.srcObject = stream;
          await video.play();
          let detector: BarcodeDetectorInstance | null = null;
          try {
            detector = new window.BarcodeDetector({ formats: FORMATOS });
          } catch {
            stream.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            video.srcObject = null;
          }

          if (detector) {
            intervalo = setInterval(async () => {
              if (processandoRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
              processandoRef.current = true;
              try {
                const [resultado] = await detector.detect(video);
                if (resultado?.rawValue) registrarLeitura(resultado.rawValue, "camera");
              } catch {
                // Um quadro sem leitura não representa falha da câmera.
              } finally {
                processandoRef.current = false;
              }
            }, 260);
            return;
          }
        }

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const leitor = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 220,
          delayBetweenScanSuccess: 900,
        });
        const controls = await leitor.decodeFromConstraints(constraints, video, (resultado) => {
          if (resultado) registrarLeitura(resultado.getText(), "camera");
        });

        if (cancelado) {
          controls.stop();
          return;
        }

        zxingControlsRef.current = controls;
        if (video.srcObject instanceof MediaStream) streamRef.current = video.srcObject;
      } catch {
        setErro("Não foi possível acessar a câmera. Verifique a permissão do navegador.");
        setCameraAtiva(false);
      }
    }

    void iniciar();
    return () => {
      cancelado = true;
      if (intervalo) clearInterval(intervalo);
      zxingControlsRef.current?.stop();
      zxingControlsRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const video = videoElement;
      if (video?.srcObject instanceof MediaStream) {
        video.srcObject.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
    };
  }, [cameraAtiva, registrarLeitura]);

  useEffect(() => () => {
    zxingControlsRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function enviarCodigo(event: FormEvent) {
    event.preventDefault();
    registrarLeitura(codigoManual, "leitor");
  }

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={onClose}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="scanner-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <div><span>Leitura inteligente</span><h2 id="scanner-title">{title}</h2><p>{description}</p></div>
          <button type="button" aria-label="Fechar leitor" onClick={onClose}><X size={20} /></button>
        </header>

        <div className={styles.body}>
          <section className={styles.cameraPanel}>
            {cameraAtiva ? (
              <div className={styles.videoFrame}>
                <video ref={videoRef} muted playsInline aria-label="Imagem da câmera para leitura do código" />
                <span className={styles.scanLine} />
                <div className={styles.target}><span /><span /><span /><span /></div>
              </div>
            ) : (
              <div className={styles.cameraEmpty}>
                <ScanBarcode size={42} />
                <strong>Aponte a câmera para o código</strong>
                <p>Enquadre o código inteiro e mantenha o aparelho estável.</p>
              </div>
            )}

            {cameraDisponivel ? (
              <button className={styles.cameraButton} type="button" onClick={() => cameraAtiva ? pararCamera() : setCameraAtiva(true)}>
                {cameraAtiva ? <CameraOff size={18} /> : <Camera size={18} />}
                {cameraAtiva ? "Desligar câmera" : "Usar câmera"}
              </button>
            ) : cameraDisponivel === false ? (
              <p className={styles.unavailable}>A câmera não está disponível neste acesso. Abra o sistema por HTTPS e verifique a permissão do navegador; você também pode usar um leitor físico ou digitar o código abaixo.</p>
            ) : null}
          </section>

          <section className={styles.readerPanel}>
            <div className={styles.readerTitle}><span><Usb size={20} /></span><div><strong>Leitor USB/Bluetooth</strong><p>Clique no campo e faça a leitura. A maioria dos leitores envia Enter automaticamente.</p></div></div>
            <form onSubmit={enviarCodigo}>
              <label htmlFor="barcode-reader-input">Código de barras</label>
              <div className={styles.inputRow}>
                <input id="barcode-reader-input" autoFocus inputMode="numeric" autoComplete="off" value={codigoManual} onChange={(event) => setCodigoManual(event.target.value)} placeholder="Leia ou digite o código" />
                <button type="submit" disabled={!normalizarCodigo(codigoManual)}>Confirmar</button>
              </div>
            </form>

            {erro ? <div className={styles.error}>{erro}</div> : null}
            {ultimaLeitura ? <div className={styles.success}><span>Última leitura</span><strong>{ultimaLeitura}</strong>{continuous ? <small>{totalLeituras} {totalLeituras === 1 ? "leitura registrada" : "leituras registradas"}</small> : null}</div> : null}
          </section>
        </div>

        <footer className={styles.footer}>
          <p>{continuous ? "O leitor permanecerá aberto para somar novas unidades." : "O leitor fechará após uma leitura válida."}</p>
          <button type="button" onClick={onClose}>Concluir</button>
        </footer>
      </section>
    </div>
  );
}

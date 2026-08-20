"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanBarcode, Usb, X, ZoomIn } from "lucide-react";
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
type CameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: { min: number; max: number; step: number };
};
type CameraSettings = MediaTrackSettings & { zoom?: number };
type CameraConstraintSet = MediaTrackConstraintSet & { focusMode?: string; zoom?: number };
type ZoomCamera = { min: number; max: number; step: number; value: number };

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
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const processandoRef = useRef(false);
  const fecharAposLeituraRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaCameraRef = useRef({ codigo: "", instante: 0 });
  const [codigoManual, setCodigoManual] = useState("");
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [cameraDisponivel, setCameraDisponivel] = useState<boolean | null>(null);
  const [erro, setErro] = useState("");
  const [ultimaLeitura, setUltimaLeitura] = useState("");
  const [totalLeituras, setTotalLeituras] = useState(0);
  const [zoomCamera, setZoomCamera] = useState<ZoomCamera | null>(null);
  const [resolucaoCamera, setResolucaoCamera] = useState("");
  const [leituraDemorada, setLeituraDemorada] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
  }, [onClose, onDetected]);

  const pararCamera = useCallback(() => {
    if (fecharAposLeituraRef.current) clearTimeout(fecharAposLeituraRef.current);
    fecharAposLeituraRef.current = null;
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    cameraTrackRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
    setZoomCamera(null);
    setResolucaoCamera("");
    setLeituraDemorada(false);
    setCameraAtiva(false);
  }, []);

  const prepararCamera = useCallback(async (stream: MediaStream) => {
    const [track] = stream.getVideoTracks();
    if (!track) return;

    cameraTrackRef.current = track;
    const capabilities = typeof track.getCapabilities === "function"
      ? track.getCapabilities() as CameraCapabilities
      : null;

    if (capabilities?.focusMode?.includes("continuous")) {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: "continuous" } as CameraConstraintSet],
        });
      } catch {
        // Alguns navegadores anunciam o foco, mas não aceitam alterá-lo por código.
      }
    }

    const settings = track.getSettings() as CameraSettings;
    if (settings.width && settings.height) setResolucaoCamera(`${settings.width} × ${settings.height}`);

    const zoom = capabilities?.zoom;
    if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min) {
      const value = Math.min(zoom.max, Math.max(zoom.min, settings.zoom ?? zoom.min));
      setZoomCamera({
        min: zoom.min,
        max: zoom.max,
        step: zoom.step > 0 ? zoom.step : 0.1,
        value,
      });
    } else {
      setZoomCamera(null);
    }
  }, []);

  async function alterarZoom(valor: number) {
    const track = cameraTrackRef.current;
    if (!track || !zoomCamera) return;

    const value = Math.min(zoomCamera.max, Math.max(zoomCamera.min, valor));
    setZoomCamera((atual) => atual ? { ...atual, value } : atual);
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as CameraConstraintSet] });
    } catch {
      setErro("Não foi possível aplicar o zoom nesta câmera.");
    }
  }

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
      setLeituraDemorada(false);
      return;
    }

    setErro("");
    setLeituraDemorada(false);
    setUltimaLeitura(codigo);
    setTotalLeituras((total) => total + 1);
    setCodigoManual("");
    if (!continuous) {
      if (origem === "camera") {
        fecharAposLeituraRef.current = setTimeout(() => onCloseRef.current(), 850);
      } else {
        onCloseRef.current();
      }
    }
  }, [continuous]);

  useEffect(() => {
    setCameraDisponivel(Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  useEffect(() => {
    if (!cameraAtiva) return;

    const videoElement = videoRef.current;
    let cancelado = false;
    let intervalo: ReturnType<typeof setInterval> | null = null;
    let avisoDemora: ReturnType<typeof setTimeout> | null = null;

    async function iniciar() {
      try {
        setErro("");
        setUltimaLeitura("");
        setLeituraDemorada(false);
        const video = videoElement;
        if (!video) return;

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 },
          },
        };

        const [stream, modulosLeitura] = await Promise.all([
          navigator.mediaDevices.getUserMedia(constraints),
          Promise.all([import("@zxing/browser"), import("@zxing/library")]),
        ]);
        if (cancelado) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = modulosLeitura;
        const formatosZxing = [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
        ];
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formatosZxing);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const leitor = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 700,
        });

        streamRef.current = stream;
        video.srcObject = stream;
        await prepararCamera(stream);
        await video.play();
        const controls = await leitor.decodeFromStream(stream, video, (resultado) => {
          if (resultado) registrarLeitura(resultado.getText(), "camera");
        });

        if (cancelado) {
          controls.stop();
          return;
        }

        zxingControlsRef.current = controls;
        avisoDemora = setTimeout(() => setLeituraDemorada(true), 4500);

        if (window.BarcodeDetector) {
          let detector: BarcodeDetectorInstance | null = null;
          try {
            detector = new window.BarcodeDetector({ formats: FORMATOS });
          } catch {
            detector = null;
          }

          if (detector) {
            const detectorAtivo = detector;
            intervalo = setInterval(async () => {
              if (processandoRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
              processandoRef.current = true;
              try {
                const [resultado] = await detectorAtivo.detect(video);
                if (resultado?.rawValue) registrarLeitura(resultado.rawValue, "camera");
              } catch {
                // O ZXing continua analisando o mesmo vídeo quando a API nativa falha.
              } finally {
                processandoRef.current = false;
              }
            }, 260);
          }
        }
      } catch {
        setErro("Não foi possível iniciar a leitura. Verifique a permissão da câmera e tente novamente.");
        setCameraAtiva(false);
      }
    }

    void iniciar();
    return () => {
      cancelado = true;
      if (intervalo) clearInterval(intervalo);
      if (avisoDemora) clearTimeout(avisoDemora);
      zxingControlsRef.current?.stop();
      zxingControlsRef.current = null;
      cameraTrackRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const video = videoElement;
      if (video?.srcObject instanceof MediaStream) {
        video.srcObject.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
    };
  }, [cameraAtiva, prepararCamera, registrarLeitura]);

  useEffect(() => () => {
    if (fecharAposLeituraRef.current) clearTimeout(fecharAposLeituraRef.current);
    zxingControlsRef.current?.stop();
    cameraTrackRef.current = null;
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
                <div
                  className={`${styles.cameraFeedback} ${ultimaLeitura ? styles.cameraFeedbackSuccess : erro ? styles.cameraFeedbackError : leituraDemorada ? styles.cameraFeedbackWarning : ""}`}
                  role="status"
                  aria-live="polite"
                >
                  {ultimaLeitura
                    ? `Código lido: ${ultimaLeitura}`
                    : erro
                      ? erro
                      : leituraDemorada
                        ? "Ainda não foi possível ler. Mantenha o código inteiro e estável dentro da faixa."
                        : "Procurando código…"}
                </div>
              </div>
            ) : (
              <div className={styles.cameraEmpty}>
                <ScanBarcode size={42} />
                <strong>Aponte a câmera para o código</strong>
                <p>Enquadre o código inteiro e mantenha o aparelho estável.</p>
              </div>
            )}

            {cameraAtiva ? (
              <div className={styles.cameraAssist}>
                <div className={styles.cameraQuality}>
                  <span>Leitura detalhada</span>
                  <strong>{resolucaoCamera || "Preparando alta resolução…"}</strong>
                </div>
                {zoomCamera ? (
                  <label className={styles.zoomControl} htmlFor="barcode-camera-zoom">
                    <span><ZoomIn size={17} /> Zoom <strong>{zoomCamera.value.toFixed(1)}×</strong></span>
                    <input
                      id="barcode-camera-zoom"
                      type="range"
                      min={zoomCamera.min}
                      max={zoomCamera.max}
                      step={zoomCamera.step}
                      value={zoomCamera.value}
                      onChange={(event) => void alterarZoom(Number(event.target.value))}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

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

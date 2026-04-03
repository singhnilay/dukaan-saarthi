"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export type ScanStatus = { type: "success" | "error" | "info"; message: string };

const isLikelyBarcode = (value: string) => /^\d{8,14}$/.test(value.replace(/\D/g, ""));

export function useBarcodeScanner(options: { isActive: boolean; onResult: (barcode: string) => Promise<void> | void }) {
  const { isActive, onResult } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const activeTrackRef = useRef<MediaStreamTrack | null>(null);
  const lookupInProgressRef = useRef(false);
  const lastDetectedRef = useRef<{ code: string; ts: number }>({ code: "", ts: 0 });

  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;

    if (readerRef.current) {
      const reader = readerRef.current as any;
      if (typeof reader.reset === "function") {
        reader.reset();
      } else if (typeof reader.stopContinuousDecode === "function") {
        reader.stopContinuousDecode();
      }
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    activeTrackRef.current = null;
    setIsTorchSupported(false);
    setIsTorchOn(false);
    setIsCameraActive(false);
  }, []);

  const refreshVideoTrackCapabilities = useCallback(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()?.[0] || null;
    activeTrackRef.current = track;

    const capabilities = (track as any)?.getCapabilities?.();
    const torchAvailable = Boolean(capabilities?.torch);
    setIsTorchSupported(torchAvailable);
    if (!torchAvailable) {
      setIsTorchOn(false);
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    if (!activeTrackRef.current || !isTorchSupported) return;
    try {
      await activeTrackRef.current.applyConstraints({ advanced: [{ torch: !isTorchOn } as any] });
      setIsTorchOn((prev) => !prev);
    } catch {
      setStatus({ type: "error", message: "Torch control not available on this device." });
    }
  }, [isTorchOn, isTorchSupported]);

  const switchCamera = useCallback(() => {
    if (cameraDevices.length < 2) return;
    const currentIndex = cameraDevices.findIndex((device) => device.deviceId === selectedCameraId);
    const nextIndex = currentIndex === -1 ? 1 : (currentIndex + 1) % cameraDevices.length;
    setSelectedCameraId(cameraDevices[nextIndex].deviceId);
    setStatus({ type: "info", message: "Switching camera..." });
  }, [cameraDevices, selectedCameraId]);

  const startCamera = useCallback(async () => {
    if (!isActive) {
      stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({ type: "error", message: "Camera not supported in this browser." });
      return;
    }

    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setStatus({ type: "error", message: "Camera requires HTTPS or localhost." });
      return;
    }

    try {
      if (!videoRef.current) return;

      stop();

      if (!readerRef.current) {
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
          BarcodeFormat.RSS_14,
          BarcodeFormat.RSS_EXPANDED,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        readerRef.current = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 30,
          delayBetweenScanSuccess: 900,
        });
      }

      const videoInputs = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
      setCameraDevices(videoInputs);

      const preferredCamera =
        (selectedCameraId && videoInputs.find((device) => device.deviceId === selectedCameraId)) ||
        videoInputs.find((device) => /rear|back|environment/i.test(device.label)) ||
        videoInputs[0];

      const nextCameraId = preferredCamera?.deviceId || "";
      if (nextCameraId && nextCameraId !== selectedCameraId) {
        setSelectedCameraId(nextCameraId);
      }

      const onDecode = async (result: any, error?: unknown) => {
        if (error || !result || lookupInProgressRef.current) return;

        const detected = String(result.getText?.() || "").trim();
        if (!detected) return;
        if (!isLikelyBarcode(detected)) {
          setStatus({ type: "info", message: "Non-barcode value detected. Scan EAN/UPC codes." });
          return;
        }

        const now = Date.now();
        if (lastDetectedRef.current.code === detected && now - lastDetectedRef.current.ts < 3500) return;

        lastDetectedRef.current = { code: detected, ts: now };
        lookupInProgressRef.current = true;
        try {
          await onResult(detected);
          setStatus({ type: "success", message: `Scanned ${detected}` });
        } catch {
          setStatus({ type: "error", message: "Failed to process barcode." });
        } finally {
          lookupInProgressRef.current = false;
        }
      };

      let controls: IScannerControls;
      try {
        controls = await readerRef.current.decodeFromConstraints(
          {
            video: {
              ...(nextCameraId ? { deviceId: { exact: nextCameraId } } : { facingMode: { ideal: "environment" } }),
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, min: 15 },
            },
            audio: false,
          },
          videoRef.current,
          onDecode
        );
      } catch {
        controls = await readerRef.current.decodeFromConstraints({ video: true, audio: false }, videoRef.current, onDecode);
      }

      controlsRef.current = controls;
      refreshVideoTrackCapabilities();
      setIsCameraActive(true);
      setStatus({ type: "info", message: "Camera ready. Keep barcode centered and steady." });
    } catch (error) {
      console.error("Camera setup failed", error);
      setStatus({ type: "error", message: "Could not start camera. Check permissions and try again." });
      setIsCameraActive(false);
    }
  }, [isActive, onResult, refreshVideoTrackCapabilities, selectedCameraId, stop]);

  const scanCurrentFrame = useCallback(async () => {
    if (!readerRef.current || !videoRef.current) return;
    try {
      setStatus({ type: "info", message: "Reading current frame..." });
      const result = await readerRef.current.decodeOnceFromVideoElement(videoRef.current);
      const detected = result.getText();
      if (!detected) {
        setStatus({ type: "error", message: "No barcode found in this frame." });
        return;
      }
      await onResult(detected);
    } catch {
      setStatus({ type: "error", message: "No readable barcode detected. Try again." });
    }
  }, [onResult]);

  useEffect(() => {
    if (isActive) {
      void startCamera();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [isActive, startCamera, stop]);

  return {
    videoRef,
    status,
    cameraDevices,
    selectedCameraId,
    setSelectedCameraId,
    isCameraActive,
    isTorchSupported,
    isTorchOn,
    toggleTorch,
    switchCamera,
    scanCurrentFrame,
  };
}

import { useEffect, useRef, useState } from 'react';

type PairingScannerProps = {
  onScan: (value: string) => void;
  onClose: () => void;
};

export function PairingScanner({ onScan, onClose }: PairingScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState('Starting camera…');

  useEffect(() => {
    let stream: MediaStream | undefined;
    let frame = 0;
    let finished = false;
    let lastScan = 0;
    let decodeQR: typeof import('jsqr')['default'] | undefined;
    const stop = () => {
      finished = true;
      if (frame) cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
    };
    const scan = (timestamp: number) => {
      if (finished) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && timestamp - lastScan >= 140) {
        lastScan = timestamp;
        const scale = Math.min(1, 720 / video.videoWidth);
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = decodeQR?.(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
          if (result) {
            try {
              onScan(result.data);
              stop();
              return;
            } catch (error) {
              setMessage(String(error).replace(/^Error:\s*/, ''));
            }
          }
        }
      }
      frame = requestAnimationFrame(scan);
    };
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage('Camera scanning is not supported here. Enter the pairing code instead.');
        return;
      }
      try {
        decodeQR = (await import('jsqr')).default;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (finished) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setMessage('Point the camera at the pairing QR on the laptop.');
        frame = requestAnimationFrame(scan);
      } catch (error) {
        const denied = (error as DOMException).name === 'NotAllowedError';
        setMessage(denied
          ? 'Camera permission was denied. Allow camera access or enter the pairing code.'
          : 'The camera could not start. Enter the pairing code instead.');
      }
    };
    void start();
    return stop;
  }, [onScan]);

  return (
    <div className="pair-scanner" role="dialog" aria-modal="true" aria-label="Scan pairing QR">
      <div className="pair-scanner-panel">
        <h2>Scan Pairing QR</h2>
        <div className="pair-video-wrap">
          <video ref={videoRef} muted playsInline autoPlay />
          <div className="pair-scan-target" />
        </div>
        <canvas ref={canvasRef} hidden />
        <p className="pair-help">{message}</p>
        <button onClick={onClose}>Cancel Camera</button>
      </div>
    </div>
  );
}

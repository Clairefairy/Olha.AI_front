import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';

SplashScreen.preventAutoHideAsync();

type Mode = 'rapido' | 'detalhado';

type Detection = {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // x,y,w,h normalizados (0..1)
  distance_m: number;
  direction: 'esquerda' | 'centro' | 'direita';
};

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
const FLICK_MIN_VELOCITY = 0.4;
const FLICK_MIN_DISTANCE = 25;

// Loop de detecção contínua
const DETECT_INTERVAL_MS = 200;             // pausa entre frames
const PROXIMITY_THRESHOLD_M = 3.0;          // só anuncia objetos < 3m
const ANNOUNCE_COOLDOWN_MS = 7000;          // mesmo objeto+direção: 7s
const GLOBAL_ANNOUNCE_COOLDOWN_MS = 2500;   // qualquer anúncio: 2,5s

// Tradução básica COCO → PT-BR para a fala (sincronizada com o backend)
const PT_LABELS: Record<string, string> = {
  person: 'pessoa', bicycle: 'bicicleta', car: 'carro', motorcycle: 'motocicleta',
  airplane: 'avião', bus: 'ônibus', train: 'trem', truck: 'caminhão', boat: 'barco',
  'traffic light': 'semáforo', 'fire hydrant': 'hidrante', 'stop sign': 'placa de pare',
  'parking meter': 'parquímetro', bench: 'banco', bird: 'pássaro', cat: 'gato',
  dog: 'cachorro', horse: 'cavalo', sheep: 'ovelha', cow: 'vaca', elephant: 'elefante',
  bear: 'urso', zebra: 'zebra', giraffe: 'girafa', backpack: 'mochila',
  umbrella: 'guarda-chuva', handbag: 'bolsa', tie: 'gravata', suitcase: 'mala',
  frisbee: 'frisbee', skis: 'esquis', snowboard: 'snowboard', 'sports ball': 'bola',
  kite: 'pipa', 'baseball bat': 'taco', 'baseball glove': 'luva', skateboard: 'skate',
  surfboard: 'prancha', 'tennis racket': 'raquete', bottle: 'garrafa',
  'wine glass': 'taça', cup: 'xícara', fork: 'garfo', knife: 'faca', spoon: 'colher',
  bowl: 'tigela', banana: 'banana', apple: 'maçã', sandwich: 'sanduíche',
  orange: 'laranja', broccoli: 'brócolis', carrot: 'cenoura', 'hot dog': 'cachorro-quente',
  pizza: 'pizza', donut: 'rosquinha', cake: 'bolo', chair: 'cadeira', couch: 'sofá',
  'potted plant': 'vaso de planta', bed: 'cama', 'dining table': 'mesa',
  toilet: 'vaso sanitário', tv: 'televisão', laptop: 'notebook', mouse: 'mouse',
  remote: 'controle', keyboard: 'teclado', 'cell phone': 'celular', microwave: 'micro-ondas',
  oven: 'forno', toaster: 'torradeira', sink: 'pia', refrigerator: 'geladeira',
  book: 'livro', clock: 'relógio', vase: 'vaso', scissors: 'tesoura',
  'teddy bear': 'urso de pelúcia', 'hair drier': 'secador', toothbrush: 'escova',
};

function ptLabel(name: string) {
  return PT_LABELS[name] ?? name;
}

function directionPhrase(d: Detection['direction']) {
  if (d === 'centro') return 'à frente';
  return `à ${d}`;
}

// ── Tela de Início ─────────────────────────────────────────────────────────

function StartScreen({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => {
      Speech.speak('Olha AI. Toque em qualquer lugar da tela para iniciar a câmera.', {
        language: 'pt-BR',
      });
    }, 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <Pressable
      style={styles.startContainer}
      onPress={onStart}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Toque para iniciar o Olha.AI"
      accessibilityHint="Abre a câmera e inicia a audiodescrição"
    >
      <View style={styles.startContent}>
        <Text style={styles.logo}>Olha.AI</Text>
        <Text style={styles.tagline}>Audiodescrição inteligente</Text>
      </View>
      <View style={styles.startFooter}>
        <Text style={styles.startHint}>Toque em qualquer lugar para iniciar</Text>
      </View>
    </Pressable>
  );
}

// ── Overlay de Bounding Boxes ──────────────────────────────────────────────

function DetectionsOverlay({
  detections,
  imgSize,
  viewSize,
}: {
  detections: Detection[];
  imgSize: { width: number; height: number } | null;
  viewSize: { width: number; height: number };
}) {
  if (!imgSize || viewSize.width === 0 || viewSize.height === 0) return null;

  // CameraView usa "cover" → escala para preencher e centra cortando o excesso.
  const scale = Math.max(
    viewSize.width / imgSize.width,
    viewSize.height / imgSize.height,
  );
  const renderW = imgSize.width * scale;
  const renderH = imgSize.height * scale;
  const offsetX = (viewSize.width - renderW) / 2;
  const offsetY = (viewSize.height - renderH) / 2;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {detections.map((d, i) => {
        const [bx, by, bw, bh] = d.bbox;
        const left = offsetX + bx * renderW;
        const top = offsetY + by * renderH;
        const width = bw * renderW;
        const height = bh * renderH;

        const isClose = d.distance_m < PROXIMITY_THRESHOLD_M;
        const color = isClose ? '#FF3B30' : '#00E676';

        return (
          <View
            key={`${d.class}-${i}`}
            style={[
              styles.bbox,
              { left, top, width, height, borderColor: color },
            ]}
          >
            <View style={[styles.bboxLabel, { backgroundColor: color }]}>
              <Text style={styles.bboxLabelText} numberOfLines={1}>
                {ptLabel(d.class)} • {d.distance_m.toFixed(1)} m
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Tela da Câmera ─────────────────────────────────────────────────────────

function CameraContent() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('rapido');
  const [statusText, setStatusText] = useState('Toque para descrever');
  const [isProcessing, setIsProcessing] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [imgSize, setImgSize] = useState<{ width: number; height: number } | null>(null);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });

  const cameraRef = useRef<CameraView>(null);
  const cameraReadyRef = useRef(false);
  const processingRef = useRef(false);
  const isMountedRef = useRef(true);
  const modeRef = useRef<Mode>('rapido');
  const lastAnnouncePerKeyRef = useRef<Record<string, number>>({});
  const lastGlobalAnnounceRef = useRef(0);
  const isSpeakingFromAppRef = useRef(false); // controla TTS gerado pelo app

  useEffect(() => {
    const t = setTimeout(() => {
      Speech.speak(
        'Câmera iniciada. Modo Rápido. Toque na tela para descrever a cena. Deslize para trocar o modo.',
        { language: 'pt-BR' },
      );
    }, 500);
    return () => clearTimeout(t);
  }, []);

  // ── Loop de detecção contínua ──────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;

    const loop = async () => {
      while (isMountedRef.current) {
        const ready =
          cameraReadyRef.current &&
          cameraRef.current !== null &&
          !processingRef.current;

        if (!ready) {
          await wait(DETECT_INTERVAL_MS);
          continue;
        }

        try {
          const photo = await cameraRef.current!.takePictureAsync({
            base64: true,
            quality: 0.3,
            skipProcessing: true,
            shutterSound: false,
          });

          if (!photo?.base64) {
            await wait(DETECT_INTERVAL_MS);
            continue;
          }

          const res = await fetch(`${API_URL}/detect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: photo.base64 }),
          });

          if (!res.ok) {
            await wait(DETECT_INTERVAL_MS * 2);
            continue;
          }

          const json = (await res.json()) as { detections: Detection[] };
          if (!isMountedRef.current) return;

          setDetections(json.detections);
          if (photo.width && photo.height) {
            setImgSize({ width: photo.width, height: photo.height });
          }

          announceProximity(json.detections);
        } catch {
          // erros transitórios de rede/captura: ignora e tenta novamente
        }

        await wait(DETECT_INTERVAL_MS);
      }
    };

    loop();
    return () => {
      isMountedRef.current = false;
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const announceProximity = useCallback(async (dets: Detection[]) => {
    if (processingRef.current) return; // descrição completa em andamento
    const now = Date.now();
    if (now - lastGlobalAnnounceRef.current < GLOBAL_ANNOUNCE_COOLDOWN_MS) return;

    // Não interrompe falas em andamento (próprias ou da descrição)
    try {
      const speaking = await Speech.isSpeakingAsync();
      if (speaking) return;
    } catch {
      // alguns ambientes podem não suportar — segue em frente
    }

    // Anuncia o objeto mais próximo (< 3m) que esteja fora do cooldown.
    const close = dets
      .filter((d) => d.distance_m < PROXIMITY_THRESHOLD_M)
      .sort((a, b) => a.distance_m - b.distance_m);

    for (const d of close) {
      const key = `${d.class}|${d.direction}`;
      const last = lastAnnouncePerKeyRef.current[key] ?? 0;
      if (now - last < ANNOUNCE_COOLDOWN_MS) continue;

      const text = `${ptLabel(d.class)} próximo ${directionPhrase(d.direction)}`;
      isSpeakingFromAppRef.current = true;
      Speech.speak(text, {
        language: 'pt-BR',
        rate: 1.05,
        onDone: () => { isSpeakingFromAppRef.current = false; },
        onStopped: () => { isSpeakingFromAppRef.current = false; },
        onError: () => { isSpeakingFromAppRef.current = false; },
      });
      lastAnnouncePerKeyRef.current[key] = now;
      lastGlobalAnnounceRef.current = now;
      Haptics.selectionAsync();
      break;
    }
  }, []);

  const toggleMode = useCallback(() => {
    const next: Mode = modeRef.current === 'rapido' ? 'detalhado' : 'rapido';
    modeRef.current = next;
    setMode(next);
    const announce = next === 'rapido' ? 'Modo Rápido ativado' : 'Modo Detalhado ativado';
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Speech.stop();
    Speech.speak(announce, { language: 'pt-BR' });
    setStatusText(next === 'rapido' ? 'Modo: Rápido' : 'Modo: Detalhado');
  }, []);

  const capture = useCallback(async () => {
    if (processingRef.current || !cameraRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    setStatusText('Descrição de IA em andamento, por favor aguarde…');

    // Padrão tátil distintivo para a IA: 3 pulsos curtos.
    // Usa `Vibration` em vez de `Haptics` porque o motor háptico
    // pode falhar silenciosamente em alguns Androids — Vibration sempre
    // dispara desde que a permissão android.permission.VIBRATE esteja ativa
    // (já vem por padrão no Expo).
    // Padrão: [espera, vibra, espera, vibra, espera, vibra]
    Vibration.vibrate([0, 80, 90, 80, 90, 120]);

    // Aviso falado — interrompe qualquer fala anterior (anúncios de proximidade).
    Speech.stop();
    Speech.speak('Descrição de IA em andamento, por favor aguarde.', {
      language: 'pt-BR',
      rate: 1.05,
    });

    const currentMode = modeRef.current;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
        shutterSound: false,
      });

      setStatusText('Analisando…');

      const res = await fetch(`${API_URL}/describe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: photo.base64, mode: currentMode }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { description } = (await res.json()) as { description: string };
      setStatusText(description);
      Speech.stop();
      Speech.speak(description, {
        language: 'pt-BR',
        rate: currentMode === 'rapido' ? 1.1 : 0.95,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Vibration.vibrate(50);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'erro desconhecido';
      console.warn('[Olha.AI] erro ao chamar backend:', detail, 'URL:', API_URL);
      const msg = `Não foi possível conectar ao servidor. Verifique a rede. (${detail})`;
      setStatusText(msg);
      Speech.stop();
      Speech.speak('Não foi possível conectar ao servidor. Verifique a rede.', {
        language: 'pt-BR',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Vibration.vibrate([0, 200, 100, 200]);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
        onPanResponderRelease: (_, gs) => {
          const dist = Math.sqrt(gs.dx ** 2 + gs.dy ** 2);
          const vel = Math.sqrt(gs.vx ** 2 + gs.vy ** 2);
          if (dist >= FLICK_MIN_DISTANCE && vel >= FLICK_MIN_VELOCITY) {
            toggleMode();
          } else if (dist < 10) {
            capture();
          }
        },
      }),
    [toggleMode, capture],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewSize({ width, height });
  }, []);

  if (!permission) return <View style={styles.camera} />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>
          O Olha.AI precisa acessar a câmera para funcionar.
        </Text>
        <Pressable
          style={styles.permissionButton}
          onPress={requestPermission}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Permitir acesso à câmera"
        >
          <Text style={styles.permissionButtonText}>Permitir Câmera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={styles.camera}
      onLayout={onLayout}
      {...panResponder.panHandlers}
      accessible
      accessibilityLabel="Câmera do Olha.AI"
      accessibilityHint="Toque para descrever a cena. Deslize para trocar o modo."
    >
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        animateShutter={false}
        onCameraReady={() => { cameraReadyRef.current = true; }}
      />

      <DetectionsOverlay
        detections={detections}
        imgSize={imgSize}
        viewSize={viewSize}
      />

      <View
        style={[styles.modeBadge, mode === 'rapido' ? styles.badgeFast : styles.badgeDetailed]}
        accessible
        accessibilityLabel={`Modo atual: ${mode === 'rapido' ? 'Rápido' : 'Detalhado'}`}
      >
        <Text style={styles.modeText}>
          {mode === 'rapido' ? 'RÁPIDO' : 'DETALHADO'}
        </Text>
      </View>

      <View style={styles.statusBar}>
        {isProcessing && (
          <ActivityIndicator size="large" color="#FFD600" style={styles.spinner} />
        )}
        <Text style={styles.statusText} accessibilityLiveRegion="polite">
          {statusText}
        </Text>
        <Text style={styles.hintText}>
          Toque para descrever {'  •  '} Deslize para trocar o modo
        </Text>
        {detections.length > 0 && (
          <Text style={styles.detCount}>
            {detections.length} objeto{detections.length === 1 ? '' : 's'} detectado{detections.length === 1 ? '' : 's'}
          </Text>
        )}
      </View>
    </View>
  );
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ── Raiz do App ────────────────────────────────────────────────────────────

export default function App() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      {started ? (
        <CameraContent />
      ) : (
        <StartScreen onStart={() => setStarted(true)} />
      )}
    </View>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Tela de início
  startContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  startContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    color: '#FFFFFF',
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: 2,
  },
  tagline: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 18,
    fontWeight: '400',
    textAlign: 'center',
  },
  startFooter: {
    alignItems: 'center',
  },
  startHint: {
    color: '#00C896',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Tela da câmera
  camera: {
    flex: 1,
    backgroundColor: '#000',
  },
  modeBadge: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 32,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  badgeFast: {
    backgroundColor: '#00C896',
  },
  badgeDetailed: {
    backgroundColor: '#2979FF',
  },
  modeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
  },
  statusBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 20,
    paddingBottom: 48,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    marginBottom: 4,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 28,
  },
  hintText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
  },
  detCount: {
    color: 'rgba(0,230,118,0.85)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Overlay de detecção
  bbox: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  bboxLabel: {
    position: 'absolute',
    top: -22,
    left: -2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 220,
  },
  bboxLabelText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Permissão de câmera
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 32,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 34,
  },
  permissionButton: {
    backgroundColor: '#00C896',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 16,
  },
  permissionButtonText: {
    color: '#000000',
    fontSize: 20,
    fontWeight: '800',
  },
});

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

SplashScreen.preventAutoHideAsync();

type Mode = 'rapido' | 'detalhado';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
const FLICK_MIN_VELOCITY = 0.4;
const FLICK_MIN_DISTANCE = 25;

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

// ── Tela da Câmera ─────────────────────────────────────────────────────────

function CameraContent() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('rapido');
  const [statusText, setStatusText] = useState('Toque para descrever');
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const processingRef = useRef(false);
  const modeRef = useRef<Mode>('rapido');

  useEffect(() => {
    const t = setTimeout(() => {
      Speech.speak(
        'Câmera iniciada. Modo Rápido. Toque na tela para descrever a cena. Deslize para trocar o modo.',
        { language: 'pt-BR' },
      );
    }, 500);
    return () => clearTimeout(t);
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
    setStatusText('Capturando imagem…');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const currentMode = modeRef.current;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
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
      {...panResponder.panHandlers}
      accessible
      accessibilityLabel="Câmera do Olha.AI"
      accessibilityHint="Toque para descrever a cena. Deslize para trocar o modo."
    >
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

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
      </View>
    </View>
  );
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

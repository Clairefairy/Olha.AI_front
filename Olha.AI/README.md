# Olha.AI — Front-end

Aplicativo mobile de **audiodescrição inteligente** para pessoas com deficiência visual. O usuário aponta a câmera para qualquer cena, toca na tela e ouve uma descrição falada gerada por IA.

---

## Visão geral

O Olha.AI captura um frame da câmera traseira, envia a imagem em Base64 para o back-end e reproduz a descrição recebida via síntese de voz (TTS). Toda a interação foi projetada para ser acessível sem depender de leitura visual.

**Plataformas suportadas:** Android · iOS

---

## Funcionalidades

| Recurso | Descrição |
|---|---|
| Detecção contínua | Reconhecimento de objetos em tempo real via YOLO v11 enquanto o app roda |
| Overlay de objetos | Caixas e rótulos desenhados sobre cada objeto na imagem da câmera |
| Estimativa de distância | Cada objeto recebe uma distância aproximada (em metros) calculada no servidor |
| Audiodescrição de proximidade | Apenas objetos a **menos de 3 metros** são falados, no formato "[objeto] próximo à [direção]" |
| Toque para descrever | Um toque captura a cena atual e gera uma descrição completa por IA |
| Dois modos de análise | **Rápido** — resposta objetiva e veloz · **Detalhado** — descrição completa da cena |
| Troca de modo por gesto | Deslize (flick) em qualquer direção para alternar entre os modos |
| Feedback háptico | Vibrações distintas para captura, sucesso, erro e proximidade |
| Síntese de voz (PT-BR) | Todo texto é lido em português brasileiro via `expo-speech` |
| Acessibilidade nativa | Rótulos, hints e papéis ARIA configurados para leitores de tela (TalkBack / VoiceOver) |

### Como funciona a detecção em tempo real

1. Enquanto a tela da câmera está ativa, o app captura frames de baixa qualidade em loop (~5 FPS).
2. Cada frame é enviado para `POST /detect` no back-end, que retorna a lista de objetos com **bounding box**, **distância estimada** e **direção** (esquerda/centro/direita).
3. O app desenha um retângulo colorido sobre cada objeto com seu nome em PT-BR e distância em metros (vermelho = perto; verde = afastado).
4. Para cada objeto a menos de 3 m, o app fala uma frase curta como "pessoa próximo à direita". Há um cooldown de ~7 s por (classe + direção) para evitar repetições.
5. O toque na tela continua disparando a descrição completa via IA no endpoint `/describe`, sem interferir com o loop de detecção.

---

## Tecnologias

- [React Native](https://reactnative.dev/) 0.83 + [React](https://react.dev/) 19
- [Expo](https://expo.dev/) 55 (bare-ish, sem Expo Router)
- `expo-camera` — captura de frames
- `expo-speech` — síntese de voz PT-BR
- `expo-haptics` — feedback tátil
- `expo-splash-screen` — tela de carregamento
- TypeScript 5.9

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- [Expo CLI](https://docs.expo.dev/more/expo-cli/) (`npm install -g expo-cli` ou use `npx expo`)
- Para Android: Android Studio + emulador **ou** dispositivo físico com o app [Expo Go](https://expo.dev/go)
- Para iOS: Xcode + simulador **ou** dispositivo físico com Expo Go (macOS necessário para build nativo)
- Back-end do Olha.AI em execução (veja a seção [Configuração do back-end](#configuração-do-back-end))

---

## Instalação

```bash
# 1. Clone o repositório
git clone <url-do-repositório>
cd Olha.AI

# 2. Instale as dependências
npm install

# 3. Copie o arquivo de variáveis de ambiente
cp .env.example .env          # edite EXPO_PUBLIC_API_URL se necessário
```

---

## Configuração do back-end

O app consome o endpoint `POST /describe` do back-end Olha.AI.  
Por padrão a URL apontada é `http://localhost:8000`.

Para alterar, defina a variável de ambiente no arquivo `.env`:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000
```

> **Dica:** use o IP da máquina na rede local quando testar em dispositivo físico, pois `localhost` resolve para o próprio telefone.

---

## Executando o projeto

```bash
# Metro bundler (escolha a plataforma no terminal ou escaneie o QR Code)
npm start

# Direto no Android
npm run android

# Direto no iOS
npm run ios
```

---

## Gestos e interação

| Gesto | Ação |
|---|---|
| Toque simples | Captura a cena e solicita descrição ao back-end |
| Flick (deslize rápido) | Alterna entre Modo Rápido e Modo Detalhado |

### Modos de análise

- **Rápido** (badge verde) — descrição curta e objetiva, lida a 1.1× de velocidade
- **Detalhado** (badge azul) — descrição completa da cena, lida a 0.95× de velocidade

---

## Permissões solicitadas

| Plataforma | Permissão | Motivo |
|---|---|---|
| iOS | `NSCameraUsageDescription` | Identificar objetos e descrever a cena |
| iOS | `NSMicrophoneUsageDescription` | Requerida pelo framework de câmera |
| Android | `CAMERA` | Capturar frames para análise |

---

## Estrutura do projeto

```
Olha.AI/
├── App.tsx              # Ponto de entrada — StartScreen + CameraContent
├── app.json             # Configuração Expo (ícones, permissões, splash)
├── assets/
│   └── images/          # Ícones e splash screen
├── package.json
└── tsconfig.json
```

---

## Fluxo da aplicação

```
Splash Screen
     │
     ▼
StartScreen ──── toque ────► CameraContent
                                  │
            ┌─────────────────────┴─────────────────────┐
            │                                           │
   Loop de detecção (sempre)              Toque na câmera (sob demanda)
            │                                           │
   takePictureAsync (qualidade 0.3)          takePictureAsync (qualidade 0.6)
            │                                           │
   POST /detect { image }                    POST /describe { image, mode }
            │                                           │
   detections[] (bbox, distância, direção)    description (texto da IA)
            │                                           │
   ┌────────┴────────┐                          Speech.speak(descrição)
   │                 │                          Haptics.Success
   Overlay         < 3 m?
   na tela           │
                     ▼
           Speech.speak("nome próximo à direção")
           Haptics.selectionAsync
```

---

## Acessibilidade

O app foi desenvolvido com foco total em acessibilidade:

- Toda a tela é um elemento tocável com `accessibilityRole` e `accessibilityLabel` explícitos
- O texto de status usa `accessibilityLiveRegion="polite"` para que leitores de tela anunciem atualizações
- O áudio TTS é o canal principal de comunicação — a interface visual é complementar
- Feedback háptico reforça cada etapa do fluxo sem exigir atenção visual

---

## Licença

Privado — todos os direitos reservados.

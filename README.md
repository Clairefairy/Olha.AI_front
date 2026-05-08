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
| Toque para descrever | Um toque em qualquer área da tela captura a cena atual |
| Dois modos de análise | **Rápido** — resposta objetiva e veloz · **Detalhado** — descrição completa da cena |
| Troca de modo por gesto | Deslize (flick) em qualquer direção para alternar entre os modos |
| Feedback háptico | Vibrações distintas para captura, sucesso e erro |
| Síntese de voz (PT-BR) | Todo texto é lido em português brasileiro via `expo-speech` |
| Acessibilidade nativa | Rótulos, hints e papéis ARIA configurados para leitores de tela (TalkBack / VoiceOver) |

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
                          toque na câmera
                                  │
                          takePictureAsync()
                                  │
                          POST /describe { image, mode }
                                  │
                     ┌────────────┴────────────┐
                  sucesso                    erro
                     │                         │
             Speech.speak(descrição)   Speech.speak(mensagem de erro)
             Haptics.Success           Haptics.Error
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

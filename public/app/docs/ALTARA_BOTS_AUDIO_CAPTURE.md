# Receber e gravar voz com bots

Esta funcionalidade é separada do leitor de música. Um bot de música continua
a publicar áudio sem receber os microfones da chamada. A receção usa um pedido
explícito e uma sala de captura isolada para cada bot e canal.

## Estado

O backend foi ativado com autorização explícita em 2026-10-02. Foram verificados
o catálogo, a autenticação e os acessos; as autorizações, o leitor Node e a interface
de consentimento também têm testes locais. A receção/gravação de microfones numa
chamada real com participantes que aceitem o teste não foi exercitada hoje. Não
foram capturados nem gravados microfones reais. O
[registo da ativação](ALTARA_BOTS_PLATFORM_V2.md#hosted-activation-2026-10-02)
delimita a verificação publicada. O guia técnico completo está em
[ALTARA_BOTS_MUSIC.md](ALTARA_BOTS_MUSIC.md#optional-voice-reception-and-recording).

## Exemplo Node

O dono do bot pode definir no seu ambiente privado:

```dotenv
ALTARA_BOT_AUDIO_CAPTURE_EXAMPLE=1
ALTARA_RECORDING_DIRECTORY=
```

Deixar a pasta vazia desativa `/record`. Para gravar, escolher uma pasta local
própria e aprovar **Record Voice**, além de **Connect to Voice** e **Listen to
Voice**. Reiniciar o exemplo para atualizar os comandos. Não iniciar dois
processos com o mesmo token.

- `/listen`: abre um pedido de receção sem escrever ficheiros neste exemplo.
- `/record`: abre um pedido para receber e guardar áudio autorizado.
- `/capture-stop`: fecha a captura e os leitores.

Cada pessoa aceita a partilha do seu próprio microfone no menu da chamada.
O aviso explica que o responsável pelo bot recebe esse áudio e pode guardá-lo.
Entrar depois na chamada não dá consentimento automaticamente. Um botão visível
permite parar a partilha; mute, deafen, sair, trocar de conta, canal ou microfone
também suspendem ou terminam a transmissão do clone. O microfone original da
chamada não é parado pelo módulo de consentimento.

O limite é de oito microfones e 30 minutos por captura. A gravação produz WAV
mono de 48 kHz, com ficheiros separados de nome aleatório, até cerca de 173 MB
por participante em 30 minutos. O dono do bot escolhe a pasta e gere a retenção
e eliminação dos ficheiros. Texto e links do chat não escolhem caminhos.

Um programador que recebe áudio pode copiá-lo ou processá-lo no seu código.
O modo de escuta não torna essa cópia tecnicamente impossível. Partilhar apenas
com bots e responsáveis em quem se confia.

## API e isolamento

- `ctx.captureVoice({recording:false|true})`: exige uma interação real e resolve
  o canal atual de voz do invocador no servidor.
- `bot.heartbeatAudioCapture({serverId,channelId,captureId})`: renova a captura
  exata e verifica acesso atual e consentimentos.
- `bot.closeAudioCapture(...)`: fecha essa captura e revoga as suas identidades.

`capture-commands.js` fornece os comandos opcionais e `audio-receiver.js` usa
o `AudioStream` oficial do LiveKit para entregar PCM ao callback `onFrame` ou
guardar WAV. O encerramento do processo deve chamar `stop()` em ambos os
controladores, de música e de receção.

O bot recebe um token de subscrição sem publicação apenas para
`bot-audio:<bot>:<servidor>:<canal>:<captura>`. Cada pessoa recebe uma identidade
própria, com publicação apenas de microfone e sem subscrição. Não são dados
tokens de subscrição da sala normal aos bots. Os consentimentos são ligados à
conta e geração atual de voz, expiram em 20 segundos e são renovados pelo
navegador a cada oito segundos. O heartbeat também retira no fornecedor os
consentimentos expirados, revogados ou de pessoas que mudaram de chamada.

A receção requer LiveKit Cloud para revogar também credenciais que o fornecedor
renovou automaticamente. Fechar uma sala, por si só, não invalida esses tokens.
Por isso a captura retira o bot e todas as identidades de microfone persistidas
antes de apagar a sala isolada. A receção fica indisponível em LiveKit
autoalojado; a publicação normal de música mantém o comportamento existente.
Estas condições seguem as referências oficiais de
[tokens](https://docs.livekit.io/frontends/reference/tokens-grants/) e
[remoção de participantes](https://docs.livekit.io/intro/basics/rooms-participants-tracks/participants/).

## Backend ativo e verificação a concluir

A migração `20261002164801_bot_audio_consent_recovery_v1.sql`, aplicada em
2026-10-02 com autorização explícita, cria tabelas
privadas de captura/consentimento e os RPCs exclusivos do serviço
`bots_audio_capture_v1` e `bots_recover_voice_connection_v1`. Preserva os dados
existentes. A função nova é `altara-bot-audio-capture`, com autenticação própria
para JWT humano e token de bot; por isso a configuração usa `verify_jwt=false`.
O frontend deve incluir `botAudioConsent.js`, a interface de consentimento e
os hooks de mudanças da chamada. A recuperação da música requer também a
função atualizada `altara-bot-voice-token`. Ambas as funções estão ACTIVE. O check
sem autenticação, com IDs válidos, recebeu `401 authentication_required`; isto
verifica a recusa do pedido, não a receção real de áudio autenticado.

Novas alterações no backend publicado exigem autorização explícita do operador.
Ainda falta verificar, numa chamada real consentida, opt-in de duas pessoas,
uma pessoa que entra depois, revoke, mute,
deafen, mudança de conta/canal/microfone e uma renovação falhada. Verificar o WAV
e o corte real de áudio, não apenas um indicador de ligação.

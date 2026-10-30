# Fórum, palco e estados de eventos

> **Palcos retirados em 7 de outubro de 2026 por escolha do utilizador.** O código e as provas Stage abaixo ficam guardados para uma retoma futura. Os controlos de palco e o canal de teste estão ocultos; as ações Stage são recusadas pelos clientes e gateways enquanto a funcionalidade está suspensa. Fóruns e estados de eventos continuam disponíveis. Ver `ALTARA_STAGE_DEFERRED.md` para o estado da suspensão e as condições de retoma.

As migrações e funções aprovadas foram publicadas em 7 de outubro de 2026. O catálogo alojado confirma as RPCs e os acessos limitados. A ativação física de palcos continua suspensa: um estado `pending` mantém-se em preparação até o adaptador autorizado confirmar os acessos de voz e a barreira de expiração. Esta publicação não constitui prova de um palco ativo na infraestrutura de voz.

Os testes de interface descritos abaixo usam dados fictícios em browser isolado. A política de acesso ao separador do utilizador impediu a confirmação final nessa sessão real; não se apresenta esse passo como verificado. A verificação SQL alojada passou, incluindo fórum, replay da thread nativa, componentes e AutoMod. Os treze contadores do namespace fictício ficaram a zero após rollback. A evidência fica separada em `output/bot-hosted-verification-20261007`; não prova upload físico, entrega HTTP autenticada ou ativação de palco.

## Canais

`lib/botChannelModesUi.js` exporta `createChannelModeController` e `createChannelModeDialog`.

O contexto fornecido pelo chat contém `actor`, `serverId`, `channelId`, `channelType` (`text` ou `voice`), `canView`, `canManageChannels`, `canModerateStage`, `canConnect`, `connected` e `canCreatePosts`. `connectedSubjects` pode fornecer as pessoas e bots realmente presentes; a autoridade final e a presença são verificadas no backend. Os identificadores e o contexto atual são revistos em cada operação e após cada resposta.

As leituras usam `altara_channel_modes_read_v1(p_server_id,p_channel_id)`. Se o último estado do canal ou de um participante estiver em preparação, «Verificar estado» usa a ação `channel_mode_get` do adaptador autenticado `altara-channel-modes`. Esse adaptador reconcilia os acessos de voz e devolve o snapshot atual. As alterações também usam exclusivamente esse adaptador, através da função injetada `callAction(body)`. O cliente nunca chama uma função de finalização de permissões de voz.

| Ação | Payload |
| --- | --- |
| `channel_mode_set` | `{channel_id,mode}` |
| `stage_participant_set` | `{channel_id,subject_kind,subject_id,speaker}` |
| `stage_request` | `{channel_id,enabled}` |
| `forum_post_create` | `{channel_id,title,content}` |

Todas as alterações incluem `server_id`, `channel_id` e um `request_id` UUID. Uma resposta perdida conserva exatamente esse pedido durante uma repetição; uma mudança de conta ou navegação descarta o contexto anterior. Um estado `pending` é apresentado como preparação, sem declarar ativo o palco ou o orador. A confirmação deve vir do adaptador trusted e de uma nova leitura autoritativa.

O callback `onOpenThreads({serverId,channelId,forum:true})` abre a janela de threads existente. `createForumPost(title,content)` usa a criação atómica de thread e primeira mensagem do backend. Não existe uma segunda implementação de conversas para fóruns.

## Eventos

`lib/serverHome.js` integra os controlos nos cartões reais de `lib/serverEventCard.js`. As respostas Going/Not Going, o calendário, o editor e a navegação mantêm as funções existentes.

As transições são finitas: `scheduled → active/canceled`, `active → completed`. Não existem transições a partir de estados finais. As ações humanas usam `altara_event_lifecycle_read_v1(p_event_id)` e `altara_event_lifecycle_actor_v1(p_event_id,p_status,p_request_id)`; as respostas têm de incluir o `server_id` real do evento. Antes de reutilizar um controlador é feita uma nova leitura, para observar alterações de outra sessão.

O feed usa uma consulta agrupada e limitada a 100 eventos na tabela `altara_event_lifecycle_v1`. Um backend sem esta base mantém os cartões nativos e não mostra controlos fictícios. Depois de reconhecer a base, uma falha temporária apresenta estado indisponível e bloqueia ações até confirmar o estado. Eventos ativos, terminados e cancelados não permitem uma nova resposta de presença, mesmo com uma data futura.

A atualização externa aproveita os mecanismos existentes do painel (notificações, recuperação e atualização periódica); não cria um novo ciclo de pedidos. O calendário continua a exportar o evento existente; este bloco não acrescenta cancelamentos a ficheiros já importados noutra aplicação.

## Verificação local

`tests/bot-channel-modes-ui.test.mjs` verifica contratos, preparação, permissões atuais, contexto, repetição de pedidos e transições. Os testes relevantes do painel, cartões, respostas e navegação foram incluídos na execução.

`tests/bot-channel-modes-ui-browser.test.mjs` utiliza dados fictícios e interceção de rede numa origem isolada. Verifica desktop e telemóvel, strings escapadas, abertura da janela de threads existente, cartões reais, resposta perdida, mudança remota, indisponibilidade de metadata e ausência de migração. Não é um teste contra contas ou servidores publicados.

Evidência e hashes: `output/bot-parity-channel-modes-ui-20261007/final-verification.json`.

O mesmo manifesto inclui a revisão dos adaptadores `botSurfaceInteractions.js` e `botPrivateAttachments.js`: mapeamento de botões públicos e privados e seletores de entidades para as tabelas reais de DM/thread, repetição do UUID sem duplicar a ação, acesso HTTPS e rejeição de respostas de uma conta/navegação anterior. O broker privado valida a origem, o bucket e o caminho exatos, o prazo da resposta e do acesso e parâmetros de URL sem duplicados. Esta revisão utiliza o binder real e fixtures de DOM/dados, sem ler anexos de contas reais.

`tests/bot-forum-composer-browser.test.mjs` executa apenas os três controlos reais extraídos de `app.js`, sem arrancar a aplicação: abertura de publicações, leitura partilhada por navegação, passagem fórum/chat/DM, rascunho preservado, respostas tardias e restauro de permissões no desktop e no telemóvel. O manifesto guarda hashes específicos desses controlos. Um bloqueio de `disabled` já existente, pertencente a outra função, não é retirado pela recuperação de permissões.

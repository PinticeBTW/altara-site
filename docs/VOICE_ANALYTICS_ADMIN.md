# Administração privada de voz ALTARA

O painel Next.js está em `/admin/voice`, com entrada em `/admin`. O admin local de Founding Creators também tem um link «Analytics de voz». Esse link abre o domínio oficial e só passa a servir esta funcionalidade depois de uma publicação autorizada. A sessão do admin local não é transferida entre origens; no painel web utiliza-se a sessão ALTARA do navegador.

**Estado atual, 28 de outubro de 2026:** o servidor local está configurado e foi validado no navegador com dados reais de Supabase e LiveKit Cloud. Está disponível em `http://127.0.0.1:3217/admin/voice`, enquanto o processo local estiver em execução. O site ainda não foi publicado com esta funcionalidade.

## O que foi implementado

- **Agora:** salas abertas, servidor/canal quando identificáveis, contas ligadas, identidades técnicas, estados, entrada e tempo de ligação. Atualização automática a cada 20 segundos, suspensa quando o separador está oculto. Uma sala aberta pode estar vazia durante o timeout de fecho da LiveKit.
- **Histórico:** consulta paginada de 25 sessões, datas UTC dentro dos últimos sete dias, duração da sala e detalhe de participantes, reconexões e tempos.
- **Utilização:** gráfico de sessões da página. «Calcular utilização desta página» consulta os detalhes dessa página para calcular minutos por conta e minutos faturáveis, com concorrência limitada. Não apresenta uma página como o total do projeto. O gráfico passa a minutos de ligação quando os intervalos estão completos.
- **Identificação:** associação estrita de identities a `public.profiles(id,username,display_name,avatar_url)`. `sv2:<UUID utilizador>:<UUID geração>` identifica a conta pelo primeiro UUID, nunca pela geração. O exemplo fornecido foi confirmado em leitura na base ALTARA; as contas `aarao18` e `Teko` existem.
- **Contexto:** suporta nomes atuais e antigos das salas de voz de servidor, chamadas privadas e chamadas de grupo. Nomes privados de conversas e mensagens não são consultados. Contextos eliminados ou desconhecidos mantêm os identificadores sem inventar nomes.

## Como aceder localmente

Na pasta `A:\ALTARA\altara-site`, configurar as variáveis abaixo no ambiente **do servidor** ou no `.env.local` ignorado pelo Git. Preservar as variáveis existentes. Depois executar `npm run dev` e abrir `/admin/voice` no endereço apresentado pelo Next.js. Entrar primeiro na aplicação ALTARA desse mesmo endereço com a conta autorizada; o painel fornece um link para o início de sessão.

| Variável | Finalidade |
| --- | --- |
| `SUPABASE_URL` | URL do projeto ALTARA, referência `tbbgwjmmaiclkhssimhf`. O código verifica esta associação. |
| `SUPABASE_ANON_KEY` | Chave pública para validar a sessão contra Auth/RPC. Pode usar a variável pública já existente `NEXT_PUBLIC_SUPABASE_ANON_KEY`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Consulta privilegiada de perfis e contexto, exclusivamente após autorização. |
| `LIVEKIT_URL` | URL HTTPS/WSS do projeto LiveKit Cloud usado pela emissão de tokens existente. |
| `LIVEKIT_API_KEY` | Chave API do mesmo projeto LiveKit, mantida no servidor. |
| `LIVEKIT_API_SECRET` | Segredo LiveKit, mantido no servidor. |
| `LIVEKIT_PROJECT_ID` | Identificador `p_...` do mesmo projeto, necessário para histórico. |

Nunca prefixar credenciais privilegiadas com `NEXT_PUBLIC_`, escrever os seus valores em código ou enviá-los no chat. A presença destas credenciais nas Edge Functions Supabase não as disponibiliza automaticamente ao processo Next.js/Vercel. Foi criada uma chave LiveKit dedicada após autorização explícita, conforme descrito na ativação abaixo. Não foi ativado um serviço pago ou alterado o plano.

Após uma futura publicação autorizada do site, o acesso será `https://www.altaraapp.com/admin/voice`. As mesmas variáveis privadas terão de estar no ambiente Vercel correspondente. Esta implementação, por si só, não publica o painel.

## Segurança e autorização

Cada pedido GET a `/api/admin/voice` exige um Bearer token Supabase. O servidor valida o utilizador em Auth com `getUser`, exige email confirmado e rejeita sessões anónimas. Depois executa `public.is_reports_owner()` com o JWT desse utilizador. Só o valor booleano `true` permite consultar LiveKit e criar o cliente privilegiado de Supabase. A decisão não usa `user_metadata`, usernames, permissões locais do navegador ou cargos de administrador de um servidor ALTARA.

Reutiliza-se a autoridade global de relatórios existente: a allowlist de Founding Creators, só por si, não dá acesso a analytics de todos os utilizadores. Não foram alteradas essa autoridade, RLS, grants, tabelas ou migrações. O cache curto é privado, por administrador e consulta; a autorização é repetida antes de cada acesso ao cache. As respostas têm `Cache-Control: private, no-store`, `Vary: Authorization` e `X-Robots-Tag: noindex`.

O módulo que lê segredos tem `import "server-only"`. As respostas são construídas por seleção de campos, sem devolver objetos brutos da LiveKit. Erros do fornecedor são substituídos por mensagens controladas. Os avatares aceites vêm apenas de assets locais conhecidos e de Storage público do projeto ALTARA, sem URLs privadas assinadas nem imagens externas de rastreio. As páginas não montam os componentes de marketing/Clarity.

## Como interpretar métricas

«Contas únicas» deduplica UUIDs humanos reconhecidos. Reconexões e gerações sobrepostas da mesma conta são unidas no cálculo de tempo; bots, auxiliares de partilha de ecrã e capturas ficam identificados à parte. Apenas o estado LiveKit `active` confirma uma ligação de media atual.

«Tempo de ligação de contas» soma os intervalos por conta, sem sobreposição dentro da mesma sala. É diferente da duração da sala e dos `connectionMinutes` faturáveis devolvidos pela LiveKit, que podem incluir ligações técnicas e critérios próprios de faturação. Totais de várias salas podem incluir uma conta ligada simultaneamente a mais do que uma sala. Campos ausentes ou intervalos incompletos aparecem indisponíveis, em vez de zero ou de durações inventadas.

Uma ligação não prova que alguém esteja a falar; contas diferentes não provam pessoas diferentes. Nomes e avatares refletem o perfil atual, não uma cópia histórica. Não são recolhidos áudio, transcrições, mensagens, IPs, localização, dispositivos ou browsers pelo painel. A LiveKit pode devolver alguns desses metadados à consulta do servidor; eles não são guardados no cache de analytics nem devolvidos ao navegador.

## Capacidades reais e limites

A [RoomService oficial](https://docs.livekit.io/reference/other/roomservice-api/) lista salas abertas e participantes atuais. O painel consulta no máximo 100 salas, com concorrência e tempo limitados. Corridas de fecho de sala e falhas de participantes resultam numa indicação de consulta parcial. Uma fotografia em cache pode ter até dez segundos quando entregue; a interface mostra a data da última consulta.

A [Analytics API oficial](https://docs.livekit.io/deploy/admin/analytics-api/) requer **Scale ou superior** e um token `roomList`. O endpoint documentado lista sessões com `page`, `limit`, `start` e `end` e permite consultar participantes e minutos faturáveis no detalhe. A documentação limita o início da consulta aos últimos sete dias. O painel oferece sete datas UTC, incluindo hoje, e usa cache de até 60 segundos para histórico. A falta de uma data de fim em analytics não prova que uma chamada esteja ativa; a fonte atual é consultada separadamente.

O painel não cria um arquivo permanente nem promete recuperar sessões anteriores à janela suportada. Um arquivo futuro exigiria persistência e uma política de retenção explícita. Os [webhooks LiveKit](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/) têm retries, mas não garantem entrega; não foram configurados nesta implementação. Falta de plano, configuração, limite de consultas e indisponibilidade aparecem como erros explícitos, sem fingir uma lista vazia.

## Validação

Os testes de modelo/API usam respostas simuladas, incluindo formatos reais dos contratos documentados. Cobrem identidades, reconexões, intervalos sobrepostos, dados ausentes, estados, autorização, revogação com cache, metadata forjada, seleção de campos, avatares, consultas inválidas e erros sem segredos. A validação de interface usa contas e dados fictícios; não constitui prova de uma chamada real.

O relatório de entrega descreve os comandos e resultados finais, assim como os limites de verificação. As consultas aos dados Supabase/LiveKit foram de leitura. A única alteração remota posterior foi a criação da chave LiveKit dedicada que o utilizador autorizou explicitamente. Não foi feita publicação, mudança de plano, migração ou commit.

### Validação inicial — 28 de outubro de 2026

- **53 testes relevantes passaram:** 10 de modelo, 18 de API, 3 de navegador do painel, 14 de isolamento de contas, 2 de âmbito de marketing/Clarity e 6 do admin existente de Founding Creators.
- TypeScript do projeto e ESLint nos ficheiros TypeScript/React desta funcionalidade passaram.
- `npx next build` passou, incluindo geração das páginas e da rota dinâmica da API. Foi chamado diretamente para evitar executar os scripts preexistentes de sincronização de assets alheios a esta alteração.
- Os três testes do painel foram repetidos contra o servidor da **versão compilada**, com Chrome real e dados simulados: acesso sem sessão, perfis/detalhe, histórico, cálculo de utilização, paginação, layout a 390 px, texto malicioso apresentado como texto, 403 sem JSON, renovação de token com resposta antiga, saída da conta durante pedido e atualização automática sem sobreposição/oculta/em pausa.
- A API real local sem Bearer token respondeu **401**, com resposta privada e `no-store`. O HTML tem `noindex` e não monta Clarity. A inspeção dos ficheiros JavaScript públicos compilados não encontrou referências às credenciais privilegiadas ou à administração LiveKit/Supabase.
- O servidor compilado ficou acessível em **http://127.0.0.1:3217/admin/voice**, nesta máquina e enquanto o processo estiver em execução. Nesta fase inicial ainda faltavam as credenciais privadas; a ativação real está registada abaixo.

Na primeira entrega, ainda não tinham sido validados os pedidos LiveKit com credenciais reais; os primeiros screenshots continham apenas dados fictícios. A consulta real foi concluída posteriormente, conforme a secção de ativação. A publicação Vercel continua por fazer e exige autorização própria.

### Correção da configuração local após a primeira abertura

O primeiro erro «A consulta de voz ainda não está configurada no servidor» ocorria antes da autorização: faltava ao processo Next.js a chave pública de Supabase que o cliente do navegador já utilizava. A URL e a chave pública existentes foram acrescentadas ao `.env.local` ignorado pelo Git, preservando a configuração anterior e guardando uma cópia prévia.

Após reiniciar e repetir o pedido na sessão real do navegador, a autenticação e o controlo global de administrador passaram. Nessa fase ainda faltavam as credenciais privadas. O servidor passou a apresentar um estado explícito de «administrador confirmado / configuração privada incompleta», apenas depois da autorização. Foi acrescentado um teste para este comportamento, passando a API a ter **19 testes**. TypeScript, ESLint e a compilação Next.js voltaram a passar.

A LiveKit Cloud abriu no início de sessão e o utilizador completou a autenticação. A conclusão dessa configuração está documentada a seguir.

### Ativação com dados reais concluída

O utilizador autorizou explicitamente criar a chave persistente `ALTARA_ADMIN_ANALYTICS_LOCAL`. Foi criada no projeto LiveKit ALTARA e guardada diretamente no `.env.local` do site, apenas para o servidor local. As chaves de chamadas já existentes não foram revogadas ou substituídas. A credencial Supabase `service_role` existente foi obtida por uma consulta de leitura através da CLI já autenticada, validada como pertencente ao projeto ALTARA e guardada no mesmo ficheiro privado. Não foi criada uma nova chave Supabase.

Todos os sete parâmetros necessários estão presentes. O `.env.local` e a cópia de segurança que contém uma credencial privada estão ignorados pelo Git. Os valores não foram guardados nos relatórios ou outputs. Uma pesquisa pelos valores reais das três credenciais privilegiadas nos ficheiros compilados públicos encontrou **zero ocorrências**.

Verificações reais executadas em 28 de outubro de 2026, por volta das 15:21–15:24 UTC:

- RoomService respondeu e devolveu **uma sala aberta com uma ligação** na fotografia consultada. O painel identificou o perfil **Teko** e resolveu os nomes do servidor e canal.
- A API de Analytics respondeu **HTTP 200** na listagem e no detalhe. O intervalo UTC de 22 a 28 de outubro devolveu **seis sessões históricas**.
- A consulta Supabase resolveu os dois perfis pedidos, e a sessão histórica aberta no painel mostrou **aarao18 e Teko**, com ambos os avatares carregados.
- «Calcular utilização desta página» terminou com **5123,5 minutos de ligação de contas** e **5130 minutos faturáveis LiveKit**, para essa página e fotografia. O gráfico passou a minutos por dia de início. Estes são valores históricos observados, não contadores permanentes nem uma previsão de custos.
- A validação atravessou o fluxo real do navegador: sessão ALTARA → autorização administrativa no servidor → LiveKit/Supabase → apresentação de dados. Não foram iniciadas, terminadas ou modificadas chamadas para este teste.

Foram guardadas capturas locais do estado atual e do histórico com dados reais. Não existe publicação Vercel deste painel. O link no admin local para o domínio oficial só estará operacional depois dessa publicação autorizada; entretanto usar o endereço local acima. A chave dedicada é uma credencial da API do projeto; o código do painel usa apenas métodos de consulta, não ações de moderação ou alteração de salas.

Durante a verificação real observaram-se falhas transitórias de transporte. As consultas GET/HEAD repetem uma única vez quando não recebem resposta; POSTs, cancelamentos e respostas HTTP de autorização não são repetidos. A RoomService usa a recuperação regional limitada do SDK oficial. Se a leitura de participantes continuar a falhar, a sala mantém a contagem de ligações que a LiveKit reportou, enquanto contas únicas e tempos ficam indisponíveis. O painel mantém o aviso de consulta parcial ou de dados antigos, sem transformar falhas em zeros. O teste adicional desta recuperação passou, totalizando **20 testes da API e 10 do modelo** na última execução; TypeScript e ESLint também passaram. O servidor local final usa o Node 24 LTS já disponível nesta máquina.

### Alterações e preservação

Em `A:\ALTARA\altara-site`: novas páginas `app/admin`, API `app/api/admin/voice/route.ts`, módulo privado `app/lib/server/voice-analytics.ts`, modelo `app/lib/voice-analytics-model.ts`, três ficheiros de testes e este guia. Foi acrescentado apenas o SDK oficial `livekit-server-sdk` fixado em **2.19.2**, com lockfile atualizado, preservando as restantes dependências e alterações existentes.

Em `A:\ALTARA\ALTARA`: apenas o link de navegação no admin local em `internal/founding-creators-admin/app.js`. A implementação de chamadas e emissão de tokens não foi alterada. Cópias prévias dos manifests do site e do ficheiro do admin foram guardadas em `work/voice-analytics-before` nos respetivos repositórios. Não foi feito reset, stash ou descarte do trabalho existente.

# Integração pública Founding Creators — 17 setembro 2026

Estado: integração concluída e validada em preview Vercel. Produção não alterada. Sem novo commit ou push.

## Repositório e alojamento confirmados

- Checkout autoritativo: `C:\ALTARA\altara-site`.
- Remoto: `https://github.com/PinticeBTW/altara-site.git`, branch `main`.
- Base: `e97b7188577441fff94412985648a5415fdc8f35`. O checkout limpo foi atualizado por fast-forward de duas revisões já existentes no remoto; não foi criado nenhum commit.
- Vercel: `pintices-projects/altara-site`, projeto `prj_MlayIs9oatpMVXWDfOcdRl8GV3mH`, equipa `team_SV1zhi8NYF1Uyp8i9JVy66bT`.
- A inspeção autenticada do domínio confirmou `altaraapp.com` e `www.altaraapp.com` no deployment de produção `dpl_Gvs8v6mCbNZqDJQ6rJ7cDQ8Fu5nE`. Continua a ser o deployment de produção após os testes.
- Os hashes dos scripts públicos de registo/login coincidiram com `sourceSha256` do manifest preparado, antes da integração e novamente no final.

## Ficheiros desta alteração

| Ficheiro no checkout | Alteração |
| --- | --- |
| `public/app/register.js` | Captura referral, inclui `founding_creator_code` no signup e limpa apenas após criação bem-sucedida. |
| `public/app/login.js` | Captura referral e limpa o estado pendente após login/confirmação bem-sucedidos. |
| `public/app/lib/foundingCreatorReferral.js` | Helper preparado, copiado sem alterações. |
| `tests/founding-creators-public-registration.test.mjs` | Sete regressões com Chromium e respostas Auth simuladas; executa os assets reais deste site. |
| `tests/login-bootstrap-regression.test.mjs` | Inclui a nova dependência no contexto isolado e verifica a limpeza após login. |
| `docs/founding-creators-public-integration-2026-09-17.md` | Este relatório e instruções de publicação. |

Os três assets de runtime são cópias exatas de `C:\ALTARA\ALTARA\public-registration\app\...`, verificadas pelo manifest. Não foram alterados HTML, CSS, configuração de rotas, schema, triggers ou funções do backend. O design, idiomas, recuperação de conta e restantes fluxos existentes são preservados.

## Preview final

- URL: https://altara-site-fydgcq4ft-pintices-projects.vercel.app
- Deployment: `dpl_5tft9ABsVougjVXxFMNNX8QAEGzP`.
- Ambiente: preview; estado: READY; framework: Next.js 16.3.1; build remoto concluído em 19 segundos.
- Acesso protegido por autenticação Vercel. Não foi desativada a proteção nem alterado qualquer domínio.
- O pacote foi preparado fora do checkout, em `work/site-preview` desta tarefa Codex, a partir dos ficheiros Git canónicos e dos três assets preparados. Todos os ficheiros de runtime já existentes coincidem byte a byte com a base Git, exceto `register.js` e `login.js`; o único asset novo é o helper.
- Para deployment pela CLI, o pacote inclui uma `.vercelignore` de preview que conserva `public/app/node_modules/**` e exclui logs, referências e testes. A CLI exclui normalmente as dependências estáticas vendorizadas; sem essa inclusão, o primeiro preview não carregava completamente o destino após login. O pacote final corrige essa omissão sem mudar código Voice ou dependências.
- Foram comparados os bytes servidos dos três assets, das quatro entradas HTML de autenticação, do SFX e do bundle LiveKit existente. Todos coincidem com o pacote final.

## Testes

| Verificação | Resultado |
| --- | --- |
| Build local do site | PASS; prebuild alterou zero ficheiros HTML. |
| Build do preview final Vercel | PASS. |
| Suite completa do site no pacote com bytes canónicos Git | 124/124 PASS, incluindo os sete novos testes do referral. |
| Suites de origem client + public-registration | 14/14 PASS. |
| PostgreSQL descartável local | 13/13 PASS; cluster terminado pelo runner. |
| ESLint dos dois ficheiros de testes alterados | PASS. |
| `git diff --check` | PASS. |

Cobertura: navegação registo/login, recarregamento, normalização, primeira origem válida durante sete dias, storage bloqueado, códigos ausentes/malformados/desconhecidos/pausados, falhas e email duplicado, confirmação, imutabilidade e idempotência no backend. Os testes browser simulam respostas Auth; a elegibilidade de códigos é exercitada em PostgreSQL local. Não foram criadas contas hosted adicionais para testar códigos inválidos ou pausados.

Nota Windows: `core.autocrlf=true` produz uma falha preexistente no teste que compara o hash bruto de `public/app/lib/altaraSfx.js` com o manifest de release. A suite final acima correu sobre bytes canónicos Git, iguais aos publicados no preview final. O ficheiro SFX no checkout foi devolvido exatamente aos bytes iniciais; não há alteração desse ficheiro nesta entrega. Não se deve confundir esta diferença de fins de linha com regressão do referral.

Para executar os testes browser, definir `ALTARA_FOUNDING_PLAYWRIGHT` como o caminho absoluto de um pacote Playwright instalado. Foi utilizado `C:\Users\tomas\AppData\Local\npm-cache\_npx\e41f203b7505f1fb\node_modules\playwright`, com Chrome instalado. Os testes não precisam de credenciais hosted.

## E2E hosted observado

- Backend: `tbbgwjmmaiclkhssimhf`.
- Email autorizado: `tomasnunes999+fcsite0917@gmail.com`; username: `fcsite0917`.
- Conta: `e16903b3-111b-46a2-afec-5abf60c108f8`.
- Creator de teste: `a915bd1c-48f3-490e-9d6a-8f31618e084a`; código: `FC_SITE_0917`.
- Signup: `2026-09-17 12:27:56.075714 UTC`.
- Confirmação real por email: `2026-09-17 12:28:34.520404 UTC`.

O percurso iniciou em `/register.html?creator_ref=FC_SITE_0917`, navegou para login e voltou a `/app/register.html`, sendo depois recarregado sem código no URL. O formulário real criou a conta no Supabase e uma única atribuição ao creator correto. O utilizador abriu o email real; a confirmação foi verificada diretamente no backend.

O signup e o primeiro login ocorreram no preview inicial `https://altara-site-nlyw2hrlc-pintices-projects.vercel.app`. O segundo login e o ciclo logout/login ocorreram no preview final, com origem e armazenamento de sessão separados. Os três assets de referral eram idênticos nos dois previews. Foram usados também `FC_OTHER_0917` e `FC_PUBLIC_0917` nos links de login: a atribuição permaneceu `FC_SITE_0917`, sem duplicação. A aplicação final mostrou `fcsite0917` e os widgets após login e relogin; não foram observados erros de consola nessa página.

A confirmação foi comprovada pelo email aberto pelo utilizador e pelo timestamp Auth. A navegação do callback no browser do email não foi inspecionada diretamente. A limpeza do callback passou separadamente na regressão browser. Não foi concedido acesso administrativo à conta de teste; a atribuição foi verificada diretamente na tabela privada do backend, sem abrir uma dashboard administrativa.

Resultado final: exatamente uma atribuição, creator e código corretos, preservados após confirmação e múltiplos logins. Creator de teste colocado em `paused`, `nova_months=0`, zero sessões Auth restantes. A conta e a atribuição ficam como evidência; a palavra-passe temporária foi descartada.

## Controlo de escopo

BR global rollout continua `enabled=false`, revisão 1. Campanhas acquisition e early_adopter continuam `enabled=false`, `approved=false`. Não foram ativados referrals/rewards públicos, Nova automática, BRL billing ou campanhas. Não houve alterações de schema, funções, billing ou código Server Voice. As únicas escritas hosted desta tarefa foram os dados necessários ao teste de signup/sessão e o creator interno de teste, posteriormente pausado.

## Exatamente o que falta para produção

1. Aprovação explícita do utilizador para a publicação de produção; commit e push também continuam por aprovar.
2. Após aprovação, confirmar novamente a base do remoto e o deployment atual. Se se mantiverem, publicar o pacote validado no mesmo projeto Vercel, ou integrar apenas estes ficheiros pelo fluxo Git aprovado. Para CLI, preservar os bytes Git e as dependências estáticas do pacote final; não publicar a pasta `public-registration` como site autónomo.
3. Comparar em `altaraapp.com`/`www.altaraapp.com` os três hashes aprovados e as quatro entradas de autenticação.
4. Fazer um signup novo no domínio público com um creator de teste ativo, confirmar o email, login/logout e a única atribuição hosted; pausar o creator e encerrar as sessões depois.

Não há mudança adicional de backend necessária para esta integração. A validação E2E no domínio de produção depende da publicação aprovada e ainda não foi executada.

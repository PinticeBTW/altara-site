# ALTARA Founding Creators — LIVE / READY

17 setembro 2026. **Fluxo público de referral e confirmação WEB validado em produção: PASS.** Este relatório substitui o estado NOT READY da publicação anterior.

## Causa raiz

O site enviava `options.emailRedirectTo`, mas a configuração Auth hospedada tinha:

- `site_url = altara://auth/recovery`.
- `uri_allow_list = altara://auth/recovery,http://localhost:5500,http://127.0.0.1:5500`.

Não existia qualquer callback de `altaraapp.com` na lista permitida. O URL HTTPS pedido pelo signup não era aceite, e o email era construído com o fallback global de recovery desktop. O template de confirmação estava correto: tanto o botão como o link alternativo usavam `{{ .ConfirmationURL }}`, sem destino desktop hardcoded.

O site tinha ainda um problema no destino escolhido: voltava à página de registo, que não contém o consumidor de confirmação. Esse consumidor já existe em `login.js`. No teste intermédio, usar o alias raiz `/login.html` confirmou a conta mas levou depois a `/index.html`, que devolveu 404. O callback final foi fixado em `/app/login.html`, cujo destino autenticado é `/app/index.html`.

## Alteração final

**Site:** em `C:\ALTARA\altara-site\public\app\register.js`, `resolveSignupEmailRedirectUrl()` devolve agora `new URL("/app/login.html", origin).href` para o browser. O ramo `window.altaraDesktop.isDesktopApp` continua a devolver `altara://auth/confirm`. O signup continua a passar esse destino em `options.emailRedirectTo`.

**Supabase:** foi alterado exclusivamente `uri_allow_list`, preservando as três entradas existentes e acrescentando:

1. `https://altaraapp.com/app/login.html`
2. `https://www.altaraapp.com/app/login.html`
3. `altara://auth/confirm`

Não há wildcards. As duas entradas para `/login.html` adicionadas na tentativa intermédia foram removidas; não fazem parte da configuração final.

O Site URL global foi deliberadamente preservado para não alterar o fallback de clientes desktop existentes. Os templates de signup e recovery permaneceram idênticos. A releitura da configuração confirmou que todos os outros campos Auth mantiveram os seus valores. Não foi utilizado `supabase config push` sobre o ficheiro local, cujos valores são de desenvolvimento.

## Compatibilidade Electron

Nenhum ficheiro da app autoritativa foi alterado. Os hashes de `register.js`, `login.js`, `electron/main.js`, `electron/preload.js` e `electron/trust-boundary.js` mantiveram-se.

- Signup desktop continua a pedir `altara://auth/confirm`, agora explicitamente permitido.
- Recovery desktop continua a pedir `altara://auth/recovery`, com a permissão e o fallback anteriores preservados.
- Os handlers Electron distinguem os dois percursos. Os testes locais confirmaram que um link de signup não é tratado como recovery.
- 11/11 testes existentes de segurança/IPC/deep-links do Electron passaram.

Não foi executado um signup ou reset de palavra-passe real na app Electron instalada. A compatibilidade foi verificada através dos contratos existentes, dos testes e da preservação dos ficheiros/configuração usados pelo desktop.

## Testes e publicação

| Verificação | Resultado |
| --- | --- |
| Suite completa do site sobre o pacote final com bytes canónicos | 126/126 PASS |
| Callback web em apex e www, a partir dos dois caminhos de registo | PASS; sempre `/app/login.html` |
| Callback com tokens, limpeza do URL e chegada a `/app/index.html` | PASS local e produção |
| Destino arbitrário em query ignorado | PASS |
| Signup com bridge desktop | PASS; preserva `altara://auth/confirm` |
| Contratos de normalização signup/recovery Electron | PASS |
| Suite existente de segurança/deep-links Electron | 11/11 PASS |
| Build remoto do preview final | PASS |
| Script servido no preview final | SHA-256 igual ao pacote |
| Assets públicos em apex e www | 18/18 HTTP 200 + hashes corretos |
| Browser no fluxo final | Nenhum erro de consola observado |
| Logs Vercel `error` do deployment final | Nenhuma entrada devolvida |
| `git diff --check` | PASS |

O único asset de runtime que difere da integração publicada anteriormente é `public/app/register.js`, SHA-256 `a694ce051a0a9659f94f8453ede90757dc6a941b51b5739c558bab49120ce0dc`. Foram atualizadas as regressões em `tests/founding-creators-public-registration.test.mjs`.

- Produção: https://altaraapp.com / https://www.altaraapp.com.
- Deployment final: `dpl_Fmsi3mecXZREVR9dpg4dz2HSvAUo`, `READY`.
- URL imutável: https://altara-site-qfl9u3hmg-pintices-projects.vercel.app.
- Preview final: https://altara-site-fvphf7l6j-pintices-projects.vercel.app, `dpl_2NZJsGT5pWnBtsKgVf9DAUKFLRS4`.
- Projeto: `pintices-projects/altara-site`, `prj_MlayIs9oatpMVXWDfOcdRl8GV3mH`.
- **Deploy efetuado. Sem commit ou push.** As alterações do site continuam no checkout local, sobre `e97b7188577441fff94412985648a5415fdc8f35`.

## E2E real final

Entrada: `https://altaraapp.com/register.html?creator_ref=FC_WEBFIX_0917`.

| Campo | Valor |
| --- | --- |
| Username | `fcwebpass0917` |
| Email | `pintice38+fcwebpass0917@gmail.com` |
| Conta | `0ec1fedb-3b16-4086-9887-33f45bfd97be` |
| Creator | `7d0bf961-ff24-48eb-b1bd-1d39306d1360` |
| Referral | `FC_WEBFIX_0917` |
| Signup UTC | `2026-09-17 13:10:03.206124` |
| Confirmação real de email UTC | `2026-09-17 13:10:38.219331` |
| Attribution UTC, imutável em todos os checkpoints | `2026-09-17 13:10:03.202942` |

O link original recebido por email, sem alterar parâmetros, continha `redirect_to=https://www.altaraapp.com/app/login.html`. Ao abri-lo, a conta foi confirmada e a interface entrou automaticamente em `/app/index.html`, apresentando o username correto e os widgets.

Depois foi executado um segundo login pelo formulário público, usando no URL um referral diferente (`FC_PROD_0917`). O backend confirmou duas sessões Auth distintas e exatamente uma attribution, ainda para `FC_WEBFIX_0917`.

| Sessão | ID |
| --- | --- |
| Confirmação/login automático | `36c09f07-86fd-4fa6-a047-2fc08c91d35a` |
| Segundo login | `767e63dd-e765-4592-9728-4f989e8a62df` |
| Login após logout pela interface | `b88e7a03-7af2-49ae-ba21-dd9658bb964e` |

O logout pela interface removeu a sessão corrente e regressou a `/app/login.html`; o novo login voltou à aplicação. O creator, o código e o timestamp da attribution permaneceram iguais, com contagem **1 por conta** em todos os checkpoints.

As sessões foram criadas através de logins distintos no mesmo browser, em tabs do mesmo perfil; não foi realizado um teste entre dois dispositivos independentes. A distinção das sessões foi comprovada diretamente em `auth.sessions`.

## Limpeza, limites e flags

- Creator `FC_WEBFIX_0917` pausado, `nova_months=0`.
- Conta final e conta da tentativa intermédia: zero sessões e zero refresh tokens.
- Nenhum acesso admin temporário foi concedido; contagem final zero.
- Tabs fechadas, palavras-passe temporárias descartadas e ficheiro temporário do link de confirmação removido.
- As duas contas de teste ficam como evidência. Cada uma tem uma única attribution; são dois signups diferentes, não duplicação da conta final.
- Sessões e refresh tokens foram revogados. Como no comportamento normal do Supabase, um JWT já emitido mantém validade criptográfica até expirar.
- BR global rollout: `enabled=false`, revisão 1.
- Campanhas acquisition e early_adopter: `enabled=false`, `approved=false`.
- Rewards, Nova automática, BRL billing e campanhas não foram ativados. Nenhuma migração, função ou feature flag foi modificada.

**Estado final: Founding Creators public referral flow LIVE / READY, com E2E real de produção PASS.** A falha de callback descrita no relatório anterior está resolvida para novos signups. Links já enviados anteriormente conservam os seus parâmetros originais.

## Evidências e referências

- `callback-e2e-evidence.json`: checkpoints no backend e limpeza.
- `callback-final-assets.json`: os 18 checks públicos.
- `callback-auth-change.json`: configuração relevante antes/depois, sem segredos.
- `callback-deployment.json`: identificação da versão final.
- `callback-scope.json`: único asset alterado e hashes desktop preservados.
- `callback-final-tests.log`: execução 126/126.

Semântica de redirects e allowlist: [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls). Limites da revogação de JWT: [Supabase Sign out](https://supabase.com/docs/guides/auth/signout).

# Notificações de menções dos bots

## Seleção de membros no chat do servidor

No compositor normal dos canais do servidor, escrever `@` abre uma lista de
membros desse canal. Nos canais públicos inclui também os bots com acesso
aprovado ao canal. O nome ou username filtra a lista;
setas percorrem os resultados, Enter ou Tab escolhe o membro e Escape fecha a
lista. O primeiro Enter escolhe; o envio continua pela ação normal do chat.

A escolha mostra `@nome` no rascunho, mas guarda a identidade e envia `<@UUID>`.
Editar o nome escolhido desfaz essa associação. `@nome` escrito sem uma escolha
continua a ser texto, sem procurar destinatários por nomes ambíguos. As ações
“Mencionar” dos perfis e participantes usam também a identidade, não o nome.

Os rascunhos guardam a forma canónica por conta e conversa. Revisões do elenco
não apagam uma escolha; navegação e sessões invalidam pedidos antigos. Uma
consulta que atualiza a revisão da autoridade pode repetir uma vez sob a revisão
atual, descartando sempre os resultados antigos. Em canais privados a lista usa
apenas a consulta dos membros com acesso, sem fallback para todo o servidor.

Mensagens humanas persistidas passam a apresentar e notificar tokens visíveis de
menção pelo percurso existente das mensagens do servidor. Som, acesso ao canal,
Mute, Focus, DND e preferências continuam a ser revalidados; mensagens próprias,
histórico e edições não geram novos avisos. A lista descrita aqui está nos canais
do servidor; o contrato explícito dos bots continua na secção seguinte.

Os testes `composer-mentions.test.mjs` e
`composer-mention-authority-integration.test.mjs` cobrem seleção, texto seguro,
teclado, IME, identidade do rascunho, formatação e resultados assíncronos antigos.
Os testes de notificações e de rendering cobrem também os emissores humanos.

## Contrato de notificações enviadas por bots

Esta capacidade foi ativada no backend publicado, com autorização explícita do
operador, em 2026-10-02. Foram verificados o catálogo, a autenticação e os acessos
do pacote; o envio e a notificação de menções através do chat real autenticado não
foram testados hoje. A nova permissão continua a exigir aprovação da instalação.
O [registo da ativação](ALTARA_BOTS_PLATFORM_V2.md#hosted-activation-2026-10-02)
identifica as migrações, funções e limites da verificação.

## Consentimento da instalação e intenção de cada mensagem

Uma mensagem de bot não deduz notificações de `@nome`, `@everyone`, `@here` ou do
autor de uma resposta. Para solicitar uma notificação, a instalação precisa da
permissão **Mention Members** (`bot:mention_members`) e a mensagem deve indicar
explicitamente os destinatários:

```json
{
  "content": "Olá <@00000000-0000-4000-8000-000000000001>!",
  "allowed_mentions": {
    "users": ["00000000-0000-4000-8000-000000000001"]
  }
}
```

O contrato admite apenas `users`, com no máximo dez UUIDs únicos. Omitir
`allowed_mentions`, enviar `{}` ou enviar `{"users":[]}` significa zero
notificações de menção e não exige a nova permissão. `parse`, `roles`, `everyone`,
`here`, `replied_user`, valores nulos, tipos inválidos e IDs repetidos são
rejeitados. A edição de uma mensagem não cria novas notificações.

No endpoint de envio o campo pertence ao topo do pedido. Nas respostas a uma
interação pode estar no topo ou dentro de `data`; enviar ambos é inválido. Texto,
cartões, uploads e controlos continuam a poder coexistir com a opção.

## Destinatários efetivos

A base de dados reconstrói `metadata.notification_mentions.users` na transação
do INSERT original. Só inclui a interseção entre os IDs explícitos e os tokens
visíveis `<@UUID>` / `<@!UUID>` no texto ou nos campos textuais dos cartões. Código
entre backticks, blocos de código, URLs, destinos de links e tokens escapados
nunca autorizam uma notificação. Os campos URL, imagens e controlos não são
fontes de menções. Cartões suprimidos também não autorizam pings. O scanner é
conservador perante Markdown incompleto.

Cada destinatário tem de continuar a ser membro do servidor, ter acesso atual ao
canal e não estar banido globalmente nem nesse servidor. IDs de utilizadores que
não satisfazem estas condições são excluídos. A lista de IDs não concede acesso
ao canal, não modifica as preferências de notificações do utilizador e não
autoriza menções a toda a comunidade.

Metadados `notification_mentions` enviados pelo bot nunca são confiáveis: o
guard substitui-os. O campo de pedido `allowed_mentions` é removido antes de
persistir a mensagem. Caminhos antigos, callbacks e webhooks sem opção explícita
também produzem uma lista vazia. A resposta do RPC já contém a lista aprovada;
não existe um UPDATE posterior que exponha notificações antes da validação.

Um pedido com destinatários explícitos falha com `mentions_not_available` se o
backend não tiver o novo RPC. Não existe fallback que descarte a opção e finja
sucesso. As notificações de mensagens normais e a contagem de mensagens por ler
continuam sujeitas às preferências do utilizador.

## Validação e limites

`tests/bot-mentions.test.mjs` executa os endpoints reais num fixture isolado e
verifica payloads, autenticação, limites, rejeição de opções amplas e ausência de
fallback. `tests/bot-mentions-db.test.mjs` executa a migração num PostgreSQL local
e verifica permissões, tokens, acesso atual, INSERT atómico de respostas com
uploads/cartões/controlos e concorrência com revogação da instalação, saída do
servidor e respostas à mesma interação.

O cliente apresenta tokens aprovados como menções com abertura do perfil e
destaca a linha quando os metadados autorizados incluem a conta atual. Menções
diretas de bots podem tocar som mesmo no canal aberto, sem aumentar o contador
desse canal. Mute, notificações desativadas, Focus e DND continuam a aplicar-se.
O consumidor global recebe INSERTs de `bot_channel_messages` no mesmo canal
privado do utilizador que já recebe mensagens normais. O arranque, a reconexão
e a remoção ao mudar de conta seguem o ciclo existente das DMs; não dependem
do tópico legacy `global-bot-channel-messages`, que pode estar recusado pelo
backend. Não é criada uma subscrição adicional nem alargada uma permissão.

O consumidor deduplica INSERTs e revalida dono, canal, geração de autenticação
e acesso depois de resolver o contexto. O áudio pendente revalida autenticação,
acesso e preferências antes de tocar, incluindo uma mudança de “todas” para
“só menções”. Histórico e UPDATEs nunca criam novos avisos. Este percurso não
faz catch-up de notificações dos bots perdidas enquanto o cliente esteve desligado.

`tests/bot-mention-rendering.test.mjs` verifica o renderer real e o escape de
nomes, código e URLs. `tests/bot-mention-notifications.test.mjs` cobre o caminho
arranque real da subscrição partilhada até ao contador e à conclusão do áudio,
incluindo replays, troca de conta, suspensão da autenticação, substituição do
canal, revogação de acesso e falhas de carregamento. Estes testes locais não substituem
a confirmação de som físico no chat real.

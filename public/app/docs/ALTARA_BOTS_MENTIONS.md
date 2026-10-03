# Notificações de menções dos bots

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
O consumidor global deduplica INSERTs e revalida conta e acesso antes do áudio;
histórico e UPDATEs nunca criam novos avisos.

`tests/bot-mention-rendering.test.mjs` verifica o renderer real e o escape de
nomes, código e URLs. `tests/bot-mention-notifications.test.mjs` cobre o caminho
global INSERT até ao contador e à conclusão do áudio, incluindo replays,
revogação de acesso e falhas de carregamento. Estes testes locais não substituem
a confirmação de som físico no chat real.

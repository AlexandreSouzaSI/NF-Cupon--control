# Arquitetura multiempresa (SaaS) — proposta

Status: proposta, aguardando decisão. Nada disso foi implementado ainda.

## Objetivo

Hoje o sistema atende só a Nugalho: uma `Store` (loja) já representa uma empresa
com CNPJ próprio (Anchieta, Contagem, Eldorado), e um usuário pode ter acesso a
várias delas via `UserStore`. Mas não existe nenhum conceito de "cliente da
SaaS" — todo mundo (Nugalho e qualquer empresa futura) cairia nas mesmas
tabelas `User`/`Store`, sem fronteira nenhuma entre eles. Pra vender esse
sistema pra outras empresas com segurança, falta uma camada de isolamento por
cliente.

## Vocabulário

- **Empresa** = o que já existe como `Store`. Continua exatamente igual: CNPJ,
  endereço fiscal, certificado digital, série de NF-e própria etc. Não muda
  nada na Store em si.
- **Grupo** (novo) = o cliente que contrata o sistema. Pode ter uma ou várias
  empresas dentro (ex: "Grupo Nugalho" com Anchieta + Contagem + Eldorado).  É
  a fronteira de isolamento: um grupo nunca vê dado de outro grupo.
- Decisão já tomada com você: **1 grupo = 1 cliente pagante**, e **cada
  usuário pertence a exatamente 1 grupo** (sem acesso cruzado entre grupos por
  enquanto — nem você, nem um futuro contador terceirizado, precisaria disso
  hoje). Se um dia precisar (ex: um contador atendendo vários grupos), dá pra
  adicionar depois sem redesenhar tudo — é só permitir múltiplas linhas de
  vínculo usuário↔grupo em vez de uma FK direta.

## Modelo de dados novo

```prisma
model CompanyGroup {
  id        String   @id @default(uuid())
  name      String
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  stores Store[]
  users  User[]
}
```

E duas FKs novas, obrigatórias:

```prisma
model Store {
  // ...campos que já existem, sem mudança...
  groupId String
  group   CompanyGroup @relation(fields: [groupId], references: [id])
}

model User {
  // ...campos que já existem, sem mudança...
  groupId String
  group   CompanyGroup @relation(fields: [groupId], references: [id])
}
```

Tudo o que já pendura de `Store` (Purchase, Bill, IncomingGoodsNf, LossNfe,
etc. — são ~20 tabelas) **não muda**. Elas continuam referenciando `storeId`
como hoje; o isolamento por grupo é garantido indiretamente, porque toda Store
já pertence a um grupo.

`User.email` continua único globalmente (não fica `@@unique([groupId,
email])`). Motivo: o login hoje é só e-mail+senha, sem tela de "escolher
empresa antes"; manter único global evita ter que descobrir o grupo antes de
autenticar. Efeito colateral aceitável: dois clientes diferentes não podem
usar o mesmo e-mail de login — na prática isso raramente é um problema (é até
uma proteção a mais contra confusão de conta).

## Isolamento de dados: banco único, sem separar por cliente

Duas formas possíveis de isolar dado por cliente numa SaaS:

1. **Banco/schema separado por cliente** — isolamento mais forte, mas cada
   cliente novo vira uma migração/deploy a mais pra manter, e a maioria das
   queries hoje (que já filtram por `storeId`) teria que mudar de conexão
   dependendo do cliente. Caro de operar sozinho.
2. **Banco único, isolamento lógico por `groupId`** (recomendado) — todo
   cliente convive no mesmo banco, cada linha sabe a qual grupo pertence (via
   `Store.groupId`/`User.groupId`), e o próprio backend garante que ninguém
   nunca lê/escreve fora do seu grupo. É o padrão mais comum pra SaaS B2B de
   porte pequeno/médio, muito mais barato de manter com um time pequeno, e dá
   pra migrar pra separação física depois se um cliente grande exigir isso
   (raro).

## Como a fronteira de segurança é aplicada

1. **JWT ganha `groupId`** — hoje o token carrega `userId`/`role`; passa a
   carregar `groupId` também, direto no login, sem precisar consultar o banco
   de novo a cada request.
2. **`ensureStoreAccess` (já existe, centralizado em cada service) passa a
   checar duas coisas em vez de uma**: (a) o que já faz hoje — o usuário tem
   `UserStore` pra aquela loja — e (b) **novo**: a `Store` pertence ao mesmo
   `groupId` do usuário logado. O item (b) é redundante na prática (um
   `UserStore` nunca deveria apontar pra fora do grupo), mas funciona como
   rede de segurança contra bug de cadastro — se algum dia um `UserStore`
   for criado errado apontando pra loja de outro cliente, essa checagem
   bloqueia mesmo assim.
3. Como esse ponto já é centralizado (mesma função usada pelos ~20 services),
   a mudança é pequena e concentrada — não precisa reescrever cada query.

## Frontend

O seletor de "loja ativa" no topo (que já existe) não muda de comportamento:
continua listando só as lojas que o usuário tem acesso via `UserStore` — e
como usuário só existe dentro de 1 grupo, essas lojas já são automaticamente
só as do grupo dele. **Não precisa de um seletor de "grupo" agora.** Só
seria necessário se um dia alguém (tipo você, como dono do SaaS) precisasse
navegar entre grupos de clientes diferentes — nesse caso a resposta certa é
um painel de administração separado (fora do fluxo normal do app), não um
segundo seletor misturado com o de loja.

## Migração dos dados existentes (Nugalho)

1. Criar 1 `CompanyGroup` chamado "Nugalho".
2. Preencher `groupId` = esse grupo em todas as `Store` e `User` que já
   existem.
3. Tornar as colunas `groupId` `NOT NULL` depois do backfill.

Sem perda de dado, sem downtime de lógica — é só popular uma coluna nova.

## Onboarding de um cliente novo (o que "vender" vira na prática)

1. Criar um `CompanyGroup` novo.
2. Criar o primeiro usuário (perfil Proprietário) vinculado a esse grupo.
3. Cadastrar a(s) empresa(s)/loja(s) dele dentro do grupo — endereço fiscal,
   certificado digital etc., exatamente como já é feito hoje em Cadastros →
   Lojas.
4. Pronto — o cliente novo já usa o sistema inteiro sem nenhum contato com os
   dados da Nugalho ou de qualquer outro cliente.

Isso hoje é manual (alguém com acesso ao banco faz o passo 1). Dá pra
automatizar depois com uma tela de "cadastro de cliente novo" restrita a você
— não é bloqueante pra validar a arquitetura.

## Fases sugeridas de implementação (quando decidir seguir)

- **Fase 1** — schema: `CompanyGroup` + FKs em `Store`/`User` + migração +
  backfill dos dados da Nugalho.
- **Fase 2** — auth: `groupId` no JWT + checagem de fronteira em
  `ensureStoreAccess`.
- **Fase 3** — Cadastros: garantir que criar usuário/loja novos sempre herda
  o `groupId` de quem está criando (não deixar escolher).
- **Fase 4** — faturamento: `Store.monthlyFee` + `StoreBillingPayment` +
  regra de bloqueio por inadimplência dentro do `ensureStoreAccess` + painel
  `/admin/faturamento` restrito a `isAdminMaster`.
- **Fase 5** (futuro, fora do escopo imediato) — painel de administração do
  SaaS mais completo: cadastro guiado de cliente novo (Fase Onboarding acima
  automatizada), notificação de vencimento próximo, eventualmente gateway de
  pagamento automático.

## Faturamento por empresa (mensalidade + bloqueio por inadimplência)

Pedido novo: cada **empresa** (Store) tem sua própria mensalidade opcional. O
grupo não tem uma mensalidade própria digitada — o valor do grupo é só a soma
das empresas dele (seu exemplo: Contagem 100 + Anchieta 100 + Raiz 100 = 300
do Grupo Nugalho). Isso casa exatamente com o jeito que o resto do sistema já
funciona (série de NF-e, certificado — tudo já é por Store), então não
precisa de campo novo no `CompanyGroup`, só em `Store`.

### Modelo de dados

```prisma
model Store {
  // ...
  monthlyFee Decimal? @db.Decimal(10, 2) // mensalidade — opcional, null = não cobra

  billingPayments StoreBillingPayment[]
}

// Histórico de pagamentos registrados manualmente por você — não é
// integração com gateway de pagamento nenhum, é só o registro de "recebi
// esse valor dessa empresa nessa data", pra saber a partir de quando contar
// os 30 dias.
model StoreBillingPayment {
  id             String   @id @default(uuid())
  storeId        String
  store          Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  amount         Decimal  @db.Decimal(10, 2)
  paidAt         DateTime
  referenceMonth String?  // ex: "2026-09", só organizativo
  notes          String?
  registeredById String
  registeredBy   User     @relation(fields: [registeredById], references: [id])
  createdAt      DateTime @default(now())

  @@index([storeId])
}
```

Regra de bloqueio: pra cada `Store` com `monthlyFee` preenchido, calcula a
data-base = data do pagamento mais recente (`paidAt`), ou `Store.createdAt`
se nunca teve nenhum pagamento registrado. Se `hoje - data-base > 30 dias`,
a loja fica bloqueada. Lojas sem `monthlyFee` (null) nunca bloqueiam — é
assim que o campo fica "opcional" de verdade, não é só opcional no
formulário.

### Quem edita isso

Só quem tem `isAdminMaster = true` (você) — esse flag já existe no schema
hoje e já é usado exatamente com esse espírito ("só o dono do sistema pode
X"). Nem o Proprietário da empresa cliente vê ou edita `monthlyFee` /
histórico de pagamento — é informação sua, não dela. Isso vira uma tela nova,
separada de Cadastros → Lojas (que é onde o cliente mexe nos dados dele):
algo como um painel `/admin/faturamento`, visível só pra você, listando
grupo → empresas → mensalidade → status (em dia / bloqueada há X dias) →
botão "registrar pagamento".

### Onde o bloqueio é aplicado

Diferente do bloqueio de conta de teste que já existe (esse é por *usuário*,
checado no login e em cada request via JWT — `user.isDemo` +
`user.demoExpiresAt`), o bloqueio de inadimplência é por **loja específica**,
não por conta inteira: um usuário pode ter acesso a 3 lojas do grupo, uma
atrasada e duas em dia, e só a atrasada fica inacessível. Por isso ele entra
no mesmo lugar já proposto acima pro `groupId` — dentro do `ensureStoreAccess`
centralizado — em vez de no login: query a `Store`, se estiver bloqueada por
inadimplência, nega o acesso àquela loja com uma mensagem clara ("Essa loja
está com o acesso suspenso — entre em contato com o suporte"), sem afetar as
outras lojas do mesmo usuário.

No seletor de loja no topo, a loja bloqueada aparece cinza/desabilitada com
esse aviso, em vez de simplesmente sumir da lista — assim o cliente entende o
motivo (evita chamado de suporte tipo "sumiu minha loja").

### Fora do escopo por enquanto

- Nenhuma integração com gateway de pagamento (Stripe, Pix automático etc.) —
  é registro manual, você marca quando recebe.
  Se quiser automatizar cobrança de verdade depois, dá pra plugar por cima
  dessa mesma tabela sem redesenhar nada (o pagamento automático só passaria
  a criar as linhas de `StoreBillingPayment` sozinho).
- Notificação automática pro cliente avisando que está perto de vencer —
  pode entrar como uma fase futura, reaproveitando o sistema de notificações
  que já existe (WhatsApp/push).

## O que não muda

- `UserStore` continua exatamente como está (acesso granular à loja dentro do
  grupo).
- Toda a matriz de permissões por `UserRole` continua igual.
- Nenhuma tabela das ~20 que penduram de `Store` precisa de alteração.
- Nenhuma tela nova é obrigatória pra Nugalho continuar funcionando depois da
  Fase 1 — o grupo "Nugalho" fica transparente pra quem já usa o sistema.

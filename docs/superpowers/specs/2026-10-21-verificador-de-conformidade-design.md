# Verificador de Conformidade — design

Data: 2026-10-21
Dono: Rubens Praser Junior (Head of Engineering, Rocket Code)
Status: rascunho para aprovação

Convenção deste documento: o que não tem marca foi decidido pelo dono. **[Decisão do redator]** marca escolhas feitas durante a conversa que o dono pode revisar. **[Livre para o construtor]** marca o que fica a critério de quem implementa.

## 1. Intenção

A Rocket Code tem um conjunto de normas de segurança da informação e privacidade no Google Drive (pasta "RocketCode", `1mUy_BDM-D4w-JrnSkbYZhWP0xRQik24Q`): políticas, normas, planos, procedimentos, formulários, registros, o Inventário de Ativos e o ROPA. Essas regras governam a empresa inteira, não só o credenciamento SENATRAN.

Normas escritas só valem se descreverem o que a empresa faz e se forem cumpridas. Hoje isso depende de alguém lembrar de checar. O Verificador é um agente que roda continuamente numa VPS da empresa, fora da estação de qualquer pessoa, e faz duas coisas:

1. **Mantém os documentos atualizados**: percebe quando um documento deixou de descrever a realidade e propõe a mudança no Slack. Só aplica depois que alguém aprova.
2. **Garante que as normas são seguidas**: revisa todo pull request e bloqueia o merge quando há inconformidade. Também varre a `main` de todos os repositórios diariamente e reporta no Slack o que não está conforme.

Tudo o que é relevante aparece num canal do Slack dedicado, onde o time aprova, libera e age.

## 2. Objetivos

- Todo PR nos repositórios **marcados para monitoramento** na organização GitHub `rocket-repos` é revisado contra a versão vigente das normas antes do merge.
- Um PR com inconformidade fica com o merge bloqueado e recebe um comentário dizendo o problema, a norma violada e como corrigir.
- A `main` de cada repositório é auditada uma vez por dia e as inconformidades chegam ao Slack para alguém tomar providência.
- Os documentos do Drive acompanham a realidade. Uma mudança de documento só é aplicada depois de aprovada no Slack, e quem aprovou fica registrado.
- Toda liberação manual de um bloqueio fica registrada numa planilha do Drive, com rastreabilidade, e alimenta as revisões seguintes.
- O agente avisa no Slack sobre os próprios problemas: credenciais perto de vencer, cota da assinatura esgotada, GitHub, Drive ou Slack fora do ar.

## 3. Não objetivos

- Corrigir código. O agente aponta e explica, não abre commits nem PRs de correção.
- Criar tickets no Linear ou em qualquer outro rastreador. O canal de ação é o Slack.
- Monitorar a VPS (disponibilidade, CPU, disco). Isso é do New Relic, e as indisponibilidades da VPS são tratadas pelo time.
- Criar documentos novos no Drive. Quando um documento novo for necessário, o agente propõe no Slack e uma pessoa cria (ver 7.3).
- Repositórios fora da `rocket-repos` e repositórios da `rocket-repos` não marcados para monitoramento.

## 4. Antiobjetivos (falha mesmo que "funcione")

- Um documento do Drive alterado sem aprovação registrada.
- Um merge que entra sem verificação e sem ninguém ficar sabendo.
- Um segredo, dado pessoal ou trecho de documento sensível visto num diff e repetido num comentário de PR ou no Slack.
- O agente ser enganado por conteúdo do próprio PR: instruções no código, em `.claude/`, `.mcp.json`, hooks ou textos que tentem mudar o veredito ou executar algo.
- Cópias das normas versionadas em repositórios, ou regras "lembradas" pelo agente que não vêm da versão vigente do Drive.
- Um canal tão barulhento que o time pare de ler.

## 5. Restrições

- **Modelo e custo:** o agente usa o Claude Code em modo não interativo (`claude -p`), autenticado com a **assinatura pessoal do dono**, por meio de um token gerado com `claude setup-token` e passado em `CLAUDE_CODE_OAUTH_TOKEN`. Não se usa chave de API. O dono conhece e aceitou o risco: os termos da Anthropic descrevem a autenticação por assinatura como "uso comum e individual" e permitem ação sem aviso prévio.
  - `ANTHROPIC_API_KEY` e `apiKeyHelper` não podem existir no ambiente do processo, porque têm precedência sobre o token.
  - Não usar `--bare`, que ignora credenciais OAuth.
  - O token vale um ano. A data de emissão precisa ser registrada para o alerta de vencimento.
- **Cota:** é a mesma do uso interativo do dono. Nada é adiado nem priorizado. Tudo roda até a cota acabar. Esgotada a cota, as revisões pendentes esperam a renovação e os PRs ficam bloqueados até lá.
- **Sem conectores do claude.ai:** com o token de assinatura, os conectores (Google Drive, Slack etc.) não ficam disponíveis. Todo acesso externo usa credenciais próprias do agente (ver 6.2).
- **GitHub:** a organização `rocket-repos` está no plano Team, com 18 repositórios privados e 1 público. Esse plano permite um ruleset de organização que exige a verificação de um GitHub App específico nos repositórios selecionados.
- **Seleção dos repositórios:** feita por uma **propriedade personalizada** da organização, `verificar-conformidade`, do tipo verdadeiro/falso, com valor padrão falso. O dono marca `verificar-conformidade = true` nos repositórios que quer monitorar. **Repositórios arquivados são sempre ignorados, mesmo com a propriedade marcada.** A mesma propriedade define onde o agente atua e onde o ruleset exige o check, então os dois nunca divergem. **[Decisão do redator]** A escolha foi a propriedade personalizada e não os tópicos do repositório. O ruleset de organização sabe filtrar por propriedade, mas não por tópico, e só os donos da organização alteram a propriedade, enquanto qualquer administrador do repositório edita os tópicos.
- **Drive:** a pasta pertence à conta pessoal `praser@gmail.com` (Meu Drive, sem Google Workspace).
- **Plugin existente:** as regras de leitura e interpretação das normas já estão no plugin `rocketcode` (`agent-skills/rocketcode`), com as skills `politicas`, `auditoria`, `revisao` e `verificar-conformidade`. O agente reaproveita esse plugin em vez de duplicar a lógica.
- **Regras do repositório que o agente analisa:** nunca abrir `.env` nem arquivos com valores de segredos, como as skills já determinam.

## 6. Arquitetura

### 6.1 Duas camadas

**[Decisão do redator]** O agente tem duas camadas com responsabilidades separadas:

- **Orquestrador.** Um serviço de longa duração na VPS. Ele recebe eventos do GitHub e do Slack, agenda a rotina diária e mantém o estado. Também guarda todas as credenciais e faz todas as escritas: check runs, comentários, mensagens no Slack, edições no Drive e linhas nas planilhas. O orquestrador é código determinístico.
- **Analista.** Uma execução de `claude -p` por tarefa, com o plugin `rocketcode` carregado via `--plugin-dir`. Recebe só o material da tarefa: o diff ou o checkout, as normas exportadas e o histórico de liberações relevante. Devolve um resultado estruturado em JSON. O analista não tem credenciais do GitHub, do Slack nem do Google, e não escreve em lugar nenhum fora do seu diretório temporário.

O motivo é que o analista lê conteúdo não confiável, o código dos PRs. Se esse conteúdo conseguir manipulá-lo, o pior que acontece é um veredito errado, que o time pode liberar ou contestar. Ele nunca consegue publicar, aprovar ou vazar credenciais.

Regras para cada execução do analista:

- Diretório de trabalho temporário e limpo.
- Antes de rodar, remover do checkout `.claude/`, `.mcp.json`, `CLAUDE.md` e equivalentes. Sem `--bare`, o `claude -p` executaria hooks e servidores MCP declarados pelo próprio repositório. Mudanças nesses arquivos continuam sendo analisadas como conteúdo, pelo diff.
- Ambiente reduzido: só `CLAUDE_CODE_OAUTH_TOKEN`, `PATH`, `HOME` e o que o Claude Code exigir.
- Permissões fechadas: só leitura de arquivos e comandos de leitura. Nada de rede além da API do modelo.
- **[Livre para o construtor]** Isolamento extra (usuário do sistema dedicado, contêiner, sandbox do Claude Code).

### 6.2 Identidades e credenciais

| Serviço | Identidade | Credencial | Vencimento |
|---|---|---|---|
| Claude | Assinatura do dono | `CLAUDE_CODE_OAUTH_TOKEN` | 1 ano após a emissão |
| GitHub | GitHub App próprio, instalado na `rocket-repos` | Chave privada do App (tokens de instalação de 1 h gerados a partir dela) | A chave não expira, só é revogada |
| Slack | App próprio com bot, em Socket Mode | Token de bot `xoxb-` (sem rotação) + token de app `xapp-` com `connections:write` | Não expiram |
| Google | Conta de serviço do Google Cloud | Chave JSON da conta de serviço | Não expira por padrão |
| PostgreSQL | Papel de banco próprio do Verificador | String de conexão (TLS) | Depende do provedor; testada diariamente |

- **GitHub App:** permissões de leitura de Contents e Metadata, escrita em Checks, Commit statuses, Pull requests e Issues (comentários). No nível da organização: leitura de Administration (para os bypasses de ruleset em 7.5) e de Members. Se algum endpoint exigir permissão adicional, ela entra aqui e na seção 11. O recurso não deve funcionar pela metade sem avisar. Eventos `pull_request`, `check_suite` e `check_run`. O ruleset de organização tem como alvo os repositórios com `verificar-conformidade = true` e exige o check desse App, identificado pelo App como origem para que outro ator não consiga satisfazê-lo. O agente consulta a propriedade a cada evento e ignora PRs de repositórios não marcados. Os administradores da organização ficam na lista de bypass.
- **Slack:** escopos do bot para postar, editar mensagens, abrir formulários e ler a lista de membros do canal (`chat:write`, `channels:read`/`groups:read` conforme o canal seja público ou privado, `users:read`). Com Socket Mode, os cliques nos botões chegam pela conexão aberta pela VPS. Não precisa de porta pública para o Slack.
- **Google:** a pasta do Drive (e as subpastas) é compartilhada com o e-mail da conta de serviço como editora. A conta de serviço lê e edita Docs e Sheets existentes. Ela **não cria** arquivos no Meu Drive do dono, porque contas de serviço não têm cota de armazenamento.
- Os webhooks do GitHub chegam ao agente por um túnel ou proxy já existente na VPS, configurado fora do compose, que encaminha para a porta do agente publicada só em `127.0.0.1`. A assinatura de cada entrega é sempre verificada.
- Credenciais num arquivo legível só pelo usuário do serviço. Nunca em repositório, log ou mensagem.

### 6.3 Leitura das normas

- O orquestrador lista a pasta do Drive (com subpastas) e compara o `modifiedTime` de cada arquivo com o último exportado. O que mudou é exportado de novo em texto (Docs como Markdown ou texto, Sheets como CSV por aba) para um cache local na VPS, fora de qualquer repositório.
- Toda tarefa usa a versão do cache conferida no início daquela tarefa. Uma norma publicada vale a partir da tarefa seguinte, como o plugin já promete.
- **[Decisão do redator]** A skill `rocketcode:politicas` ganha um modo alternativo: quando recebe um diretório de normas exportadas (ex.: variável `ROCKETCODE_POLICIES_DIR`), lê dali em vez do conector do Drive. Fora da VPS, o comportamento atual não muda. É a única mudança no plugin.
- As planilhas lidas pelo conector hoje vêm truncadas. Na exportação por API, elas vêm inteiras.

## 7. Comportamentos

### 7.1 Revisão de PR

Disparo: PR aberto, reaberto, marcado como pronto para revisão, ou novo commit. **[Decisão do redator]** PRs em rascunho também são revisados. Um commit novo cancela a revisão em andamento do mesmo PR.

1. O orquestrador cria o check run `Verificador de Conformidade` em `in_progress`.
2. O analista roda a skill `rocketcode:revisao` sobre o diff (base `merge-base`), com as normas vigentes e as liberações anteriores relevantes (ver 7.4).
3. Ele devolve, para cada achado: classificação (bloqueante, recomendação ou atualização documental), regra (documento, versão e seção), `arquivo:linha`, o problema, a correção sugerida e um identificador estável do achado (regra + arquivo + natureza do problema) para comparar entre execuções.
4. Resultado:
   - **Com bloqueantes:** check em `failure`. O merge fica bloqueado pelo ruleset. Um comentário no PR lista os bloqueantes, cada um com a norma, o problema e como corrigir. As recomendações vêm numa seção separada. Uma mensagem no Slack com o botão **Liberar** (ver 7.4).
   - **Sem bloqueantes:** check em `success`. Se houver recomendações, elas vão no comentário.
   - **Atualização documental:** não bloqueia. Vira uma proposta de mudança de documento (ver 7.3), com referência ao PR.
   - **[Decisão do redator]** Código que torna falsa uma afirmação das normas, do Inventário ou do ROPA sobre o sistema (ex.: passa a guardar biometria quando a norma diz que não guarda) é **bloqueante**, como a skill `revisao` já define. A atualização documental não bloqueante é só o caso de algo que precisa entrar nos documentos sem contradizê-los (ex.: fornecedor novo ainda fora do Inventário). Se o time preferir mudar a norma em vez do código, o caminho é a proposta (7.3) seguida de liberação (7.4).
   - **[Decisão do redator]** Só bloqueia o que o PR introduz ou altera, ou seja, achados nas linhas mudadas ou causados por elas. Inconformidades que já existiam nos arquivos tocados aparecem no comentário como "pré-existentes", sem bloquear, e continuam na varredura diária. Assim, a publicação de uma norma nova não trava todos os PRs abertos.
5. **[Decisão do redator]** O agente mantém **um único comentário por PR** e o edita a cada revisão, para não poluir a conversa. Quando os bloqueantes somem, o comentário diz que foram resolvidos.
6. Comentários e mensagens nunca reproduzem valores de segredos nem dados pessoais encontrados no diff. Eles citam o local e o tipo do problema.
7. **[Decisão do redator]** Em repositório público (hoje só o `agent-skills`), o comentário cita o código do documento e a seção, mas não transcreve o texto das normas internas. O detalhe completo vai para a mensagem do Slack. PRs vindos de forks são revisados normalmente.
8. **[Decisão do redator]** O identificador do achado não depende do texto gerado pelo modelo. O orquestrador o calcula de forma determinística a partir da regra (código do documento + seção), do arquivo e da categoria do problema, que o analista escolhe numa lista fechada. É isso que permite reconhecer, entre execuções, o mesmo achado e as liberações já concedidas.

### 7.2 Varredura diária da main

**[Decisão do redator]** Uma vez por dia, às 07:00 (America/Sao_Paulo), em todos os repositórios não arquivados da `rocket-repos` com `verificar-conformidade = true`. Marcar ou desmarcar um repositório vale a partir do próximo evento ou da próxima varredura. Repositório desmarcado sai da varredura, e os achados dele saem do relatório como "fora do monitoramento", não como resolvidos.

1. Para cada repositório, o analista roda a skill `rocketcode:auditoria` na `main` atual.
2. Na mesma rotina, o analista confere os **prazos de processo** que as próprias normas definem: revisões periódicas de acesso, testes de restauração, treinamentos, revisão anual dos documentos, revisão do inventário etc. A referência são as datas nos registros (REG) do Drive. Os prazos vêm dos documentos, nunca de valores fixos no código do agente.
3. Também procura **documentos desatualizados**: frases das normas, do Inventário ou do ROPA que o código contradiz, fornecedores ou dados presentes no código e ausentes das planilhas, e contradições entre documentos. Cada um vira uma proposta (7.3).
4. O orquestrador compara com o resultado do dia anterior, guardado no estado local, e publica **uma mensagem diária** no canal:
   - inconformidades **novas**, com repositório, `arquivo:linha`, regra, severidade e correção;
   - inconformidades **resolvidas** desde ontem;
   - quantas **continuam abertas**, com uma linha por item na thread da mensagem, e não no corpo;
   - prazos de processo vencidos ou que vencem nos próximos 14 dias.
5. **[Decisão do redator]** Se não houver nada novo nem resolvido, a mensagem é uma linha só.

### 7.3 Propostas de mudança em documentos

Origem: a varredura diária, uma revisão de PR (atualização documental), liberações repetidas (7.4) ou contradição entre normas detectada ao exportar.

1. O agente publica no canal uma mensagem com:
   - o documento e o link;
   - a seção;
   - o texto atual e o texto proposto, ou as linhas a incluir numa planilha;
   - o motivo e a evidência (`arquivo:linha`, PR ou registro).
2. Botões **Aprovar** e **Rejeitar**. **Qualquer membro do canal** pode aprovar, desde que conste como ativo no REG-SI-016 (ver 7.4). O orquestrador confere as duas coisas antes de aceitar o clique. **[Decisão do redator]** Rejeitar pede um motivo, que fica registrado e é passado ao analista para ele não propor a mesma coisa de novo.
3. Ao aprovar, o orquestrador:
   - confere que o documento não mudou desde a proposta. Se mudou, não aplica e gera uma nova proposta sobre a versão atual;
   - aplica a mudança via Docs API ou Sheets API;
   - atualiza o cabeçalho de versão e, quando o documento tiver, a tabela de controle de versões, com a data e "aprovado por <nome> via Slack". **[Decisão do redator]** Uma aprovação de proposta conta como revisão menor (ex.: 1.0 → 1.1). O que for "aprovação formal" no sentido da norma de gestão documental continua com quem a norma indica, e o agente não preenche esse campo;
   - grava uma linha no **Registro de alterações de documentos** (planilha, ver 8);
   - responde na thread da proposta com o link e o que mudou.
4. Uma proposta igual a outra ainda pendente não é republicada. **[Decisão do redator]** Propostas pendentes há mais de 7 dias são relembradas uma vez na mensagem diária.
5. Quando a mudança exigir um documento novo, a proposta diz isso e traz o texto completo. Uma pessoa cria o arquivo na pasta e o agente passa a enxergá-lo na próxima exportação.

### 7.4 Liberação de merge bloqueado

1. A mensagem de bloqueio no Slack tem o botão **Liberar**. **Qualquer membro do canal** pode liberar, com a regra de autoliberação abaixo.
   - **Fonte da verdade sobre quem é empregado:** a planilha **REG-SI-016 Quadro de Empregados** (`1B_6qMJAPYUChrjGnCf5ehx4HzlXalnyqXcTHK-b2lw4`). Colunas: matrícula, nome, cargo, e-mail corporativo, usuário GitHub, ID de usuário no Slack, admissão, desligamento, situação, observações. É ela que liga a pessoa que clicou no Slack ao autor do PR no GitHub.
   - **Autoliberação:** se o quadro tiver **mais de um empregado com situação "Ativo"**, o autor do PR não pode liberar o próprio PR. O orquestrador recusa o clique e explica o motivo. Com **um único empregado ativo**, a autoliberação é permitida. A linha do registro diz que foi autoliberação e o motivo: "autoliberação permitida: um único empregado ativo no REG-SI-016". A regra é avaliada a cada clique, lendo a planilha naquele momento.
   - **[Decisão do redator]** Só libera e aprova (7.3) quem é membro do canal **e** consta como ativo no quadro. Quem está no canal mas não está no quadro (convidado, ex-empregado) recebe a recusa explicada. Sem isso, a regra de autoliberação poderia ser contornada por uma conta fora do quadro.
2. **[Decisão do redator]** O clique abre um formulário que pede a justificativa (obrigatória) e para quais achados ela vale (todos, por padrão).
3. O orquestrador marca o check como `success`, com o resumo "liberado por <nome>: <justificativa>", e comenta no PR. Grava uma linha no **Registro de liberações de merge** (planilha, ver 8) com:
   - data e hora;
   - repositório, número do PR e autor do PR;
   - commit;
   - identificador, regra e descrição de cada achado liberado;
   - quem liberou e a justificativa;
   - tipo: "liberação via Slack", "autoliberação" (com o motivo) ou "merge sem verificação".
4. **[Decisão do redator]** Um novo commit no mesmo PR dispara nova revisão. Os achados já liberados naquele PR (mesmo identificador) não voltam a bloquear. Os novos bloqueiam.
5. **Retroalimentação:**
   - Em toda revisão, o analista recebe as liberações anteriores da mesma regra. Se a situação for equivalente a uma liberada antes, ele registra o achado como recomendação, citando a liberação anterior, em vez de bloquear.
   - **[Decisão do redator]** Quando a mesma regra recebe 3 ou mais liberações em 90 dias, o agente entende que a norma está ambígua ou desatualizada e abre uma proposta de ajuste do texto (7.3).
   - O aprendizado fica sempre no documento e na planilha, nunca em memória escondida do agente.

### 7.5 Agente fora do ar e merges forçados

- Enquanto o agente está fora, o check do PR não termina e o merge fica bloqueado. Os administradores da organização podem forçar o merge pelo bypass do ruleset.
- Ao voltar, e também na rotina diária, o orquestrador consulta os bypasses registrados pelo GitHub (`GET /orgs/rocket-repos/rulesets/rule-suites?rule_suite_result=bypass`). Para cada merge forçado ainda não registrado:
  - revisa o diff que entrou;
  - grava uma linha no Registro de liberações com o tipo "merge sem verificação" e o autor do bypass;
  - avisa no Slack se encontrar inconformidade.
- Os eventos perdidos enquanto o agente estava fora são reconciliados ao voltar: todo PR aberto sem check concluído para o commit atual é revisado.

### 7.6 Autossupervisão

Todos os alertas vão para o mesmo canal.

- **Credenciais**
  - Token do Claude: alerta a 30, 14, 7 e 1 dia(s) do vencimento, calculado pela data de emissão registrada. **[Decisão do redator]** O mesmo vale para qualquer outra credencial que vier a ter validade.
  - Credenciais que não expiram (chave do GitHub App, tokens do Slack, chave da conta de serviço): teste de autenticação a cada execução da rotina diária. Alerta imediato quando uma falha ou é revogada. O erro de token expirado ou revogado do Claude (`authentication_failed`) também gera alerta imediato.
- **Cota da assinatura**
  - Quando o analista falhar por limite de uso, o orquestrador publica um único alerta com o horário de renovação, se a mensagem trouxer. As tarefas ficam na fila e são retomadas depois da renovação. Os PRs continuam bloqueados até lá.
  - **[Livre para o construtor]** Avisar *antes* de esgotar, se houver forma confiável de ler a cota restante no modo não interativo (ver 10).
- **Serviços externos**
  - Falhas de chamada ao GitHub ou ao Drive geram alerta. O alerta cita a página de status oficial, consultada via API (githubstatus.com, painel do Google Workspace).
  - Se o Slack estiver fora, os alertas ficam na fila local e são enviados quando ele voltar.
  - **[Decisão do redator]** Um alerta por incidente, com outro na recuperação, sem repetir a cada falha.

## 8. Registros no Drive

Já existe: **REG-SI-016 Quadro de Empregados**, criado em 2026-10-21 com o dono como único empregado ativo. O ID do Slack e a data de admissão ainda precisam ser preenchidos. O agente só lê essa planilha e nunca escreve nela.

A conta de serviço não cria arquivos. Antes de ligar o agente, o dono cria na pasta mais duas planilhas, REG-SI-017 e REG-SI-018, e as compartilha com a conta de serviço:

- **Registro de liberações de merge**: uma linha por liberação ou merge forçado, com as colunas de 7.4.
- **Registro de alterações de documentos**: uma linha por proposta, com data, documento, versão anterior e nova, resumo da mudança, origem, quem aprovou ou rejeitou, motivo da rejeição e link da mensagem.

**[Decisão do redator]** Na primeira semana de operação, o agente deve propor (7.3) a inclusão do próprio Verificador nas normas: o procedimento de revisão de PR, as liberações e os dois registros. Assim o controle fica documentado como qualquer outro.

## 9. Estado e operação

- O estado fica em **PostgreSQL fora da VPS**: fila de tarefas, resultados do dia anterior, propostas pendentes, data de emissão das credenciais, metadados do cache de exportação e controle de bypasses já tratados. Assim, se a VPS for perdida ou substituída, nada se perde.
  - **[Decisão do redator]** O banco é exclusivo do Verificador. Não usa os bancos dos produtos, e menos ainda o banco de desenvolvimento compartilhado, conforme a segregação de ambientes das normas. Fica num Postgres gerenciado, com conexão TLS obrigatória. O provedor fica **[Livre para o construtor]**, e o Neon, já usado pela empresa, é o candidato natural.
  - O texto exportado das normas continua no cache em disco da VPS, que é descartável e reconstruído pelo `modifiedTime`. No banco ficam só os metadados.
  - Os registros oficiais continuam sendo as planilhas do Drive (seção 8). O banco é o estado de trabalho do agente.
  - O banco tem uma credencial (a string de conexão), que entra na tabela de 6.2 e no teste diário de 7.6. Se o banco estiver inacessível, isso gera alerta no Slack e as tarefas não rodam, ou seja, os PRs ficam bloqueados como em 7.5.
  - O novo fornecedor ou ativo entra no Inventário de Ativos por proposta (7.3) antes de o agente entrar em produção.
- **[Decisão do redator]** Stack em TypeScript/Node, a mesma dos produtos da empresa.
- Instalação na VPS com **Docker**: um `Dockerfile` para a imagem do agente (com o Claude Code e o plugin `rocketcode`) e um `docker-compose.yml` que sobe só o agente. O Postgres e a forma de entrega dos webhooks (túnel ou proxy já existente na VPS) ficam fora do compose. O contêiner também isola o analista do sistema da VPS.
- **[Livre para o construtor]** Concorrência de execuções do analista, timeouts, formato exato do JSON do analista, bibliotecas, logs locais (sem dados pessoais nem segredos) e onde o código do agente fica versionado.
- Canal do Slack: **[Decisão do redator]** `#conformidade`. O dono cria o canal e convida o bot.

## 10. Pontos em aberto para o construtor investigar

- **Cota restante no `claude -p`:** a documentação não traz uma API de cota para o modo não interativo, e não documenta o código de saída quando o limite é atingido. A linha de status interativa expõe `rate_limits`, mas não está claro se roda com `-p`. Investigar. Se não houver forma confiável, o alerta é só no momento do esgotamento.
- **Validade do token:** confirmar se `claude auth status` detecta o token vencido ou revogado. Se não detectar, o teste diário faz uma chamada mínima ao modelo.
- **Exportação do Drive:** confirmar o formato de exportação que preserva os cabeçalhos de versão e as tabelas dos documentos, para o analista citar as seções corretamente.
- **Edição dos Docs:** a mudança aprovada é aplicada por posição no documento, que muda a cada edição. Reler o documento imediatamente antes de aplicar e usar o controle de revisão (`requiredRevisionId`). Se a revisão mudou, a proposta é refeita, nunca aplicada às cegas.

## 11. Pré-requisitos que dependem de pessoas

- Gerar o token com `claude setup-token` e informar a data de emissão.
- Criar a propriedade personalizada `verificar-conformidade` na organização e marcar os repositórios a monitorar.
- Criar o GitHub App, instalar na `rocket-repos` e criar o ruleset de organização com alvo `verificar-conformidade = true`, exigindo o check do App, com os administradores na lista de bypass.
- Criar o app do Slack, o canal e convidar o bot.
- Criar o projeto no Google Cloud e a conta de serviço, compartilhar a pasta e criar as duas planilhas da seção 8.
- Criar o banco PostgreSQL gerenciado exclusivo do Verificador e entregar a string de conexão.

# Verificador de Conformidade — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** serviço na VPS que revisa todo PR da `rocket-repos` contra as normas do Drive e bloqueia o merge quando há inconformidade. Ele também audita a `main` diariamente, propõe no Slack mudanças nos documentos (aplicadas só depois de aprovadas), registra liberações e vigia a própria saúde.

**Architecture:** um orquestrador em TypeScript guarda todas as credenciais e faz todas as escritas: GitHub, Slack, Drive e Postgres. Cada análise roda `claude -p` como subprocesso isolado, sem credenciais além do token do modelo. Esse subprocesso usa o plugin `rocketcode` e devolve JSON validado. A lógica de decisão fica em funções puras (`src/core/`); os adaptadores (`src/github`, `src/slack`, `src/drive`) são finos e testados com fakes.

**Tech Stack:** Node 22, TypeScript 5, vitest, zod, drizzle-orm + `pg` (PGlite nos testes), `octokit` (App + webhooks), `@slack/bolt` (Socket Mode), `googleapis` (Drive, Docs, Sheets), Docker + docker compose.

**Spec:** `docs/superpowers/specs/2026-10-21-verificador-de-conformidade-design.md`

## Global Constraints

- Código em repositório novo: `verificador-conformidade`, a ser publicado como `rocket-repos/verificador-conformidade`. Push só quando o dono pedir.
- Modelo: `claude -p` autenticado só por `CLAUDE_CODE_OAUTH_TOKEN`. `ANTHROPIC_API_KEY` e `apiKeyHelper` nunca no ambiente: o serviço recusa iniciar se existirem. Nunca `--bare`.
- O subprocesso do analista recebe somente `CLAUDE_CODE_OAUTH_TOKEN`, `PATH`, `HOME`, `ROCKETCODE_POLICIES_DIR`. Nenhuma outra credencial.
- Antes de cada análise, remover do checkout: `.claude/`, `.mcp.json`, `CLAUDE.md`, `AGENTS.md`, `.cursor/`, `.github/copilot-instructions.md`.
- Org GitHub: `rocket-repos`. Só atua em repositórios com a propriedade personalizada `verificar-conformidade = true` (booleano, padrão falso). Nome do check: `Verificador de Conformidade`.
- Canal Slack: `#conformidade`. Pasta Drive: configurada em `DRIVE_FOLDER_ID`. Quadro de empregados: configurado em `EMPLOYEES_SHEET_ID` (REG-SI-016, só leitura). Registros: REG-SI-017 (liberações), REG-SI-018 (alterações de documentos), IDs via configuração.
- Postgres exclusivo do Verificador, TLS obrigatório (`sslmode=require` ou mais estrito). Testes nunca usam banco remoto, só PGlite em memória.
- Varredura diária: 07:00 `America/Sao_Paulo`. Prazos de processo: janela de 14 dias. Lembrete de proposta pendente: após 7 dias, uma vez. Retroalimentação: 3 liberações da mesma regra em 90 dias. Alertas de vencimento: 30, 14, 7 e 1 dia(s).
- Toda mensagem e comentário passa por `redactSensitive` antes de sair (Task 3). Nunca transcrever texto de norma em comentário de repositório público.
- Textos voltados ao usuário em português do Brasil. Identificadores de código em inglês.
- Nunca ler `.env` de repositórios analisados. Logs locais sem dados pessoais nem segredos.

## Review Focus

1. Commit novo chega enquanto a análise do commit anterior roda: o resultado antigo não pode concluir o check nem editar o comentário do commit novo (Task 13, `ignores stale result when head moved`).
2. O analista devolve JSON inválido, estoura o tempo ou falha: o check nunca fica `success`. Fica `failure` com "análise não concluída", e o serviço tenta de novo uma vez (Task 13, `never succeeds when analyst fails`).
3. Dois cliques simultâneos em Aprovar (ou Liberar): a mudança é aplicada e registrada uma única vez (Task 12, `applies proposal once under concurrent approvals`).
4. Linha do REG-SI-016 com espaços, maiúsculas ou ID do Slack em branco: o login do GitHub é comparado sem caixa e sem espaços. Quem não tem ID do Slack não é reconhecido, e a recusa explica que é preciso preencher a coluna (Task 4, `explains missing slack id`).
5. Achado cujo texto contém um segredo ou CPF copiado do diff: o texto é mascarado antes do comentário e do Slack (Task 3, `redacts secrets and cpf`).

---

## Estrutura de arquivos (`verificador-conformidade`)

```
src/config.ts                 env validado (zod); recusa ANTHROPIC_API_KEY
src/db/schema.ts              tabelas drizzle
src/db/client.ts              createDb(url) e createTestDb() (PGlite)
src/db/queue.ts               fila de jobs em Postgres
src/core/findings.ts          tipos, categorias, findingId, decideReview, redactSensitive
src/core/authorization.ts     authorizeAction (membro do canal, REG-SI-016, autoliberação)
src/core/feedback.ts          liberações relevantes, gatilho de ajuste de norma
src/core/daily.ts             diffFindings, deadlinesInWindow
src/analyst/schema.ts         zod + JSON Schema da saída do analista
src/analyst/prompts.ts        reviewPrompt, auditPrompt
src/analyst/run.ts            prepareWorkdir, analystEnv, claudeArgs, runAnalyst
src/drive/clients.ts          clientes googleapis com conta de serviço
src/drive/export.ts           syncPolicies
src/drive/registers.ts        readEmployees, appendReleaseRow, appendDocChangeRow
src/drive/proposals.ts        applyProposal
src/github/app.ts             App octokit + webhooks
src/github/checks.ts          startCheck, completeCheck
src/github/comments.ts        renderPrComment, upsertPrComment
src/github/repos.ts           listActiveRepos, checkoutRef, prDiff, listBypasses
src/slack/blocks.ts           construtores de mensagens
src/slack/app.ts              Bolt + roteamento de ações e formulários
src/services/review.ts        reviewPullRequest
src/services/release.ts       releasePullRequest
src/services/proposals.ts     publishProposals, approveProposal, rejectProposal
src/services/daily.ts         runDailyScan
src/services/reconcile.ts     reconcileBypasses, reconcileOpenPrs
src/health/credentials.ts     expiryAlerts, probeCredentials
src/health/incidents.ts       recordFailure, recordRecovery
src/health/notifier.ts        notify com outbox quando o Slack cai
src/main.ts                   composição, agendador, workers
Dockerfile                    imagem do agente (Claude Code + plugin rocketcode)
docker-compose.yml            só o agente (Postgres e entrega de webhooks ficam fora)
deploy/env.example            variáveis sem valores
deploy/README.md              pré-requisitos e operação
```

---

### Task 1: Projeto, configuração e banco

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `drizzle.config.ts`, `src/config.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/db/queue.ts`
- Test: `test/config.test.ts`, `test/db/queue.test.ts`

**Interfaces:**
- Produces:
  - `loadConfig(env: NodeJS.ProcessEnv): Config`, que lança `ConfigError` com a lista de problemas.
  - `Config`: `{ databaseUrl, claudeOauthToken, claudeTokenIssuedAt: Date, githubAppId, githubPrivateKey, githubWebhookSecret, githubOrg: 'rocket-repos', slackBotToken, slackAppToken, slackChannelId, googleServiceAccountJson, driveFolderId, employeesSheetId, releasesSheetId, docChangesSheetId, policiesCacheDir, pluginDir, workRoot, webhookPort }`.
  - `createDb(url: string): Db` e `createTestDb(): Promise<Db>` (PGlite com as migrações aplicadas).
  - Tabelas:
    - `jobs`
    - `pr_reviews` (repo, pr, head_sha, status, check_run_id, comment_id, slack_ts, result jsonb)
    - `pr_releases` (repo, pr, pr_author, commit, finding_id, document, section, category, problem, released_by, kind, reason, note, created_at)
    - `daily_findings` (run_date, repo, finding_id, payload jsonb)
    - `proposals` (id, fingerprint unique, status `pending|approved|rejected|stale|applying`, payload jsonb, slack_ts, created_at, reminded_at, decided_by, reason)
    - `export_cache` (file_id, modified_time, path)
    - `bypasses_seen` (rule_suite_id)
    - `incidents` (key, opened_at, closed_at)
    - `outbox` (id, payload jsonb, sent_at)
    - `kv` (key, value jsonb)
  - Fila:
    - `enqueue(db, kind: JobKind, payload: object, opts?: { dedupeKey?: string; runAfter?: Date }): Promise<void>`
    - `claimNext(db, kinds: JobKind[]): Promise<Job | null>`
    - `complete(db, id)`
    - `fail(db, id, error: string, retryAt?: Date)`
    - `cancelByDedupeKey(db, key)`
  - `JobKind = 'review_pr' | 'daily_scan' | 'reconcile' | 'apply_proposal' | 'release_pr' | 'health'`.

- [ ] **Step 1: criar o repositório e a base do projeto.** `git init verificador-conformidade`, `npm init`, dependências do Tech Stack mais `@electric-sql/pglite`, `drizzle-kit`, `tsx`. Scripts: `test` = `vitest run`, `typecheck` = `tsc --noEmit`, `db:generate`, `db:migrate`, `start` = `tsx src/main.ts`. O `.gitignore` cobre `.env*`, `node_modules`, `cache/` e `work/`.

- [ ] **Step 2: escrever os testes que falham.**

```ts
// test/config.test.ts
it('refuses to start when ANTHROPIC_API_KEY is present', () => {
  expect(() => loadConfig({ ...validEnv, ANTHROPIC_API_KEY: 'x' })).toThrow(/ANTHROPIC_API_KEY/)
})
it('requires sslmode on DATABASE_URL', () => {
  expect(() => loadConfig({ ...validEnv, DATABASE_URL: 'postgres://u:p@h/db' })).toThrow(/sslmode/)
})
it('parses CLAUDE_TOKEN_ISSUED_AT as a date', () => {
  expect(loadConfig(validEnv).claudeTokenIssuedAt).toEqual(new Date('2026-10-21T00:00:00Z'))
})

// test/db/queue.test.ts
it('two workers never claim the same job', async () => {
  const db = await createTestDb()
  await enqueue(db, 'review_pr', { repo: 'a', pr: 1 })
  const [a, b] = await Promise.all([claimNext(db, ['review_pr']), claimNext(db, ['review_pr'])])
  expect([a, b].filter(Boolean)).toHaveLength(1)
})
it('dedupeKey replaces a pending job instead of adding another', async () => { /* enqueue twice with same key → 1 pending */ })
it('does not claim jobs whose runAfter is in the future', async () => { /* ... */ })
```

- [ ] **Step 3: rodar e ver falhar.** `npx vitest run test/config.test.ts test/db/queue.test.ts`. Esperado: FAIL, módulos inexistentes.

- [ ] **Step 4: implementar `config.ts`, `schema.ts`, `client.ts` e `queue.ts`.** `claimNext` usa `UPDATE ... WHERE id = (SELECT id ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. Gerar a migração com `npm run db:generate`.

- [ ] **Step 5: rodar e ver passar.** Mesmo comando. Esperado: PASS. `npm run typecheck` sem erros.

- [ ] **Step 6: commit.** `git commit -m "feat: projeto, configuração e fila em Postgres"`

---

### Task 2: Mudança no plugin `rocketcode` (repositório agent-skills)

**Files:**
- Modify: `rocketcode/skills/politicas/SKILL.md`
- Modify: `rocketcode/.claude-plugin/plugin.json` (versão `0.2.0`)

**Interfaces:**
- Produces: quando `ROCKETCODE_POLICIES_DIR` está definido, a skill lê as normas desse diretório em vez do conector. Estrutura do diretório:
  - `manifest.json`: `[{ fileId, title, mimeType, modifiedTime, path }]`;
  - Docs em `docs/<fileId>.md`;
  - Sheets em `sheets/<fileId>/<aba>.csv`.

- [ ] **Step 1: acrescentar ao SKILL.md da `politicas` uma seção "Fonte local (servidor)".** Conteúdo:
  - Se a variável existir, ler `manifest.json` e os arquivos listados.
  - Não chamar o conector.
  - Considerar essa a versão vigente.
  - Citar `modifiedTime` como data da leitura.
  - Se o diretório estiver vazio ou sem manifesto, parar e dizer que as normas não foram carregadas.

  Fora disso, o comportamento atual não muda.
- [ ] **Step 2: validar.** `claude plugin validate rocketcode`. Esperado: sem erros.
- [ ] **Step 3: teste manual.** Montar um diretório com dois arquivos exportados à mão e rodar `ROCKETCODE_POLICIES_DIR=<dir> claude -p "Invoque rocketcode:politicas e liste as fontes" --plugin-dir rocketcode`. Esperado: lista os dois arquivos, sem chamar o Drive.
- [ ] **Step 4: commit no agent-skills.** `git commit -m "feat(rocketcode): politicas lê normas exportadas de ROCKETCODE_POLICIES_DIR"`

---

### Task 3: Achados e decisão da revisão

**Files:**
- Create: `src/core/findings.ts`
- Test: `test/core/findings.test.ts`

**Interfaces:**
- Produces:
  - `CATEGORIES`, com os 17 temas: `segredos, logs_dados_pessoais, autenticacao_sessao, autorizacao, cripto_transito, armazenamento_arquivos, segregacao_ambientes, dados_sensiveis, retencao, trilha_auditoria, monitoramento, backup, desenvolvimento_seguro, fornecedores_inventario, ropa, fontes_reguladas, ferramentas_ia`.
  - `Finding`: `{ classification: 'bloqueante'|'recomendacao'|'atualizacao_documental', document: string, version: string, section: string, file: string, line: number|null, category: Category, introducedByChange: boolean, problem: string, fix: string, equivalentToRelease: string|null }`
  - `findingId(f: Pick<Finding,'document'|'section'|'file'|'category'>): string` (sha256 hex, primeiros 16 caracteres, de `document|section|file|category` normalizados com trim e caixa baixa).
  - `decideReview(findings: Finding[], releasedIds: Set<string>): ReviewDecision`. O retorno `ReviewDecision` é `{ conclusion: 'success'|'failure', blocking: Finding[], released: Finding[], recommendations: Finding[], preexisting: Finding[], docUpdates: Finding[] }`.
  - `redactSensitive(text: string): string`.

- [ ] **Step 1: testes que falham.**

```ts
it('blocks only blocking findings introduced by the change', () => {
  const d = decideReview([f({ classification: 'bloqueante', introducedByChange: false })], new Set())
  expect(d.conclusion).toBe('success'); expect(d.preexisting).toHaveLength(1)
})
it('does not block a finding already released on this PR', () => { /* id in releasedIds → released[], success */ })
it('downgrades a blocking finding equivalent to a prior release to recommendation', () => { /* equivalentToRelease set */ })
it('documentation updates never block', () => { /* atualizacao_documental → docUpdates, success */ })
it('findingId is stable across case and whitespace', () => {
  expect(findingId({ document: 'NOR-SI-008 ', section: '4.2', file: 'src/a.ts', category: 'logs_dados_pessoais' }))
    .toBe(findingId({ document: 'nor-si-008', section: '4.2', file: 'src/a.ts', category: 'logs_dados_pessoais' }))
})
it('redacts secrets and cpf', () => {
  const out = redactSensitive('chave sk_live_abc123XYZ e CPF 123.456.789-09 e AKIAABCDEFGHIJKLMNOP')
  expect(out).not.toMatch(/sk_live_abc|123\.456\.789-09|AKIAABCDEFGHIJKLMNOP/)
})
```

- [ ] **Step 2: rodar e ver falhar.** `npx vitest run test/core/findings.test.ts`. Esperado: FAIL.
- [ ] **Step 3: implementar.** `redactSensitive` mascara:
  - prefixos de chave (`sk_live_`, `sk_test_`, `rk_`, `xox[abp]-`, `xapp-`, `ghp_`, `ghs_`, `github_pat_`, `AKIA`, `-----BEGIN`);
  - CPF formatado ou com 11 dígitos;
  - e-mails;
  - sequências base64 com mais de 40 caracteres.

  Cada ocorrência vira `[removido]`.
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: commit.** `git commit -m "feat(core): achados, id determinístico, decisão e mascaramento"`

---

### Task 4: Autorização de aprovar e liberar

**Files:**
- Create: `src/core/authorization.ts`
- Test: `test/core/authorization.test.ts`

**Interfaces:**
- Produces:
  - `Employee`: `{ registration, name, githubLogin: string|null, slackUserId: string|null, active: boolean }`.
  - `authorizeAction(input: { action: 'release'|'approve'|'reject'; clickerSlackId: string; channelMemberIds: Set<string>; employees: Employee[]; prAuthorGithubLogin?: string }): AuthResult`. O retorno `AuthResult` é `{ allowed: true; actor: Employee; kind: 'normal'|'self_release'; note: string|null } | { allowed: false; message: string }`.

- [ ] **Step 1: testes que falham.**

```ts
it('allows self-release when there is a single active employee and explains why', () => {
  const r = authorizeAction({ action: 'release', clickerSlackId: 'U1', channelMemberIds: new Set(['U1']),
    employees: [emp('dono', 'U1')], prAuthorGithubLogin: 'dono' })
  expect(r).toMatchObject({ allowed: true, kind: 'self_release',
    note: 'autoliberação permitida: um único empregado ativo no REG-SI-016' })
})
it('forbids self-release with more than one active employee', () => { /* 2 active → allowed false, message mentions autoliberação */ })
it('inactive employees do not count toward the active total', () => { /* 1 active + 1 Desligado → self-release allowed */ })
it('refuses a channel member who is not in REG-SI-016', () => { /* message mentions REG-SI-016 */ })
it('refuses a non-member of the channel', () => {})
it('matches github login ignoring case and spaces', () => { /* ' Dono ' vs 'dono' → self_release */ })
it('explains missing slack id', () => { /* employee with slackUserId null → message tells to fill "ID de usuário no Slack" */ })
it('approve has no self-release restriction', () => {})
```

- [ ] **Step 2: rodar e ver falhar.** `npx vitest run test/core/authorization.test.ts`. Esperado: FAIL.
- [ ] **Step 3: implementar.** Mensagens de recusa em português, dizendo o motivo e o que fazer.
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: commit.** `git commit -m "feat(core): autorização com regra de autoliberação pelo REG-SI-016"`

---

### Task 5: Retroalimentação e comparação diária

**Files:**
- Create: `src/core/feedback.ts`, `src/core/daily.ts`
- Test: `test/core/feedback.test.ts`, `test/core/daily.test.ts`

**Interfaces:**
- Produces:
  - `ReleaseRecord`: `{ id, repo, pr, findingId, document, section, category, problem, reason, kind, createdAt: Date }`.
  - `releasesForRules(all: ReleaseRecord[], rules: Array<{document, section}>): ReleaseRecord[]`, que alimenta o prompt.
  - `normAdjustmentCandidates(all: ReleaseRecord[], now: Date): Array<{ document, section, releases: ReleaseRecord[] }>`. Regra: 3 ou mais liberações da mesma `document+section` nos últimos 90 dias. Os registros do tipo `merge sem verificação` não contam.
  - `diffFindings(prev: Map<string,Finding>, curr: Map<string,Finding>): { added: Finding[]; resolved: Finding[]; persistent: Finding[] }`. A chave de cada mapa é `repo:findingId`.
  - `deadlinesInWindow(items: Array<{ item, document, dueDate: Date }>, now: Date, days = 14): { overdue, upcoming }`.

- [ ] **Step 1: testes que falham.**

```ts
it('triggers adjustment at the third release of the same rule within 90 days', () => {})
it('ignores releases older than 90 days', () => {})
it('does not count "merge sem verificação" as a release', () => {})
it('diffFindings separates added, resolved and persistent', () => {})
it('deadlinesInWindow puts past dates in overdue and the next 14 days in upcoming', () => {})
```

- [ ] **Step 2: rodar e ver falhar.** Esperado: FAIL.
- [ ] **Step 3: implementar.**
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: commit.** `git commit -m "feat(core): gatilho de ajuste de norma e diff diário"`

---

### Task 6: Analista (`claude -p` isolado)

**Files:**
- Create: `src/analyst/schema.ts`, `src/analyst/prompts.ts`, `src/analyst/run.ts`
- Test: `test/analyst/run.test.ts`, `test/analyst/fixtures/` (saídas reais capturadas)

**Interfaces:**
- Consumes: `Finding`, `CATEGORIES` (Task 3); `ReleaseRecord` (Task 5).
- Produces:
  - `AnalystOutput`: `{ findings: Finding[]; proposals: ProposalDraft[]; deadlines: Array<{ item, document, dueDate: string }> }`.
  - `ProposalDraft`: `{ documentFileId, documentTitle, section, kind: 'replace_text'|'append_rows'|'new_document', currentText: string|null, proposedText: string|null, rows: string[][]|null, reason, evidence }`.
  - `analystJsonSchema`: JSON Schema gerado do zod e passado em `--json-schema`.
  - `reviewPrompt(input: { repo, pr, baseSha, headSha, isPublic: boolean, priorReleases: ReleaseRecord[], rejectedProposals: string[] }): string`, que manda invocar `rocketcode:revisao` sobre `git diff <base>...<head>`.
  - `auditPrompt(input: { repo, priorReleases, rejectedProposals, pendingProposals: string[] }): string`, que manda invocar `rocketcode:auditoria` e extrair prazos dos registros REG.
  - `prepareWorkdir(dir: string): Promise<void>`, que remove os caminhos listados em Global Constraints.
  - `analystEnv(cfg: Config): Record<string,string>`.
  - `claudeArgs(prompt: string, cfg: Config): string[]`.
  - `runAnalyst(input: { cwd, prompt, cfg, spawn?: SpawnFn, timeoutMs?: number }): Promise<AnalystResult>`.
  - `AnalystResult`: `{ ok: true; output: AnalystOutput } | { ok: false; reason: 'quota'; resetsAt: Date|null; raw: string } | { ok: false; reason: 'auth'|'invalid_output'|'timeout'|'error'; raw: string }`.

- [ ] **Step 1: capturar fixtures reais.** Com o token configurado localmente, rodar uma vez `claude -p 'responda {"findings":[],"proposals":[],"deadlines":[]}' --output-format json --json-schema '<schema>'`. Salvar a saída em `test/analyst/fixtures/ok.json`. Anotar em qual campo vem a saída estruturada (`structured_output` ou `result`). Criar também `quota.txt` com o texto `You've hit your session limit · resets 3:45pm` e `auth.txt` com `OAuth token has expired`.
- [ ] **Step 2: testes que falham.**

```ts
it('claudeArgs never includes --bare and loads only the rocketcode plugin', () => {
  const a = claudeArgs('x', cfg)
  expect(a).not.toContain('--bare')
  expect(a).toEqual(expect.arrayContaining(['-p', '--output-format', 'json', '--json-schema',
    '--plugin-dir', cfg.pluginDir, '--setting-sources', 'user', '--strict-mcp-config',
    '--permission-mode', 'dontAsk', '--no-session-persistence']))
  expect(a).toEqual(expect.arrayContaining(['--allowedTools', 'Read,Grep,Glob,Skill,Bash(git diff:*),Bash(git log:*),Bash(git show:*)']))
})
it('analystEnv contains only the allowed variables', () => {
  expect(Object.keys(analystEnv(cfg)).sort()).toEqual(['CLAUDE_CODE_OAUTH_TOKEN','HOME','PATH','ROCKETCODE_POLICIES_DIR'])
})
it('prepareWorkdir removes agent config files from the checkout', async () => {})
it('parses a valid output fixture', async () => {})
it('classifies the session limit message as quota with reset time', async () => {})
it('classifies an expired OAuth token as auth', async () => {})
it('returns invalid_output when the JSON fails the schema', async () => {})
it('returns timeout and kills the process after timeoutMs', async () => {})
```

- [ ] **Step 3: rodar e ver falhar.** `npx vitest run test/analyst`. Esperado: FAIL.
- [ ] **Step 4: implementar.** `spawn` é injetável, e o padrão é `child_process.spawn`. O `HOME` do analista aponta para um diretório próprio do serviço com `~/.claude` mínimo, para que configurações do usuário não vazem. O timeout padrão é de 20 minutos. O prompt de revisão inclui as regras de 7.1:
  - só bloqueia o que o PR introduz;
  - contradição com a norma é bloqueante;
  - categoria escolhida da lista fechada;
  - nunca copiar valores sensíveis para `problem` e `fix`.

  Para repositório público, o prompt pede para não transcrever o texto das normas.
- [ ] **Step 5: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 6: commit.** `git commit -m "feat(analyst): execução isolada do claude -p com saída validada"`

---

### Task 7: Exportação das normas do Drive

**Files:**
- Create: `src/drive/clients.ts`, `src/drive/export.ts`
- Test: `test/drive/export.test.ts`

**Interfaces:**
- Consumes: tabela `export_cache` (Task 1).
- Produces:
  - `googleClients(cfg): { drive, docs, sheets }`, autenticado pela conta de serviço com os escopos `drive`, `documents` e `spreadsheets`.
  - `syncPolicies(deps: { drive, sheets, db, cacheDir, folderId }): Promise<{ changed: string[]; manifestPath: string }>`.
    - Percorre a pasta recursivamente, com paginação.
    - Reexporta só o que tiver `modifiedTime` diferente do cache.
    - Docs saem em `text/markdown`; se a exportação falhar, em `text/plain`.
    - Sheets saem com cada aba via `spreadsheets.values.get`, em CSV.
    - Escreve `manifest.json` e remove do cache os arquivos que saíram da pasta.

- [ ] **Step 1: testes que falham.** Com o Drive falso:
  - `exports only files whose modifiedTime changed`;
  - `recurses into subfolders and follows nextPageToken`;
  - `writes one csv per sheet tab`;
  - `removes cached files no longer in the folder`;
  - `manifest lists every exported file with modifiedTime`.
- [ ] **Step 2: rodar e ver falhar.** Esperado: FAIL.
- [ ] **Step 3: implementar.**
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: verificação real (manual).** Com a conta de serviço já compartilhada, rodar `tsx scripts/sync-once.ts`. Conferir que o manifesto lista os 18 arquivos da pasta e que os cabeçalhos de versão aparecem no markdown. Se não aparecerem, registrar o formato escolhido no `deploy/README.md`.
- [ ] **Step 6: commit.** `git commit -m "feat(drive): exportação incremental das normas"`

---

### Task 8: Registros e aplicação de propostas no Drive

**Files:**
- Create: `src/drive/registers.ts`, `src/drive/proposals.ts`
- Test: `test/drive/registers.test.ts`, `test/drive/proposals.test.ts`

**Interfaces:**
- Consumes: `Employee` (Task 4), `ReleaseRecord` (Task 5), `ProposalDraft` (Task 6).
- Produces:
  - `readEmployees(sheets, sheetId): Promise<Employee[]>`. Lê pelo cabeçalho (`Usuário GitHub`, `ID de usuário no Slack`, `Situação`), não pela posição da coluna. `active` é `Situação` igual a "Ativo", sem diferenciar caixa.
  - `appendReleaseRow(sheets, sheetId, r: ReleaseRecord & { prAuthor, commit, releasedBy, note: string|null }): Promise<void>`.
  - `appendDocChangeRow(sheets, sheetId, row: { date, document, fromVersion, toVersion, summary, origin, decidedBy, decision: 'aprovada'|'rejeitada', reason: string|null, slackLink }): Promise<void>`.
  - `applyProposal(deps: { docs, sheets, drive }, p: ProposalDraft, approver: string, today: string): Promise<{ status: 'applied'; fromVersion; toVersion } | { status: 'stale'; why: string }>`.
    - Para `replace_text`: lê o documento, exige `currentText` exatamente uma vez e aplica `deleteContentRange` + `insertText` num único `batchUpdate`, com `writeControl.requiredRevisionId` da leitura.
    - Sobe a versão menor no cabeçalho (`Versão X.Y` → `X.(Y+1)`).
    - Acrescenta uma linha à tabela de controle de versões, se ela existir, com "aprovado por <nome> via Slack".
    - Para `append_rows`, usa `values.append` com `valueInputOption: 'RAW'`.
    - Para `new_document`, nunca aplica e retorna `stale` com `why = 'documento novo: criar manualmente'`.

- [ ] **Step 1: testes que falham.**
  - `readEmployees maps columns by header name`
  - `applyProposal returns stale when currentText is not found`
  - `applyProposal returns stale when currentText appears twice`
  - `applyProposal returns stale when Google rejects the revision id`
  - `applyProposal bumps 1.0 to 1.1 and adds a version row`
  - `append_rows uses RAW so values are not reinterpreted`
  - `new_document is never applied`
- [ ] **Step 2: rodar e ver falhar.** Esperado: FAIL.
- [ ] **Step 3: implementar.** Os índices dos Docs estão em UTF-16. Calcular as posições a partir do `startIndex` dos `textRun` retornados, sem contar caracteres do texto exportado.
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: commit.** `git commit -m "feat(drive): registros REG-SI e aplicação guardada de propostas"`

---

### Task 9: Adaptador do GitHub

**Files:**
- Create: `src/github/app.ts`, `src/github/checks.ts`, `src/github/comments.ts`, `src/github/repos.ts`
- Test: `test/github/comments.test.ts`, `test/github/checks.test.ts`

**Interfaces:**
- Consumes: `ReviewDecision`, `redactSensitive` (Task 3).
- Produces:
  - `createGithubApp(cfg): App`, de `octokit`, com `webhooks.secret`.
  - `CHECK_NAME = 'Verificador de Conformidade'`.
  - `startCheck(octo, repo, headSha): Promise<number>`.
  - `completeCheck(octo, repo, checkRunId, r: { conclusion: 'success'|'failure'; title: string; summary: string }): Promise<void>`.
  - `COMMENT_MARKER = '<!-- verificador-de-conformidade -->'`.
  - `renderPrComment(d: ReviewDecision, opts: { isPublic: boolean; releasedBy?: Array<{ findingId, name, reason }>; analysisFailed?: boolean }): string`.
  - `upsertPrComment(octo, repo, pr, body): Promise<number>`. Edita o comentário com o marcador; se não houver, cria um.
  - `listActiveRepos(octo, org): Promise<Array<{ name, isPrivate, defaultBranch }>>`. Lista só os não arquivados com `verificar-conformidade = true`, via `GET /orgs/{org}/properties/values`.
  - `isMonitored(octo, org, repo): Promise<boolean>`, via `GET /repos/{owner}/{repo}/properties/values`. Propriedade ausente equivale a falso. Repositório arquivado retorna falso mesmo com `verificar-conformidade = true`.
  - `checkoutRef(octo, repo, ref, dir): Promise<void>`. Clone raso via token de instalação no `http.extraheader`; o token nunca vai na URL gravada.
  - `listBypasses(octo, org, since: Date): Promise<Array<{ ruleSuiteId, repo, ref, actor, afterSha, pushedAt }>>`. Usa `GET /orgs/{org}/rulesets/rule-suites?rule_suite_result=bypass`.

- [ ] **Step 1: testes que falham.**
  - `listActiveRepos returns only non-archived repos with verificar-conformidade=true`
  - `isMonitored is false when the property is missing or false`
  - `archived repos are ignored even with verificar-conformidade=true` (tanto em `listActiveRepos` quanto em `isMonitored`)
  - `renderPrComment lists blocking findings with rule, file:line, problem and fix`
  - `renderPrComment for a public repo cites document and section without norm text`
  - `renderPrComment says blockers were resolved when there are none`
  - `renderPrComment shows preexisting findings in their own section`
  - `renderPrComment passes every text through redactSensitive`
  - `upsertPrComment edits the existing marked comment instead of creating another`
- [ ] **Step 2: rodar e ver falhar.** Esperado: FAIL.
- [ ] **Step 3: implementar.** No comentário, os textos voltados à pessoa ficam em português e a correção sugerida vem em cada item.
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: commit.** `git commit -m "feat(github): check, comentário único e consultas da organização"`

---

### Task 10: Adaptador do Slack e notificador com outbox

**Files:**
- Create: `src/slack/blocks.ts`, `src/slack/app.ts`, `src/health/notifier.ts`
- Test: `test/slack/blocks.test.ts`, `test/health/notifier.test.ts`

**Interfaces:**
- Consumes: tabela `outbox` (Task 1), `redactSensitive` (Task 3).
- Produces:
  - Construtores de mensagem (retornam `{ text, blocks }`). Ações: `ACTIONS = { release: 'verificador_release', approve: 'verificador_approve', reject: 'verificador_reject' }`. Formulários: `VIEWS = { release: 'verificador_release_view', reject: 'verificador_reject_view' }`.
    - `blockedPrMessage(input: { repo, pr, url, author, blocking: Finding[] })`, com o botão Liberar e `value` = `repo#pr@sha`.
    - `proposalMessage(p: ProposalDraft & { id })`, com os botões Aprovar e Rejeitar.
    - `dailyReportMessage(input: { added, resolved, persistentCount, overdue, upcoming, remindProposals })`, de uma linha quando não há novos nem resolvidos.
    - `alertMessage(input: { kind: 'credential'|'quota'|'outage'|'recovery'|'bypass'; text })`.
  - `releaseModal(prKey, findings)` (justificativa obrigatória e seleção de achados, todos marcados por padrão) e `rejectModal(proposalId)` (motivo obrigatório).
  - `createSlackApp(cfg, handlers: { onRelease(input: { clickerId, prKey, findingIds, reason }), onApprove(input: { clickerId, proposalId }), onReject(input: { clickerId, proposalId, reason }) }): App`. Cada ação faz `ack()` imediatamente; o trabalho pesado vai para a fila.
  - `channelMembers(client, channelId): Promise<Set<string>>`, com paginação.
  - `createNotifier(deps: { db, post: (msg) => Promise<{ ts }> }): { notify(msg): Promise<void>; flush(): Promise<number> }`. Em falha de envio, grava no `outbox`; `flush` reenvia em ordem.

- [ ] **Step 1: testes que falham.**
  - `dailyReportMessage is a single line when nothing was added or resolved`
  - `blockedPrMessage encodes repo, pr and sha in the button value`
  - `proposalMessage shows current and proposed text`
  - `notify stores the message in outbox when posting fails`
  - `flush sends queued messages in order and marks them sent`
- [ ] **Step 2: rodar e ver falhar.** Esperado: FAIL.
- [ ] **Step 3: implementar.**
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: commit.** `git commit -m "feat(slack): mensagens, formulários e notificador com outbox"`

---

### Task 11: Saúde, credenciais e incidentes

**Files:**
- Create: `src/health/credentials.ts`, `src/health/incidents.ts`
- Test: `test/health/credentials.test.ts`, `test/health/incidents.test.ts`

**Interfaces:**
- Consumes: notificador (Task 10), tabelas `incidents` e `kv` (Task 1).
- Produces:
  - `expiryAlerts(issuedAt: Date, now: Date, validityDays = 365, thresholds = [30, 14, 7, 1]): number | null`. Retorna o limiar que deve ser avisado hoje, ou nulo. O orquestrador grava em `kv` os limiares já avisados para não repetir.
  - `probeCredentials(deps): Promise<Array<{ name: 'claude'|'github'|'slack'|'google'|'postgres'; ok: boolean; detail: string }>>`.
    - `claude`: `claude -p "ok" --max-turns 1` com `analystEnv`.
    - `github`: obter um token de instalação.
    - `slack`: `auth.test`.
    - `google`: `files.get` da pasta.
    - `postgres`: `select 1`.
  - `recordFailure(deps, key: string, text: string)`. Abre um incidente e alerta só se não houver um aberto com a mesma chave. Para GitHub e Google, anexa o estado oficial (`githubstatus.com/api/v2/status.json`, `google.com/appsstatus/dashboard/incidents.json`).
  - `recordRecovery(deps, key)`. Fecha o incidente e alerta a recuperação.

- [ ] **Step 1: testes que falham.**
  - `alerts at 30, 14, 7 and 1 days before expiry and not on other days`
  - `alerts once per incident and once on recovery`
  - `attaches the official status when GitHub calls fail`
  - `probe failure of postgres opens an incident`
- [ ] **Step 2: rodar e ver falhar.** Esperado: FAIL.
- [ ] **Step 3: implementar.**
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: commit.** `git commit -m "feat(health): vencimento de credenciais e incidentes"`

---

### Task 12: Serviços de liberação e de propostas

**Files:**
- Create: `src/services/release.ts`, `src/services/proposals.ts`
- Test: `test/services/release.test.ts`, `test/services/proposals.test.ts`

**Interfaces:**
- Consumes: `authorizeAction` (Task 4), `readEmployees`, `appendReleaseRow`, `appendDocChangeRow`, `applyProposal` (Task 8), `completeCheck`, `upsertPrComment` (Task 9), `channelMembers` e o notificador (Task 10).
- Produces:
  - `releasePullRequest(deps, input: { clickerId, prKey, findingIds, reason }): Promise<{ ok: boolean; message: string }>`.
    - Recusa se o `sha` do botão não for mais o head do PR, com a mensagem "há um commit novo; aguarde a nova revisão".
    - Grava em `pr_releases` e na REG-SI-017; o `kind` vem de `authorizeAction`.
    - Conclui o check como `success` com o título `liberado por <nome>: <justificativa>`.
    - Atualiza o comentário e responde na thread.
  - `publishProposals(deps, drafts: ProposalDraft[], origin: string): Promise<number>`. Calcula o fingerprint (sha256 de `documentFileId|section|kind|proposedText|rows`) e ignora o que já estiver `pending`.
  - `approveProposal(deps, input: { clickerId, proposalId })`. Troca `pending→applying` atomicamente (`UPDATE ... WHERE status='pending' RETURNING`). Se nada mudar, responde "já decidida". Depois aplica, grava na REG-SI-018 e passa o status para `approved` ou `stale`. No `stale`, avisa na thread e enfileira a regeneração na próxima varredura.
  - `rejectProposal(deps, input: { clickerId, proposalId, reason })`.
  - `rejectedReasons(db, limit = 50): Promise<string[]>`, que devolve `documento/seção: motivo` das propostas rejeitadas para os prompts (Tasks 13 e 14).
  - `listReleases(db): Promise<ReleaseRecord[]>`, lida de `pr_releases` para a retroalimentação.

- [ ] **Step 1: testes que falham.**
  - `self release is recorded with kind self_release and the note`
  - `release is refused when the PR head moved`
  - `release by someone not in REG-SI-016 changes nothing`
  - `applies proposal once under concurrent approvals` (dois `approveProposal` em `Promise.all` → `applyProposal` chamado 1 vez, 1 linha na REG-SI-018)
  - `stale proposal is marked stale and announced, not applied`
  - `rejected reason is stored and returned by rejectedReasons()`
  - `publishProposals skips a draft identical to a pending one`
- [ ] **Step 2: rodar e ver falhar.** Esperado: FAIL.
- [ ] **Step 3: implementar.** Testes com `createTestDb()` e fakes dos adaptadores.
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: commit.** `git commit -m "feat(services): liberação de merge e ciclo de propostas"`

---

### Task 13: Revisão de PR

**Files:**
- Create: `src/services/review.ts`
- Test: `test/services/review.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6, 7, 9, 10, 11 (`recordFailure`/`recordRecovery` para os alertas de cota e de credencial, uma vez por incidente), 12.
- Produces: `reviewPullRequest(deps, input: { repo, pr, headSha, baseSha, isPublic, author }): Promise<void>`. Etapas:
  1. `syncPolicies`.
  2. `startCheck`.
  3. `checkoutRef` + `prepareWorkdir`.
  4. `runAnalyst(reviewPrompt(...))`.
  5. Rechecar o head do PR. Se mudou, descartar o resultado sem tocar no check nem no comentário.
  6. `decideReview` com os `releasedIds` do PR.
  7. `completeCheck` + `upsertPrComment`.
  8. Com bloqueantes, `blockedPrMessage`.
  9. Os `docUpdates` e `proposals` vão para `publishProposals(origin = 'PR repo#pr')`.
  10. `normAdjustmentCandidates` gera uma proposta de ajuste quando o gatilho bate.

  Falhas do analista:
  - `quota`: o check fica `in_progress`, o job é reagendado para `resetsAt`, ou para daqui a 1 hora quando o horário não vier, e sai um alerta de cota (uma vez por incidente).
  - `auth`: alerta de credencial e reagendamento.
  - `invalid_output`, `timeout` ou `error`: uma nova tentativa. Na segunda falha, o check vira `failure` com o título "análise não concluída" e sai um alerta.

  Também produz o handler de webhook `onPullRequestEvent(payload)`, que trata `opened`, `reopened`, `synchronize` e `ready_for_review`. Ele ignora repositórios em que `isMonitored` é falso. Nos demais, enfileira `review_pr` com `dedupeKey = repo#pr`, o que cancela o job pendente do commit anterior.

- [ ] **Step 1: testes que falham.**
  - `blocks and comments when a blocking finding is introduced`
  - `succeeds and lists recommendations when there are no blockers`
  - `ignores stale result when head moved`
  - `never succeeds when analyst fails` (invalid_output duas vezes → `failure` "análise não concluída")
  - `on quota keeps the check pending, reschedules at resetsAt and alerts once`
  - `released findings stay released on a new commit`
  - `documentation updates become proposals and do not block`
  - `a synchronize event replaces the pending review job of the same PR`
  - `ignores PR events from repos without verificar-conformidade=true`
- [ ] **Step 2: rodar e ver falhar.** Esperado: FAIL.
- [ ] **Step 3: implementar.**
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: commit.** `git commit -m "feat(services): revisão de PR com bloqueio, comentário e propostas"`

---

### Task 14: Varredura diária e reconciliação

**Files:**
- Create: `src/services/daily.ts`, `src/services/reconcile.ts`
- Test: `test/services/daily.test.ts`, `test/services/reconcile.test.ts`

**Interfaces:**
- Consumes: Tasks 5, 6, 7, 9, 10, 11, 12.
- Produces:
  - `runDailyScan(deps, today: string): Promise<void>`.
    - Para cada `listActiveRepos`, faz checkout da branch padrão e roda `runAnalyst(auditPrompt(...))`.
    - Grava `daily_findings` e calcula `diffFindings` contra o dia anterior.
    - Calcula `deadlinesInWindow` e publica as propostas.
    - Seleciona as propostas `pending` há mais de 7 dias com `reminded_at` nulo, marca `reminded_at` e as inclui na mensagem.
    - Publica `dailyReportMessage`, com os itens persistentes na thread.
    - Se `kv['self_inclusion_proposed']` não existir, inclui no prompt do primeiro repositório o pedido de propor a inclusão do Verificador nas normas (spec 8) e grava a flag.
    - Quando a cota acaba no meio, a varredura continua de onde parou depois da renovação. A posição fica no `payload` do job.
  - `reconcileBypasses(deps, since: Date)`. Para cada bypass ainda fora de `bypasses_seen`:
    - revisa o diff `before...after`;
    - grava a linha "merge sem verificação" com o ator na REG-SI-017;
    - alerta no Slack se houver bloqueantes;
    - marca o bypass como visto.
  - `reconcileOpenPrs(deps)`: todo PR aberto sem check concluído do Verificador no head atual vai para `review_pr`.

- [ ] **Step 1: testes que falham.**
  - `posts only new and resolved findings, persistent ones go to the thread`
  - `posts a single line when nothing changed`
  - `findings of a repo removed from monitoring are reported as out of scope, not resolved`
  - `reminds a pending proposal after 7 days only once`
  - `resumes from the next repo after a quota pause`
  - `records an admin bypass once as "merge sem verificação"`
  - `enqueues reviews for open PRs missing a completed check`
  - `requests the self-inclusion proposal only on the first run`
- [ ] **Step 2: rodar e ver falhar.** Esperado: FAIL.
- [ ] **Step 3: implementar.**
- [ ] **Step 4: rodar e ver passar.** Esperado: PASS.
- [ ] **Step 5: commit.** `git commit -m "feat(services): varredura diária, merges forçados e PRs pendentes"`

---

### Task 15: Composição e agendamento

**Files:**
- Create: `src/main.ts`, `scripts/doctor.ts`
- Test: `test/main.test.ts`

**Interfaces:**
- Consumes: todos os anteriores.
- Produces:
  - `main()`:
    - `loadConfig`;
    - servidor HTTP do `createNodeMiddleware` na `webhookPort`, com `GET /healthz` respondendo 200 enquanto os workers e a conexão do Slack estiverem vivos;
    - Bolt em Socket Mode;
    - workers da fila, com concorrência 2 para `review_pr` e 1 para os demais;
    - agendador: `daily_scan` às 07:00 `America/Sao_Paulo`, `health` a cada 15 minutos, `reconcile` na partida e a cada hora;
    - `notifier.flush()` a cada minuto;
    - encerramento limpo no `SIGTERM`: para de pegar jobs, espera os em andamento por até 60 s e devolve à fila os que não terminaram.
  - `nextDailyRun(now: Date): Date`.
  - `npm run doctor`: roda `probeCredentials`, imprime uma tabela e sai com código diferente de zero se algo falhar. É a checagem de entrada em produção.

- [ ] **Step 1: testes que falham.**
  - `nextDailyRun returns today 07:00 America/Sao_Paulo when now is 06:59`
  - `nextDailyRun returns tomorrow 07:00 when now is 07:30`
  - `jobs in progress on SIGTERM are returned to the queue`
- [ ] **Step 2: rodar e ver falhar.** Esperado: FAIL.
- [ ] **Step 3: implementar `main.ts`, `nextDailyRun` e `scripts/doctor.ts`.**
- [ ] **Step 4: rodar e ver passar.** `npm test` e `npm run typecheck`. Esperado: tudo verde.
- [ ] **Step 5: commit.** `git commit -m "feat: composição, agendamento e doctor"`

---

### Task 16: Docker, docker-compose e implantação

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `deploy/env.example`, `deploy/README.md`

**Interfaces:**
- Consumes: `main()`, `GET /healthz` e `npm run doctor` (Task 15).
- Produces:
  - Imagem `verificador-conformidade`, construída em duas etapas.
    - Build: `node:22-bookworm-slim`, `npm ci`, `tsc`.
    - Execução: `node:22-bookworm-slim`, com `git` e `ca-certificates`.
      - O Claude Code é instalado com versão fixa (`ARG CLAUDE_CODE_VERSION`, `npm i -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`).
      - O plugin `rocketcode` vem de um clone do repositório público `rocket-repos/agent-skills` numa ref fixa (`ARG ROCKETCODE_REF`, uma tag ou um SHA) para `/opt/rocketcode`. Atualizar o plugin exige rebuild deliberado, nunca acontece sozinho.
      - O processo roda como o usuário sem privilégios `verificador`, com `HOME=/home/verificador`.
      - `PLUGIN_DIR=/opt/rocketcode/rocketcode`, `POLICIES_CACHE_DIR=/data/cache`, `WORK_ROOT=/data/work`.
      - `CMD ["node", "dist/main.js"]` e `HEALTHCHECK` com `curl -fsS http://127.0.0.1:${WEBHOOK_PORT}/healthz`.
  - `docker-compose.yml` com um único serviço:
    - `verificador`:
      - roda a imagem acima com `env_file: /etc/verificador-conformidade/env` e `restart: unless-stopped`;
      - grava em volumes nomeados (`verificador-cache:/data/cache`, `verificador-work:/data/work`, `verificador-home:/home/verificador`);
      - tem `read_only: true`, `tmpfs: /tmp`, `security_opt: [no-new-privileges:true]` e `cap_drop: [ALL]`;
      - publica a porta de webhooks **só no loopback** (`127.0.0.1:${WEBHOOK_PORT}:${WEBHOOK_PORT}`), para o túnel ou proxy já existente na VPS encaminhar `/api/github/webhooks`;
      - limita os logs com `logging.options.max-size: 10m` e `max-file: 5`.
    - Sem serviço de Postgres nem de túnel: o banco fica fora da VPS, e a exposição pública dos webhooks é configurada fora do compose.
  - `deploy/env.example`: todas as variáveis de `loadConfig` (Task 1), sem valores. Não lista `ANTHROPIC_API_KEY`, e um comentário explica por quê.
  - Migrações: o serviço roda `db:migrate` na partida antes de iniciar os workers. Com outra instância rodando, ele espera o lock (`pg_advisory_lock`).

- [ ] **Step 1: construir a imagem.** `docker build -t verificador-conformidade --build-arg CLAUDE_CODE_VERSION=<versão> --build-arg ROCKETCODE_REF=<sha> .` Esperado: build sem erros.
- [ ] **Step 2: conferir a imagem.**
  - `docker run --rm verificador-conformidade id -un`: esperado `verificador`.
  - `docker run --rm verificador-conformidade claude --version`: esperado a versão fixada.
  - `docker run --rm verificador-conformidade ls /opt/rocketcode/rocketcode/skills`: esperado `auditoria`, `conformidade`, `politicas` e `revisao`.
  - `docker run --rm -e ANTHROPIC_API_KEY=x verificador-conformidade`: esperado código de saída diferente de zero e mensagem citando `ANTHROPIC_API_KEY`.
- [ ] **Step 3: validar o compose.** `docker compose config`. Esperado: sem erros, um único serviço, e a única porta publicada é a de webhooks ligada a `127.0.0.1`.
- [ ] **Step 4: escrever o `deploy/README.md`.** Ele traz os pré-requisitos da seção 11 da spec, passo a passo:
  - as permissões do GitHub App: Contents e Metadata de leitura; Checks, Commit statuses, Pull requests e Issues de escrita; Administration e Members da organização de leitura;
  - a propriedade personalizada `verificar-conformidade`, booleana, com padrão falso e editável só pelos donos da organização, e os repositórios marcados;
  - o ruleset de organização com alvo `verificar-conformidade = true`, exigindo o check do App, com os administradores no bypass;
  - os escopos do Slack: `chat:write`, `channels:read`, `groups:read` e `users:read` no token do bot, e `connections:write` no token de app;
  - o compartilhamento da pasta com a conta de serviço;
  - a criação das planilhas REG-SI-017 e REG-SI-018, com os cabeçalhos de 7.4 e da seção 8;
  - `claude setup-token`, com a data de emissão em `CLAUDE_TOKEN_ISSUED_AT`;
  - o banco;
  - a URL pública dos webhooks: o túnel ou proxy da VPS deve encaminhar `https://<hostname>/api/github/webhooks` para `http://127.0.0.1:${WEBHOOK_PORT}`. Fica fora do compose.

  E a operação na VPS:
  - instalar o Docker;
  - criar `/etc/verificador-conformidade/env` a partir do `env.example`, com `chmod 600`;
  - `docker compose up -d`;
  - `docker compose exec verificador npm run doctor`;
  - logs com `docker compose logs -f verificador`;
  - atualizar com `git pull`, `docker compose build` e `docker compose up -d`;
  - trocar uma credencial: editar o env e rodar `docker compose up -d --force-recreate verificador`.
- [ ] **Step 5: verificar na VPS.** `docker compose up -d`, depois `docker compose ps`, que deve mostrar o serviço `healthy`. Em seguida, `docker compose exec verificador npm run doctor`, que deve mostrar 5 linhas `ok`. Por fim, reenviar uma entrega de webhook pela página do GitHub App, que deve responder 2xx.
- [ ] **Step 6: piloto.** Marcar `verificar-conformidade = true` só no repositório `agent-skills` e abrir um PR de teste que grava um CPF em `console.log`. Esperado:
  - check `failure`;
  - comentário sem o CPF;
  - mensagem no `#conformidade`;
  - Liberar como autoliberação, com uma linha na REG-SI-017.

  Depois disso, marcar os demais repositórios escolhidos e criar o ruleset com alvo nessa propriedade.
- [ ] **Step 7: commit.** `git commit -m "feat: imagem Docker, compose e guia de implantação"`

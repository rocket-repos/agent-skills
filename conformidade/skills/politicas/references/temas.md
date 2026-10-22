# Onde verificar cada tema no código

Guia de busca, não de regras. O que é exigido e os valores vêm sempre dos documentos lidos no Drive; aqui está só onde procurar e o que costuma denunciar descumprimento. Adaptar os padrões à stack do repositório.

## Sumário

1. Segredos
2. Logs e dados pessoais em logs
3. Autenticação e sessão
4. Autorização e perfis
5. Criptografia em trânsito e cabeçalhos
6. Criptografia em repouso e armazenamento de arquivos
7. Segregação de ambientes e dados de teste
8. Dados pessoais sensíveis (biometria, documentos)
9. Retenção e descarte
10. Trilha de auditoria
11. Monitoramento e alertas
12. Backup e restauração
13. Desenvolvimento seguro, CI e dependências
14. Fornecedores e Inventário de Ativos
15. Operações de tratamento e ROPA
16. Consultas a fontes externas reguladas (Senatran e similares)
17. Ferramentas de IA

Nunca abrir `.env` nem arquivos com valores de segredos: usar `.env.example`, a documentação e o código que lê as variáveis.

## 1. Segredos

- Procurar: chaves no código (`sk_live`, `sk_test`, `AKIA`, `-----BEGIN`, `token =`, `apiKey:`), `.env*` versionados (`git ls-files | grep -i env`), segredos em testes e fixtures.
- Conferir: segredos só por variável de ambiente ou cofre; `.gitignore` cobre `.env`; chaves distintas por ambiente; secret scanning ativo (`.github/`).

## 2. Logs e dados pessoais em logs

- Procurar: `console.log|error|warn`, loggers (`pino`, `winston`), `Sentry.capture*`, mensagens de `Error` que incluem corpo de resposta (`await res.text()`, `JSON.stringify(body)`), interpolação de CPF, e-mail, telefone, token, documento ou imagem.
- Conferir: existe filtro central de mascaramento; logs vão a destino externo (configuração de log drain, transport); retenção e alertas de falha de envio, como a norma pedir.

## 3. Autenticação e sessão

- Procurar: configuração do provedor de autenticação (ex.: `auth.ts`, NextAuth/Auth.js), expiração e renovação de sessão, invalidação no logout e no desligamento, rotas e painéis administrativos.
- Conferir: login individual; MFA nos painéis administrativos que a norma exigir; sessões com expiração; revogação possível em massa.

## 4. Autorização e perfis

- Procurar: server actions, rotas de API, handlers; como o usuário é obtido (da sessão, nunca do corpo da requisição); checagem de que o usuário é parte do recurso.
- Conferir: menor privilégio; papel de banco usado pela aplicação (string de conexão, migrações com outro usuário).

## 5. Criptografia em trânsito e cabeçalhos

- Procurar: `sslmode`, URLs `http://` para serviços externos, `rejectUnauthorized: false`, configuração de cabeçalhos (`next.config.*` `headers()`, middleware, `helmet`), HSTS e CSP.

## 6. Criptografia em repouso e armazenamento de arquivos

- Procurar: colunas binárias (`bytea`, `blob`), uploads, buckets, URLs públicas de arquivos, geração de URL assinada/temporária.
- Conferir: onde os documentos ficam frente ao que a norma determina (armazenamento privado, versionamento, retenção).

## 7. Segregação de ambientes e dados de teste

- Procurar: um único `DATABASE_URL` para dev e testes, testes que truncam tabelas, seeds com dados reais, fixtures com documentos reais versionados, chaves de produção usadas fora de produção.
- Conferir: guarda que impede testes destrutivos fora do banco de teste; dados fictícios.

## 8. Dados pessoais sensíveis (biometria, documentos)

- Procurar: payloads brutos de provedores de verificação de identidade gravados no banco (`raw`, `payload`, `jsonb`) com campos de imagem (`image`, `base64`, `selfie`, `face`), arquivos de documento com foto, OCR guardado.
- Conferir: a plataforma guarda só o que a norma permite; acesso restrito; nada disso em logs.

## 9. Retenção e descarte

- Procurar: jobs agendados (`cron`, `vercel.json` crons, rotas de varredura), `DELETE`/anonimização por data, colunas de data usadas como gatilho.
- Conferir: cada categoria da tabela de retenção tem rotina; categorias de dado novas no código existem na tabela (se não existem, apontar: a política exige incluí-las antes de produção).

## 10. Trilha de auditoria

- Procurar: tabela ou destino de auditoria, permissões (`REVOKE UPDATE, DELETE`), eventos de login, de consulta a fontes reguladas, de consentimento, de ações administrativas.
- Conferir: os campos que a norma lista; bloqueio da operação quando o registro falha, se exigido.

## 11. Monitoramento e alertas

- Procurar: SDK de erros (Sentry), rota de saúde, configuração de monitores e alertas no repositório (IaC), limites por usuário (rate limit).

## 12. Backup e restauração

- Procurar: scripts de exportação e de teste de restauração, documentação de procedimentos.
- Conferir no código só o que é código; janela de PITR e cópias independentes são `infra`.

## 13. Desenvolvimento seguro, CI e dependências

- Procurar: `.github/workflows/`, `dependabot.yml`, CodeQL, secret scanning, proteção de ramo (via `gh api repos/{owner}/{repo}/branches/main/protection`), lockfiles (um só gerenciador, versionado), commits diretos no ramo principal (`git log --first-parent main --no-merges`).
- Conferir: testes automatizados; prazos de correção de alertas abertos (`gh api .../dependabot/alerts`).

## 14. Fornecedores e Inventário de Ativos

- Levantar fornecedores integrados: dependências de SDK, variáveis de ambiente por fornecedor, URLs de API chamadas.
- Cruzar com a planilha Inventário de Ativos: fornecedor no código e fora do inventário é achado; credencial sem linha de chave/segredo também.

## 15. Operações de tratamento e ROPA

- Levantar, pelo schema e pelas migrações, quais dados pessoais são guardados e para quê; pelas integrações, com quem são compartilhados.
- Cruzar com a planilha ROPA: operação no código sem linha no ROPA, dado tratado que o ROPA não lista, ou afirmação do ROPA que o código contradiz (ex.: "a plataforma não guarda X").

## 16. Consultas a fontes externas reguladas

- Procurar: clientes de API da Senatran ou de órgãos similares; consentimento antes da consulta; registro de auditoria por consulta; grupos de informação solicitados; o que é guardado da resposta e por quanto tempo.

## 17. Ferramentas de IA

- Procurar: SDKs de LLM, envio de dados pessoais ou de código de cliente a APIs de IA, chaves de IA.
- Conferir contra as regras de uso de IA da política (ferramentas homologadas, sem dados restritos).

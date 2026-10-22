---
name: auditoria
description: Audita um repositório inteiro da Rocket Code contra a versão vigente das políticas de segurança da informação e privacidade da empresa (lidas na hora do Google Drive), com evidência arquivo:linha para cada achado, divergências entre o que as normas afirmam e o que o código faz, e cruzamento com o Inventário de Ativos e o ROPA. Use quando pedirem para verificar se um projeto cumpre as políticas da Rocket Code, preparar evidências para credenciamento (Senatran, clientes, auditoria), checar conformidade depois de uma norma nova ser publicada, ou levantar o que falta antes de ir para produção.
---

# Auditoria de conformidade

## 1. Carregar as políticas

Invocar a skill `rocketcode:politicas` e seguir até o fim. Sem as políticas lidas nesta execução, não auditar: dizer que a auditoria não foi feita.

## 2. Mapear o repositório

Levantar, sem abrir `.env` nem arquivos com valores de segredos:

- stack, gerenciador de pacotes e lockfiles;
- variáveis de ambiente (`.env.example`, README, código que lê `process.env` ou equivalente);
- integrações com fornecedores (SDKs, URLs de API, webhooks);
- schema e migrações: tabelas e colunas com dados pessoais, sensíveis ou arquivos;
- pontos de log, tratamento de erros e telemetria;
- autenticação, sessão, autorização e painéis administrativos;
- jobs agendados, scripts operacionais e CI (`.github/`).

Em repositórios grandes, dividir os temas entre subagentes em paralelo, passando a cada um a lista de regras do tema e o trecho correspondente de `references/temas.md` da skill `rocketcode:politicas`.

## 3. Verificar cada regra de alcance `código`

Para cada regra, procurar conforme o tema e registrar:

| Campo | Conteúdo |
|---|---|
| Regra | ID da regra (documento + seção) |
| Situação | `conforme`, `não conforme`, `parcial` ou `não verificável no código` |
| Evidência | `arquivo:linha` e um trecho curto; para "conforme", a evidência que comprova |
| Severidade | Crítica, alta, média ou baixa, usando as escalas da matriz de riscos (REL-SI-002) quando ela tiver um risco correspondente |
| Correção | O que mudar, em uma ou duas frases |

Regras de alcance `infra` e `processo` ficam numa lista à parte: "a verificar fora do código", com o que pedir a quem administra (ex.: captura da configuração de MFA da organização).

Não marcar "conforme" por ausência de evidência contrária: sem evidência positiva, a situação é `não verificável no código` ou `parcial`.

## 4. Cruzamentos

1. **Divergências:** frases das normas, do Inventário ou do ROPA que descrevem o sistema (ex.: "a plataforma não armazena biometria", "documentos ficam em armazenamento privado") e que o código contradiz. São os achados mais graves para um auditor externo; listar todos.
2. **Inventário de Ativos:** fornecedor ou credencial presente no código e ausente da planilha.
3. **ROPA:** operação de tratamento ou categoria de dado presente no código e ausente da planilha; categoria de dado sem prazo na política de retenção.

## 5. Relatório

Na conversa, nesta ordem:

1. Fontes usadas (tabela da skill `rocketcode:politicas`, com versões e data da leitura).
2. Resumo: contagem por situação e por severidade.
3. Divergências (seção 4.1).
4. Achados não conformes e parciais, por severidade, com evidência.
5. Cruzamentos com Inventário e ROPA.
6. A verificar fora do código.
7. Conformes, em lista curta com evidência.

Não alterar código durante a auditoria. Oferecer em seguida, sem fazer antes da resposta do usuário:

- publicar o relatório no Drive (pasta de Segurança da Informação, como novo documento REL-SI com o próximo número livre);
- criar tickets no Linear para os achados, um por correção, citando o ID da regra e a evidência, depois de buscar tickets existentes para não duplicar;
- textos prontos para completar as planilhas (o conector do Drive não edita planilhas).

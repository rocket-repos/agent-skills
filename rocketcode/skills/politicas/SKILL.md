---
name: politicas
description: Carrega, direto da pasta oficial no Google Drive, a versão vigente das políticas, normas, planos, procedimentos e registros de segurança da informação e privacidade da Rocket Code (POL-SI, NOR-SI, PLA-SI, PRO-SI, REG-SI, REL-SI, Inventário de Ativos, ROPA) e as converte em regras verificáveis no código. Use antes de auditar, revisar ou escrever código em repositórios da Rocket Code (organização GitHub rocket-repos, como meu-carro-e-seu); quando alguém perguntar o que a política da empresa exige sobre logs, segredos, MFA, autenticação, criptografia, retenção, dados pessoais ou sensíveis, Senatran, backup, monitoramento, CI ou fornecedores; e sempre que outra skill rocketcode pedir.
---

# Políticas da Rocket Code

A única fonte das regras é a pasta de Segurança da Informação no Google Drive:

- ID da pasta: `1mUy_BDM-D4w-JrnSkbYZhWP0xRQik24Q`
- URL: https://drive.google.com/drive/folders/1mUy_BDM-D4w-JrnSkbYZhWP0xRQik24Q

As regras mudam quando um documento é publicado ou revisado, e a execução seguinte deve refleti-las. Por isso:

- Nunca aplicar regra de memória, de resumo antigo, de cópia local ou de exemplo desta skill. Valores (prazos, limiares, métodos de MFA, algoritmos) vêm sempre do documento lido agora.
- Nunca copiar as políticas para o repositório de código.

## 1. Conectar ao Drive

Usar as ferramentas do conector Google Drive (os nomes variam por ambiente; procurar por `search_files`, `read_file_content` e `get_file_metadata`, carregando-as se forem ferramentas adiadas).

Se o conector não existir ou pedir autenticação: parar e pedir ao usuário para rodar `/mcp` e autenticar "claude.ai Google Drive". Não continuar sem as políticas: dizer que a verificação não foi feita.

## 2. Listar a pasta

1. `search_files` com `parentId = '1mUy_BDM-D4w-JrnSkbYZhWP0xRQik24Q'` e `excludeContentSnippets: true`.
2. Seguir `nextPageToken` até não vir mais nenhum; descartar ids repetidos.
3. Subpastas (`mimeType = application/vnd.google-apps.folder`): listar também, recursivamente.
4. Guardar de cada arquivo: id, título, tipo e `modifiedTime`.

### Reuso dentro da mesma conversa

Se as políticas já foram carregadas nesta conversa, listar a pasta de novo (passo barato) e reler só os arquivos novos ou com `modifiedTime` diferente do carregado. Dizer quais mudaram desde a última leitura e aplicar as regras novas imediatamente.

## 3. Ler os documentos

- `read_file_content` em todos os arquivos, em paralelo. Documentos: o texto completo. Planilhas (Inventário de Ativos, ROPA, registros): o conector devolve uma amostra das linhas; se a resposta indicar truncamento, dizer quais linhas não foram vistas.
- De cada documento, extrair do cabeçalho: código (ex.: `POL-SI-001`), versão, data de emissão, classificação e documentos relacionados. Na tabela "Registro de aprovação", verificar se há nome e data preenchidos.

## 4. Decidir o que vale

- Documento sem aprovação preenchida continua valendo como regra a seguir, mas é marcado como "não aprovado" na saída.
- Hierarquia: política (POL) → norma (NOR) → plano e procedimento (PLA, PRO) → formulários, registros e relatórios (FOR, REG, REL). A regra mais específica detalha a geral; não pode afrouxá-la.
- Dois documentos com valores diferentes para a mesma coisa (por exemplo, prazos de retenção): aplicar o mais rigoroso e registrar o conflito na saída, citando os dois trechos.
- Os próprios documentos dizem que exigência contratual ou normativa externa mais rigorosa (por exemplo, da Senatran) prevalece. Respeitar quando o contexto trouxer essa exigência.

## 5. Extrair as regras aplicáveis ao código

Montar uma lista de regras a partir de frases normativas ("deve", "é obrigatório", "é proibido", "nunca", "não é permitido", "somente") e de valores numéricos (prazos, limiares, versões mínimas). Para cada regra:

| Campo | Conteúdo |
|---|---|
| ID | Código do documento + seção, ex.: `NOR-SI-008 §Dados sensíveis nos logs` |
| Regra | O texto do documento, resumido sem alterar o sentido nem os valores |
| Tema | Um dos temas de [references/temas.md](references/temas.md) |
| Alcance | `código` (verificável no repositório), `infra` (configuração de nuvem, contas, consoles) ou `processo` (treinamento, revisões, aprovações) |

Regras de processo entram na lista só para registro: não são verificadas no código.

Quando o objetivo for verificar código (auditoria, revisão ou implementação), ler [references/temas.md](references/temas.md) para saber onde procurar cada tema num repositório.

## 6. Saída

1. Tabela das fontes lidas agora: documento, código, versão, data de emissão, `modifiedTime`, aprovado (sim/não). Indicar a data e hora da leitura.
2. Mudanças desde a leitura anterior nesta conversa, se houver.
3. Conflitos entre documentos.
4. Lista de regras (seção 5), agrupada por tema.

Manter a lista disponível no contexto para a skill que pediu o carregamento. Não gravar a lista em arquivo do repositório.

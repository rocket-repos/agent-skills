---
name: revisao
description: Revisa uma mudança (diff local, branch ou pull request) em repositório da Rocket Code contra a versão vigente das políticas de segurança da informação e privacidade da empresa, lidas na hora do Google Drive, e classifica cada achado como bloqueante ou recomendação, com arquivo:linha e a regra violada. Use antes de abrir ou aprovar um PR, quando pedirem "revise contra as políticas", "isso fere alguma norma?", ou em revisões de código em repositórios da organização rocket-repos que mexem em logs, dados pessoais, autenticação, segredos, fornecedores, schema, armazenamento de arquivos, CI ou integrações reguladas.
---

# Revisão de mudança contra as políticas

## 1. Carregar as políticas

Invocar a skill `rocketcode:politicas`. Sem as políticas lidas nesta execução, não emitir parecer de conformidade.

## 2. Obter a mudança

- PR: `gh pr diff <número>` e `gh pr view <número> --json files,title,body`.
- Branch: `git diff $(git merge-base origin/main HEAD)...HEAD`.
- Sem indicação: alterações não commitadas (`git diff HEAD`) mais as commitadas da branch atual.

Ler o contexto em volta de cada trecho alterado quando o diff sozinho não basta para julgar (ex.: de onde vem o usuário numa ação nova).

## 3. Selecionar as regras

Pelos arquivos e conteúdos alterados, escolher os temas afetados (ver `references/temas.md` da skill `rocketcode:politicas`). Sempre incluir:

- dependência nova ou atualizada → desenvolvimento seguro e fornecedores;
- variável de ambiente nova → segredos, segregação de ambientes e Inventário;
- migração com coluna nova de dado pessoal ou arquivo → retenção, dados sensíveis e ROPA;
- integração nova com fornecedor → Inventário, ROPA e logs;
- mudança em `.github/` → CI e proteção do ramo principal.

## 4. Classificar os achados

- **Bloqueante:** viola regra com "deve", "é obrigatório", "é proibido", "nunca" ou um valor definido (prazo, limiar, versão mínima). Também: mudança que torna falsa uma afirmação das normas, do Inventário ou do ROPA sobre o sistema.
- **Recomendação:** não viola regra escrita, mas enfraquece um controle que a norma descreve.
- **Atualização documental:** a mudança exige atualizar o Inventário, o ROPA ou a tabela de retenção antes de ir para produção (ex.: novo fornecedor, nova categoria de dado). Não é falha de código, mas precisa ser feita.

Cada achado: regra (documento + seção), `arquivo:linha`, o problema em uma frase e a correção sugerida.

## 5. Resposta

1. Fontes usadas (versões e data da leitura).
2. Veredito: "sem bloqueantes" ou a quantidade de bloqueantes.
3. Achados, bloqueantes primeiro.
4. Atualizações documentais necessárias, com o texto pronto para colar.

Em PR, comentar no GitHub só se o usuário pedir. Não alterar o código sem pedido.

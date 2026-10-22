---
name: conformidade
description: Guarda-corpo para escrever código em repositórios da Rocket Code (organização GitHub rocket-repos, como meu-carro-e-seu) seguindo a versão vigente das políticas de segurança da informação e privacidade da empresa, lidas na hora do Google Drive. Use ao planejar ou implementar qualquer mudança que toque logs ou mensagens de erro, dados pessoais ou sensíveis, documentos e arquivos enviados, autenticação, sessão ou autorização, segredos e variáveis de ambiente, novo fornecedor ou dependência, schema de banco, retenção ou jobs agendados, trilha de auditoria, consultas à Senatran ou outras fontes reguladas, pagamentos, webhooks, CI ou configuração de produção.
---

# Implementar em conformidade com as políticas

## 1. Antes de planejar

1. Invocar a skill `rocketcode:politicas`. Se já foram carregadas nesta conversa, ela só relê o que mudou no Drive; aplicar imediatamente qualquer regra nova ou alterada.
2. Selecionar as regras dos temas que a tarefa toca (ver `references/temas.md` da skill `rocketcode:politicas`).
3. Dizer ao usuário, em poucas linhas, quais regras vão moldar a implementação (ID e o essencial), antes de começar.

## 2. Durante a implementação

- Aplicar os valores exatamente como o documento lido define (prazos, limiares, algoritmos, métodos), sem arredondar nem trocar por "boas práticas" próprias.
- Se a tarefa pedida contrariar uma regra: parar e perguntar, apresentando a regra e as alternativas que a cumprem. Não implementar a violação em silêncio nem por conta própria contornar a política.
- Se a regra for ambígua para o caso, escolher a interpretação mais rigorosa e registrar a dúvida na resposta final.
- Se a mudança cria algo que as políticas exigem que esteja documentado antes de produção (fornecedor novo, categoria de dado nova, prazo de retenção ausente, operação de tratamento nova), avisar o usuário e preparar o texto para o Inventário, o ROPA ou a política correspondente. Não versionar políticas no repositório.
- Testes que comprovem a regra quando ela for verificável por teste (ex.: log sem CPF, papel sem permissão de `DELETE`, rotina que descarta no prazo).

## 3. Ao terminar

Antes de dizer que terminou, conferir o próprio diff contra as regras selecionadas, como na skill `rocketcode:revisao`, e informar:

- as regras aplicadas, com a versão do documento usada;
- qualquer regra que não pôde ser cumprida e por quê;
- as atualizações documentais pendentes.

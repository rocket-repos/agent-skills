# Agent Skills Library

A collection of skills for Claude Code and other AI agents. Each skill provides domain-specific knowledge and best practices in a structured format.

## What are Skills?

Skills are markdown files that provide agents with specialized knowledge on specific topics. When activated, they give the agent context about best practices, common patterns, compliance requirements, and optimization strategies for a particular domain.

## Available Skills

| Skill | Description |
|-------|-------------|
| [amazon-associates](./amazon-associates/) | Amazon Associates affiliate program guidance including commission optimization, link strategies, and compliance requirements |

## Plugin `rocketcode`

Skills que aplicam nas bases de código as políticas de segurança da informação e privacidade da Rocket Code. As regras não ficam neste repositório: a cada uso, as skills listam a pasta de Segurança da Informação no Google Drive e leem a versão vigente de cada documento. Uma norma publicada ou revisada vale a partir da execução seguinte.

| Skill | Para quê |
|-------|----------|
| [`rocketcode:politicas`](./rocketcode/skills/politicas/) | Lê os documentos do Drive e os converte em regras verificáveis no código. As outras skills a invocam primeiro. |
| [`rocketcode:auditoria`](./rocketcode/skills/auditoria/) | Audita um repositório inteiro, com evidência por regra e as divergências entre normas e código. |
| [`rocketcode:revisao`](./rocketcode/skills/revisao/) | Revisa um diff, branch ou PR e separa bloqueantes de recomendações. |
| [`rocketcode:conformidade`](./rocketcode/skills/conformidade/) | Aplica as regras enquanto o código é escrito. |

Requer o conector **claude.ai Google Drive** autenticado (`/mcp`) e acesso de leitura à pasta de Segurança da Informação.

```
/plugin install rocketcode --marketplace roket-code/agent-skills
```

## Skill Format

Each skill lives in its own directory with a `SKILL.md` file containing:

```yaml
---
name: skill-name
description: Brief description of the skill and when to use it
last_updated: "YYYY-MM-DD"
doc_source: https://source-documentation-url
---
```

Followed by comprehensive markdown content covering the topic.

## Installation

To use these skills with Claude Code, add them to your `~/.claude/skills/` directory or reference them in your project's `.claude/skills/` folder.

## Contributing

1. Create a new directory with your skill name
2. Add a `SKILL.md` file following the format above
3. Include comprehensive, actionable guidance
4. Submit a pull request

## License

MIT

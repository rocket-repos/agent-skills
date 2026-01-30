# Agent Skills Library

A collection of skills for Claude Code and other AI agents. Each skill provides domain-specific knowledge and best practices in a structured format.

## What are Skills?

Skills are markdown files that provide agents with specialized knowledge on specific topics. When activated, they give the agent context about best practices, common patterns, compliance requirements, and optimization strategies for a particular domain.

## Available Skills

| Skill | Description |
|-------|-------------|
| [amazon-associates](./amazon-associates/) | Amazon Associates affiliate program guidance including commission optimization, link strategies, and compliance requirements |

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

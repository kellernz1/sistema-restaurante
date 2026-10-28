---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the bundled command.md beside this SKILL.md; never fetch rules from the network
2. Read the specified files (or prompt user for files/pattern)
3. Check against the frozen local rules, subject to the project AGENTS.md
4. Output findings in the terse `file:line` format

## Frozen Local Guidelines Source

Read this local file before each review (resolve it relative to this skill directory):

```
command.md
```

Read command.md locally. It is frozen at vercel-labs/web-interface-guidelines commit 434b7f91364665f2f733b310ec54809bf8f37937. Do not use WebFetch or fetch newer rules. The bundled content contains the rules and output format instructions. Project safety, localization and financial authorization rules take precedence.

## Usage

When a user provides a file or pattern argument:
1. Read the bundled command.md from this skill directory without network access
2. Read the specified files
3. Apply the frozen local rules while preserving the project AGENTS.md requirements
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.

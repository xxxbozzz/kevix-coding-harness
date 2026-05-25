# Kevix Engine

DeepSeek-native coding harness for observable long coding tasks.

Kevix provides a CLI and TypeScript engine for:

- memory / probe / auto execution modes
- risk gates and tradeoff escalation
- tool execution for bash, read, write, edit, grep, and glob
- JSON artifacts for reproducible runs
- CLI interaction with approval and tradeoff prompts

## Install From A Local Tarball

```bash
npm install -g ./kevix-engine-0.1.0.tgz
kevix --help
```

## Development

```bash
npm install
npm run build
npm test
```

## Environment

```bash
export DEEPSEEK_API_KEY=...
```

## Examples

```bash
kevix
kevix --mode auto "fix null handling in src/login.ts"
kevix --mode probe --yes "fix API serialization bug"
kevix --json --yes "add input validation" > result.json
kevix smoke tradeoff-b
kevix report latest
kevix doctor
```


#!/usr/bin/env node
// kevix CLI wrapper

async function main() {
  try {
    const cliPath = new URL("../dist/cli/index.js", import.meta.url).pathname;
    await import(cliPath);
    return;
  } catch (error) {
    console.error("Could not load kevix CLI from dist/.");
    console.error("Run `npm run build` before using a linked development checkout.");
    if (error instanceof Error) console.error(error.message);
    process.exit(1);
  }
}

main();

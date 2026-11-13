import { build } from 'esbuild';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '..');
const vaultRoot = path.join(import.meta.dirname, '.generated-performance-vault');
const bundlePath = path.join(vaultRoot, '.parser-benchmark.mjs');
const localExtensions = ['', '.ts', '.js'];

function resolveLocalImport(resolveDir, importPath) {
  const basePath = path.resolve(resolveDir, importPath);
  const candidates = [
    ...localExtensions.map((extension) => `${basePath}${extension}`),
    ...localExtensions.slice(1).map((extension) => path.join(basePath, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

const localModulesPlugin = {
  name: 'month-tasks-benchmark-local-modules',
  setup(context) {
    context.onResolve({ filter: /^benchmark-entry$/ }, () => ({
      path: path.join(projectRoot, 'src', 'parser', 'index.ts'),
      namespace: 'benchmark-file',
    }));
    context.onResolve({ filter: /^\.{1,2}\//, namespace: 'benchmark-file' }, (args) => ({
      path: resolveLocalImport(args.resolveDir, args.path),
      namespace: 'benchmark-file',
    }));
    context.onLoad({ filter: /.*/, namespace: 'benchmark-file' }, (args) => ({
      contents: readFileSync(args.path, 'utf8'),
      loader: 'ts',
      resolveDir: path.dirname(args.path),
    }));
  },
};

async function listMarkdownFiles(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(folder, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
  }));
  return nested.flat();
}

await build({
  entryPoints: ['benchmark-entry'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundlePath,
  logLevel: 'silent',
  plugins: [localModulesPlugin],
});

const { parseFile } = await import(`${pathToFileURL(bundlePath).href}?time=${Date.now()}`);
const files = await listMarkdownFiles(vaultRoot);
const inputs = await Promise.all(files.map(async (filePath) => ({
  filePath,
  content: await readFile(filePath, 'utf8'),
})));

const start = performance.now();
let parsedTasks = 0;
for (const input of inputs) {
  const vaultPath = path.relative(vaultRoot, input.filePath).replaceAll('\\', '/');
  parsedTasks += parseFile(vaultPath, input.content).length;
}
const elapsedMs = performance.now() - start;

console.log(JSON.stringify({
  notes: inputs.length,
  tasks: parsedTasks,
  elapsedMs: Number(elapsedMs.toFixed(3)),
}, null, 2));

if (inputs.length !== 300 || parsedTasks !== 2_000) process.exitCode = 1;

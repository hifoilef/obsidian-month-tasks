import { access, copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(projectRoot, 'deploy.config.json');
const requiredFiles = ['main.js', 'manifest.json', 'styles.css'];

/** Stops deployment with one clear Chinese error. */
function fail(message) {
  console.error(`部署失败：${message}`);
  process.exitCode = 1;
}

async function deploy() {
  try {
    await access(configPath, constants.R_OK);
  } catch {
    fail('找不到 deploy.config.json。请复制 deploy.config.example.json 并填写 vaultPath。');
    return;
  }

  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch {
    fail('deploy.config.json 不是有效的 JSON 文件。');
    return;
  }

  if (typeof config.vaultPath !== 'string' || config.vaultPath.trim() === '') {
    fail('deploy.config.json 中的 vaultPath 必须是非空的测试库完整路径。');
    return;
  }

  const vaultPath = path.resolve(config.vaultPath);
  try {
    if (!(await stat(vaultPath)).isDirectory()) {
      fail(`测试库路径不是文件夹：${vaultPath}`);
      return;
    }
  } catch {
    fail(`测试库路径不存在：${vaultPath}`);
    return;
  }

  for (const fileName of requiredFiles) {
    const sourcePath = path.join(projectRoot, fileName);
    try {
      await access(sourcePath, constants.R_OK);
    } catch {
      fail(`缺少构建文件 ${fileName}，请先检查 npm run build 的输出。`);
      return;
    }
  }

  const pluginPath = path.join(vaultPath, '.obsidian', 'plugins', 'month-tasks');
  await mkdir(pluginPath, { recursive: true });
  await Promise.all(requiredFiles.map((fileName) => copyFile(
    path.join(projectRoot, fileName),
    path.join(pluginPath, fileName),
  )));

  console.log(`部署成功：已复制 ${requiredFiles.join('、')} 到 ${pluginPath}`);
}

deploy().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

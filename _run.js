/* 用 Node spawn 运行 git，完整捕获 stdout/stderr —— 绕开 PowerShell 对原生命令输出的吞没
   用法：node _run.js <工作目录> <输出文件> <git 参数...>   */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const dir = process.argv[2];
const outFile = process.argv[3];
const args = process.argv.slice(4);

const r = spawnSync('git', ['-C', dir, ...args], {
  encoding: 'utf8',
  env: Object.assign({}, process.env, {
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    GIT_ASKPASS: 'echo',
    LC_ALL: 'C.UTF-8'
  }),
  windowsHide: true,
  timeout: 90000
});

const lines = [];
lines.push('cmd    : git ' + args.join(' '));
lines.push('status : ' + r.status);
lines.push('signal : ' + r.signal);
lines.push('error  : ' + (r.error ? r.error.message : '(none)'));
lines.push('--- STDOUT ---');
lines.push(r.stdout || '(empty)');
lines.push('--- STDERR ---');
lines.push(r.stderr || '(empty)');

writeFileSync(outFile, lines.join('\n'), 'utf8');

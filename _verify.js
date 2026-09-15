/* 从远程核对推送结果 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const dir = process.argv[2];
const outFile = process.argv[3];

function run(...args) {
  const r = spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8', windowsHide: true, timeout: 60000,
    env: Object.assign({}, process.env, {
      GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', GIT_ASKPASS: 'echo'
    })
  });
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), code: r.status };
}

const L = [];
const p = s => L.push(s);

const ls = run('ls-remote', '--heads', 'origin');
p('=== 远程 main 指向 ===');
p(ls.out || ls.err);

run('fetch', 'origin', 'main');
const head = run('rev-parse', 'main');
const rhead = run('rev-parse', 'refs/remotes/origin/main');
p('');
p('=== 本地 vs 远程 HEAD ===');
p('  本地 main        : ' + head.out);
p('  远程 origin/main : ' + rhead.out);
p('  是否一致         : ' + (head.out === rhead.out ? '是 ✓' : '否 ✗'));

const tree = run('ls-tree', '-r', '--name-only', 'refs/remotes/origin/main');
const files = tree.out ? tree.out.split('\n') : [];
p('');
p('=== 远程 main 上的文件（共 ' + files.length + ' 个）===');
files.forEach(f => p('  ' + f));

const local = run('ls-files');
const localFiles = local.out ? local.out.split('\n') : [];
const missing = localFiles.filter(f => files.indexOf(f) < 0);
p('');
p('=== 差异 ===');
p('  本地跟踪文件      : ' + localFiles.length);
p('  远程文件          : ' + files.length);
p('  未推上去的文件    : ' + (missing.length ? missing.join(', ') : '无 ✓'));

const priv = files.filter(f => /^\.workbuddy\//.test(f) || /UE5/.test(f) || /^_/.test(f));
p('');
p('  私有/临时文件是否误传 : ' + (priv.length ? '有！' + priv.join(', ') : '没有 ✓'));

const log = run('log', 'refs/remotes/origin/main', '--oneline', '-5');
p('');
p('=== 远程提交历史 ===');
log.out.split('\n').forEach(l => p('  ' + l));

const stat = run('show', '--stat', '--oneline', 'refs/remotes/origin/main');
p('');
p('=== 最新提交改动统计 ===');
p(stat.out);

writeFileSync(outFile, L.join('\n'), 'utf8');

import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { fail, text } from './security.js';

const exec = promisify(execFile);
const specs = {
  js: { image: 'TITAN_RUNNER_NODE_IMAGE', args: ['node', '--max-old-space-size=48', '-'] },
  py: { image: 'TITAN_RUNNER_PYTHON_IMAGE', args: ['python3', '-I', '-B', '-'] }
};
export const runtimeLimits = [
  '--network=none', '--memory=128m', '--memory-swap=128m', '--cpus=.5', '--pids-limit=24', '--read-only',
  '--tmpfs=/tmp:rw,noexec,nosuid,size=8m', '--security-opt=no-new-privileges', '--cap-drop=ALL', '--user=65534:65534',
  '--init', '--ulimit=nofile=128:128', '--ulimit=core=0:0', '--pull=never', '--entrypoint='
];

export function verifiedEngine(info) {
  return info.CgroupVersion === '2' && info.MemoryLimit === true && info.SwapLimit === true &&
    info.CPUCfsQuota === true && info.PidsLimit === true && info.SecurityOptions?.some(value => value === 'name=rootless') &&
    info.SecurityOptions?.some(value => value.startsWith('name=seccomp') && !value.includes('unconfined'));
}

export function sandbox(env = process.env) {
  const socket = env.TITAN_RUNNER_SOCKET;
  const images = Object.fromEntries(Object.entries(specs).filter(([, spec]) => env[spec.image]).map(([lang, spec]) => [lang, env[spec.image]]));
  if (!socket && Object.keys(images).length) throw new Error('Configure o socket Docker rootless para habilitar o executor.');
  if (socket && !/^\/[\w./-]+\.sock$/.test(socket)) throw new Error('Informe o caminho absoluto do socket do executor.');
  if (Object.values(images).some(image => !/^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(image))) {
    throw new Error('As imagens do executor devem ser fixadas por digest SHA-256.');
  }
  const fixedArgs = ['--host', 'unix://' + socket];
  const childEnv = { PATH: env.PATH || '/usr/bin:/bin' };
  const docker = args => exec('docker', [...fixedArgs, ...args], { timeout: 4000, maxBuffer: 80000, env: childEnv });
  const active = new Set();
  const languages = Object.keys(images);
  async function ensureEngine() {
    try {
      const { stdout } = await docker(['info', '--format', '{{json .}}']);
      if (verifiedEngine(JSON.parse(stdout))) return;
    } catch {}
    throw fail(503, 'Executor indisponível. O ambiente precisa aplicar os limites de isolamento.');
  }
  async function execute(name, source, signal) {
    return new Promise((resolve, reject) => {
      const cli = spawn('docker', [...fixedArgs, 'start', '-a', '-i', name], { env: childEnv });
      let size = 0;
      let stop;
      const parts = [];
      const stderr = [];
      const cancel = reason => { if (!stop) { stop = reason; cli.kill('SIGKILL'); } };
      const abort = () => cancel('cancelled');
      const timer = setTimeout(() => cancel('timeout'), 6000);
      const collect = bucket => data => {
        size += data.length;
        if (size > 32000) return cancel('output_limit');
        bucket.push(data);
      };
      cli.stdout.on('data', collect(parts));
      cli.stderr.on('data', collect(stderr));
      cli.stdin.on('error', () => {});
      cli.once('error', () => reject(fail(503, 'Não foi possível iniciar a execução isolada.')));
      cli.once('close', code => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        const output = Buffer.concat(parts).toString('utf8');
        if (stop) return resolve({ type: 'tool', status: stop, output, error: '' });
        if (code === 124 || code === 137) return resolve({ type: 'tool', status: 'timeout', output, error: '' });
        const error = Buffer.concat(stderr).toString('utf8');
        resolve({ type: 'tool', status: code === 0 ? 'done' : 'failed', code, output, error });
      });
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      cli.stdin.end(source);
    });
  }
  return {
    languages,
    async run(owner, lang, input, signal) {
      if (!Object.hasOwn(images, lang)) throw fail(503, 'Executor não habilitado para esta linguagem.');
      if (active.has(owner) || active.size >= 4) throw fail(429, 'Já existe uma execução em andamento ou o servidor está ocupado.');
      const source = text(input, 120000, 'Código', { trim: false });
      const name = 'titan-run-' + randomUUID();
      active.add(owner);
      try {
        await ensureEngine();
        signal.throwIfAborted();
        await docker(['create', '--name', name, '-i', ...runtimeLimits, images[lang], 'timeout', '-k', '1s', '5s', ...specs[lang].args]);
        signal.throwIfAborted();
        return await execute(name, source, signal);
      } catch (error) {
        if (error.status) throw error;
        throw fail(503, 'Não foi possível preparar a execução isolada.');
      } finally {
        try { await docker(['rm', '-f', name]); }
        catch { /* O contêiner pode não ter sido criado. */ }
        active.delete(owner);
      }
    }
  };
}

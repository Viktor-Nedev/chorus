// Docker хостинг за генерираните проекти. Всеки fullstack проект получава
// собствен изолиран контейнер (node:20-alpine, memory/cpu лимити, авто-
// почистване). Static проектите не се нуждаят от Docker — сервират се
// директно от главния сървър през /hosted/:id.
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');

const docker = new Docker(); // Windows: named pipe по подразбиране
const GENERATED_DIR = path.join(__dirname, '../generated');

// projectId → { containerId, port, url }
const running = new Map();
let nextPort = 4100;

let availCache = { value: null, at: 0 };
async function isAvailable() {
  if (Date.now() - availCache.at < 10000 && availCache.value !== null) return availCache.value;
  try {
    await docker.ping();
    availCache = { value: true, at: Date.now() };
  } catch {
    availCache = { value: false, at: Date.now() };
  }
  return availCache.value;
}

async function ensureImage(image) {
  try {
    await docker.getImage(image).inspect();
  } catch {
    // pull при първо използване
    await new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err2) => (err2 ? reject(err2) : resolve()));
      });
    });
  }
}

async function deploy(projectId) {
  const projectDir = path.join(GENERATED_DIR, projectId);
  if (!fs.existsSync(projectDir)) throw new Error('Project not found');
  const hasBackend = fs.existsSync(path.join(projectDir, 'backend', 'server.js'));

  if (!hasBackend) {
    // Static: сервира се от главния сървър, без контейнер
    return {
      type: 'static',
      url: `http://localhost:${process.env.PORT || 3001}/hosted/${projectId}/`,
    };
  }

  if (!(await isAvailable())) {
    const err = new Error('docker_unavailable');
    err.code = 'docker_unavailable';
    throw err;
  }

  // Ако вече върви — върни съществуващия
  const existing = running.get(projectId);
  if (existing) {
    try {
      const c = docker.getContainer(existing.containerId);
      const info = await c.inspect();
      if (info.State.Running) return { type: 'docker', ...existing };
    } catch {
      /* контейнерът е умрял — продължи с нов deploy */
    }
    running.delete(projectId);
  }

  const image = 'node:20-alpine';
  await ensureImage(image);

  const hostPort = nextPort++;
  // Windows path → Docker bind mount (Docker Desktop поема конверсията)
  const container = await docker.createContainer({
    Image: image,
    name: `webforge-${projectId}`,
    Cmd: ['sh', '-c', 'cp -r /project /app && cd /app/backend && npm install --omit=dev --no-audit --no-fund && node server.js'],
    Env: ['PORT=3000', 'NODE_ENV=production'],
    ExposedPorts: { '3000/tcp': {} },
    HostConfig: {
      Binds: [`${projectDir}:/project:ro`], // read-only mount; работим върху копие
      PortBindings: { '3000/tcp': [{ HostPort: String(hostPort) }] },
      Memory: 256 * 1024 * 1024,
      NanoCpus: 500000000, // 0.5 CPU
      AutoRemove: true,
    },
  });
  await container.start();

  const entry = { containerId: container.id, port: hostPort, url: `http://localhost:${hostPort}` };
  running.set(projectId, entry);
  return { type: 'docker', ...entry };
}

async function stop(projectId) {
  const entry = running.get(projectId);
  if (!entry) {
    // Пробвай по име (например след рестарт на сървъра)
    try {
      const c = docker.getContainer(`webforge-${projectId}`);
      await c.stop({ t: 3 });
    } catch {
      /* няма такъв — ок */
    }
    return { stopped: true };
  }
  try {
    await docker.getContainer(entry.containerId).stop({ t: 3 });
  } catch {
    /* вече спрян */
  }
  running.delete(projectId);
  return { stopped: true };
}

function status(projectId) {
  return running.get(projectId) || null;
}

module.exports = { isAvailable, deploy, stop, status };

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const commandsDir = path.join(__dirname, '..', 'commands');
const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js')).sort();

let failed = 0;
for (const file of files) {
  const absolute = path.join(commandsDir, file);
  const probeCode = `const c=require(${JSON.stringify(absolute)}); if(!c?.data || typeof c.execute!=='function') process.exit(2); console.log(JSON.stringify(c.data.toJSON()));`;
  const probe = spawnSync(process.execPath, ['-e', probeCode], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  if (probe.error || probe.status !== 0) {
    failed++;
    const reason = probe.error?.code === 'ETIMEDOUT' ? 'timed out after 10s' : (probe.stderr || `exit code ${probe.status}`).trim();
    console.error(`[COMMAND VALIDATION FAILED] ${file}: ${reason}`);
    continue;
  }
  console.log(`[COMMAND VALIDATION OK] ${file}`);
}
if (failed > 0) { console.error(`Command module validation failed: ${failed}/${files.length}`); process.exit(1); }
console.log(`All ${files.length} command modules loaded successfully.`);

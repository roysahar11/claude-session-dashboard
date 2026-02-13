import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['express'],
  sourcemap: false,
};

await Promise.all([
  build({ ...shared, entryPoints: ['src/hook-handler.ts'], outfile: 'dist/hook-handler.js' }),
  build({ ...shared, entryPoints: ['src/pin.ts'], outfile: 'dist/pin.js' }),
  build({ ...shared, entryPoints: ['src/server.ts'], outfile: 'dist/server.js' }),
]);

console.log('Build complete.');

const path = require('path')

async function start() {
  await require('esbuild').build({
    entryPoints: ['src/index.ts', 'src/worker.ts'],
    bundle: true,
    minify: process.env.NODE_ENV === 'production',
    sourcemap: process.env.NODE_ENV === 'development',
    mainFields: ['module', 'main'],
    external: ['coc.nvim'],
    platform: 'node',
    target: 'node14.14',
    outdir: path.resolve(__dirname, 'lib')
  })
}

start().catch(e => {
  console.error(e)
})

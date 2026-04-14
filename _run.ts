import { run } from './src/index.js'
run(['--config', 'config.yaml']).then(code => {
  console.log('[wrapper] Exit code:', code)
  process.exit(code)
}).catch(err => {
  console.error('[wrapper] Fatal:', err)
  process.exit(1)
})

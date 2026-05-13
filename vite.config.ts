import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const DATA_FILE = path.resolve(__dirname, 'graph-data.json')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'graph-file-api',
      configureServer(server) {
        server.middlewares.use('/api/graph', (req, res) => {
          if (req.method === 'GET') {
            if (fs.existsSync(DATA_FILE)) {
              res.setHeader('Content-Type', 'application/json')
              res.end(fs.readFileSync(DATA_FILE, 'utf-8'))
            } else {
              res.statusCode = 404
              res.end('null')
            }
          } else if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', () => {
              fs.writeFileSync(DATA_FILE, body, 'utf-8')
              res.statusCode = 200
              res.end('ok')
            })
          } else {
            res.statusCode = 405
            res.end()
          }
        })
      },
    },
  ],
  optimizeDeps: {
    include: ['react-force-graph-2d', 'force-graph'],
  },
})

import http from 'http'

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ status: 'ok', message: 'Use /api/* endpoints' }))
})

const port = process.env.PORT || 3000
server.listen(port, () => {
  console.log(`Server running on port ${port}`)
})

export default server

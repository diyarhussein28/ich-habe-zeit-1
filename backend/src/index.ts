import 'dotenv/config'
import { buildApp } from './app.js'
import { env } from './config/env.js'
import { startScheduledJobs } from './jobs/scheduler.js'

async function start() {
  const app = await buildApp()

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    console.log(`Ich habe Zeit API running on port ${env.PORT}`)
    startScheduledJobs()
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()

import 'dotenv/config'
import { prisma } from '../config/prisma.js'
import * as orderService from '../services/order.service.js'
import * as ratingService from '../services/rating.service.js'

// Continuation of seed_marketplace_demo.ts: that script crashed partway through
// (Neon transaction-pool timeout, P2028) after already closing 27 orders. This
// finishes the job against the data it left behind — push the one order still
// stuck at AWAITING_PAYMENT forward, then rate every RELEASED demo order.

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 4): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      const isTransient = err instanceof Error && /P2028|Unable to start a transaction/.test(err.message)
      if (!isTransient || i === attempts - 1) {
        console.error(`  ✗ ${label}:`, err instanceof Error ? err.message : err)
        return null
      }
      const backoff = 1500 * (i + 1)
      console.log(`  … ${label} hit a transient DB error, retrying in ${backoff}ms`)
      await sleep(backoff)
    }
  }
  return null
}

async function main() {
  const DEMO_FILTER = { user: { email: { contains: '@ichhabezeit-demo.de' } } }

  console.log('── Pushing the stuck AWAITING_PAYMENT order forward ──')
  const stuck = await prisma.order.findFirst({
    where: { status: 'AWAITING_PAYMENT', request: { customer: DEMO_FILTER } },
    include: { offer: { include: { provider: true } }, request: { include: { customer: true } } },
  })
  if (stuck) {
    await withRetry(async () => {
      const releaseDeadline = new Date()
      releaseDeadline.setHours(releaseDeadline.getHours() + 3)
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: stuck.id },
          data: { status: 'IN_PROGRESS', paymentStatus: 'CAPTURED', releaseDeadline, mangopayEscrowWalletId: 'simulated' },
        })
        await tx.serviceRequest.update({ where: { id: stuck.requestId }, data: { status: 'IN_PROGRESS' } })
        await tx.orderStatusHistory.create({ data: { orderId: stuck.id, status: 'IN_PROGRESS', triggeredBy: 'demo_seed_resume' } })
      })
    }, `pay-simulate order ${stuck.id}`)
    await sleep(400)
    await withRetry(
      () => orderService.markComplete(stuck.id, stuck.offer.provider.userId, [], 'Arbeit wie vereinbart abgeschlossen.'),
      `markComplete order ${stuck.id}`
    )
    await sleep(400)
    await withRetry(
      () => orderService.releasePayment(stuck.id, stuck.request.customer.userId),
      `releasePayment order ${stuck.id}`
    )
    console.log('  done.')
  } else {
    console.log('  none found — already resolved.')
  }

  console.log('── Rating every RELEASED demo order ──')
  const releasedOrders = await prisma.order.findMany({
    where: {
      status: 'RELEASED',
      request: { customer: DEMO_FILTER },
    },
    include: {
      offer: { include: { provider: true } },
      request: { include: { customer: true } },
    },
  })

  const RATING_COMMENTS: Record<number, string[]> = {
    5: ['Absolut top, jederzeit wieder!', 'Schnell, sauber, freundlich — perfekt.', 'Beste Erfahrung bisher.'],
    4: ['Sehr gute Arbeit, kleine Verzögerung beim Start.', 'Zufrieden, gerne wieder.'],
    3: ['In Ordnung, nichts Besonderes.', 'Ergebnis okay, Kommunikation ausbaufähig.'],
    2: ['Leider nicht wie besprochen, musste nachbessern.', 'Verspätet und wenig Rückmeldung.'],
    1: ['Sehr enttäuschend, nicht zu empfehlen.', 'Arbeit war mangelhaft.'],
  }

  const providerIds = [...new Set(releasedOrders.map((o) => o.offer.provider.userId))]
  const providerBias = new Map<string, number>()
  for (const id of providerIds) providerBias.set(id, Math.random() * 2 - 1)

  let ratingCount = 0
  for (const order of releasedOrders) {
    const providerUserId = order.offer.provider.userId
    const bias = providerBias.get(providerUserId) ?? 0
    const roll = Math.random() + bias * 0.6
    const score = roll > 0.75 ? 5 : roll > 0.45 ? 4 : roll > 0.15 ? 3 : roll > -0.15 ? 2 : 1

    const result = await withRetry(
      () =>
        ratingService.submitRating({
          orderId: order.id,
          raterUserId: order.request.customer.userId,
          score,
          comment: pick(RATING_COMMENTS[score]),
        }),
      `rate order ${order.id}`
    )
    if (result) ratingCount++
    await sleep(150) // spread load across the Neon pool
  }
  console.log(`Submitted ${ratingCount}/${releasedOrders.length} ratings.`)

  console.log('── Top Dienstleister leaderboard ──')
  const top = await prisma.providerProfile.findMany({
    where: { totalReviews: { gt: 0 } },
    orderBy: [{ averageRating: 'desc' }, { totalReviews: 'desc' }],
    take: 10,
    include: { user: { select: { displayName: true } } },
  })
  for (const p of top) {
    const completedJobs = await prisma.order.count({ where: { status: 'RELEASED', offer: { providerId: p.id } } })
    console.log(`  ${p.user.displayName.padEnd(20)} avg=${p.averageRating.toFixed(2)} reviews=${p.totalReviews} completedJobs=${completedJobs}`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma.js'
import * as requestService from '../services/request.service.js'
import * as offerService from '../services/offer.service.js'
import * as orderService from '../services/order.service.js'
import * as ratingService from '../services/rating.service.js'

const DEMO_PASSWORD = 'Demo1234!'

const CITIES: { city: string; plz: string; lat: number; lon: number }[] = [
  { city: 'Berlin', plz: '10115', lat: 52.532, lon: 13.3849 },
  { city: 'München', plz: '80331', lat: 48.1351, lon: 11.582 },
  { city: 'Hamburg', plz: '20095', lat: 53.5511, lon: 9.9937 },
  { city: 'Köln', plz: '50667', lat: 50.9375, lon: 6.9603 },
  { city: 'Frankfurt am Main', plz: '60311', lat: 50.1109, lon: 8.6821 },
  { city: 'Stuttgart', plz: '70173', lat: 48.7758, lon: 9.1829 },
  { city: 'Düsseldorf', plz: '40210', lat: 51.2277, lon: 6.7735 },
  { city: 'Leipzig', plz: '04109', lat: 51.3397, lon: 12.3731 },
  { city: 'Dortmund', plz: '44135', lat: 51.5136, lon: 7.4653 },
  { city: 'Essen', plz: '45127', lat: 51.4556, lon: 7.0116 },
]

const FIRST_NAMES = [
  'Lukas', 'Anna', 'Felix', 'Marie', 'Jonas', 'Laura', 'Tim', 'Sophie', 'Paul', 'Lena',
  'Max', 'Julia', 'Niklas', 'Hannah', 'Leon', 'Emma', 'David', 'Lea', 'Simon', 'Nina',
  'Jan', 'Sarah', 'Tobias', 'Clara', 'Philipp', 'Katharina', 'Moritz', 'Johanna', 'Erik', 'Melanie',
]
const LAST_NAMES = [
  'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann',
  'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger',
  'Hofmann', 'Lange', 'Schmitt', 'Werner', 'Krause', 'Meier', 'Lehmann', 'Huber', 'Mayer', 'Herrmann',
]

const BIOS = [
  'Über 8 Jahre Erfahrung, zuverlässig und termintreu.',
  'Meisterbetrieb mit Fokus auf saubere, schnelle Arbeit.',
  'Freundlich, flexibel und immer pünktlich.',
  'Spezialisiert auf Privathaushalte und kleine Gewerbe.',
  'Familienbetrieb seit drei Generationen.',
  'Schnelle Reaktionszeit, faire Preise.',
  'Qualität statt Quantität — ich nehme mir Zeit für jeden Auftrag.',
  'Zertifiziert und vollversichert.',
]

type CreatedUser = { userId: string; displayName: string; role: 'CUSTOMER' | 'PROVIDER'; hasCustomerProfile: boolean }

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const out: T[] = []
  for (let i = 0; i < n && copy.length > 0; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0])
  }
  return out
}
function randomBetween(min: number, max: number) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100
}
function futureDate(daysFromNow: number) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d
}

async function main() {
  console.log('── Seeding 30 demo users ──')

  const categories = await prisma.category.findMany({ where: { isActive: true } })
  if (categories.length === 0) throw new Error('No active categories found — seed categories first.')

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12)

  // Role plan: 10 customer-only, 12 provider-only, 8 dual-role (provider account
  // with a secondary customer profile, like the and123 test account).
  const roleplan: ('CUSTOMER' | 'PROVIDER' | 'DUAL')[] = [
    ...Array(10).fill('CUSTOMER'),
    ...Array(12).fill('PROVIDER'),
    ...Array(8).fill('DUAL'),
  ]

  const created: CreatedUser[] = []
  const usedNames = new Set<string>()

  for (let i = 0; i < 30; i++) {
    let first = pick(FIRST_NAMES)
    let last = pick(LAST_NAMES)
    let nameKey = `${first} ${last}`
    let attempts = 0
    while (usedNames.has(nameKey) && attempts < 20) {
      first = pick(FIRST_NAMES)
      last = pick(LAST_NAMES)
      nameKey = `${first} ${last}`
      attempts++
    }
    usedNames.add(nameKey)

    const displayName = `${first} ${last}`
    const email = `demo.${first.toLowerCase()}.${last.toLowerCase()}.${i}@ichhabezeit-demo.de`
    const phone = `+4915${(170000000 + i * 137).toString().padStart(9, '0')}`
    const kind = roleplan[i]
    const role: 'CUSTOMER' | 'PROVIDER' = kind === 'CUSTOMER' ? 'CUSTOMER' : 'PROVIDER'

    const user = await prisma.user.create({
      data: {
        email,
        phone,
        passwordHash,
        role,
        displayName,
        emailVerified: true,
        phoneVerified: true,
        verificationStatus: 'KYC_VERIFIED',
        notificationSettings: { create: {} },
      },
    })

    let hasCustomerProfile = false
    if (role === 'CUSTOMER') {
      await prisma.customerProfile.create({ data: { userId: user.id } })
      hasCustomerProfile = true
    } else {
      const home = pick(CITIES)
      const providerCategories = pickN(categories, 1 + Math.floor(Math.random() * 3))
      await prisma.providerProfile.create({
        data: {
          userId: user.id,
          bio: pick(BIOS),
          languages: ['Deutsch', ...(Math.random() > 0.6 ? ['Englisch'] : [])],
          serviceAreas: { create: { homePlz: home.plz, radiusKm: 30, lat: home.lat, lon: home.lon } },
          providerCategories: {
            create: providerCategories.map((c) => ({ categoryId: c.id, isVerified: true })),
          },
        },
      })
      if (kind === 'DUAL') {
        await prisma.customerProfile.create({ data: { userId: user.id } })
        hasCustomerProfile = true
      }
    }

    created.push({ userId: user.id, displayName, role, hasCustomerProfile })
  }

  const customers = created.filter((u) => u.hasCustomerProfile)
  const providers = created.filter((u) => u.role === 'PROVIDER')
  console.log(`Created ${created.length} users — ${customers.length} can post requests, ${providers.length} are providers.`)

  // Map provider userId -> categoryIds they're qualified for, for realistic matching.
  const providerCategoryMap = new Map<string, string[]>()
  for (const p of providers) {
    const profile = await prisma.providerProfile.findUnique({
      where: { userId: p.userId },
      include: { providerCategories: true },
    })
    providerCategoryMap.set(p.userId, profile?.providerCategories.map((pc) => pc.categoryId) ?? [])
  }

  const REQUEST_TITLES: Record<string, string[]> = {
    painting: ['Wohnzimmer streichen', 'Fassade neu streichen', 'Kinderzimmer streichen'],
    plumbing: ['Wasserhahn tropft', 'Rohrbruch im Bad', 'Neue Armatur einbauen'],
    cleaning: ['Wohnung tiefenreinigen', 'Fenster putzen', 'Büro reinigen lassen'],
    'cleaning-home': ['Wohnungsreinigung nach Auszug', 'Wöchentliche Haushaltsreinigung'],
    'cleaning-office': ['Büroreinigung wöchentlich', 'Praxis reinigen lassen'],
    'cleaning-windows': ['Fensterreinigung Mehrfamilienhaus'],
    'cleaning-construction': ['Baureinigung nach Renovierung'],
    moving: ['Umzug 3-Zimmer-Wohnung', 'Kleiner Umzug innerhalb der Stadt'],
    'moving-furniture': ['Sofa transportieren', 'Kühlschrank transportieren'],
    'moving-packing': ['Packhilfe für Umzug'],
    'moving-assembly': ['IKEA-Schrank aufbauen', 'Bett aufbauen'],
    carpentry: ['Regal nach Maß bauen', 'Tür einpassen'],
    electrical: ['Steckdosen nachrüsten', 'Lampe anschließen'],
    gardening: ['Rasen mähen und Hecke schneiden', 'Garten winterfest machen'],
    'home-maintenance': ['Kleine Reparaturen im Haushalt', 'Silikonfugen erneuern'],
    tutoring: ['Nachhilfe Mathematik', 'Nachhilfe Deutsch'],
    'tutoring-school': ['Nachhilfe für die Abschlussprüfung'],
    'tutoring-languages': ['Englischunterricht für Anfänger'],
    'tutoring-music': ['Gitarrenunterricht für Anfänger'],
    errands: ['Einkauf erledigen', 'Paket abholen und liefern'],
  }
  const DESCRIPTIONS = [
    'Bitte um ein faires Angebot, Termin ist flexibel innerhalb der nächsten zwei Wochen.',
    'Suche zuverlässige Unterstützung, gerne mit Referenzen.',
    'Kurzfristig möglich, Material ist teilweise vorhanden.',
    'Regelmäßiger Bedarf, bei guter Zusammenarbeit gerne öfter.',
    'Bitte vorab kurz Rückmeldung, ob der Zeitraum passt.',
  ]

  console.log('── Creating and publishing requests ──')
  const requestIds: { id: string; categorySlug: string }[] = []
  for (const c of customers) {
    const numRequests = 1 + Math.floor(Math.random() * 3) // 1–3 per customer
    for (let i = 0; i < numRequests; i++) {
      const category = pick(categories)
      const loc = pick(CITIES)
      const titles = REQUEST_TITLES[category.slug] ?? [category.name]
      const req = await requestService.createRequest({
        customerId: c.userId,
        categoryId: category.id,
        title: pick(titles),
        description: pick(DESCRIPTIONS),
        plz: loc.plz,
        addressCity: loc.city,
        lat: loc.lat,
        lon: loc.lon,
        preferredDateStart: futureDate(3 + Math.floor(Math.random() * 14)),
        budgetMin: randomBetween(50, 150),
        budgetMax: randomBetween(150, 400),
        urgency: pick(['NORMAL', 'NORMAL', 'URGENT']),
      })
      await requestService.publishRequest(req.id, c.userId)
      requestIds.push({ id: req.id, categorySlug: category.slug })
    }
  }
  console.log(`Published ${requestIds.length} requests.`)

  console.log('── Submitting offers ──')
  type OfferRecord = { offerId: string; requestId: string; providerUserId: string; price: number }
  const offersByRequest = new Map<string, OfferRecord[]>()

  for (const r of requestIds) {
    const qualifiedProviders = providers.filter((p) =>
      (providerCategoryMap.get(p.userId) ?? []).includes(
        categories.find((c) => c.slug === r.categorySlug)!.id
      )
    )
    const bidders = pickN(qualifiedProviders.length > 0 ? qualifiedProviders : providers, 2 + Math.floor(Math.random() * 3))
    const basePrice = randomBetween(80, 350)
    const records: OfferRecord[] = []
    for (const provider of bidders) {
      const price = Math.max(30, basePrice + randomBetween(-40, 40))
      try {
        const offer = await offerService.createOffer({
          requestId: r.id,
          providerUserId: provider.userId,
          proposedPrice: price,
          proposedDate: futureDate(5 + Math.floor(Math.random() * 14)),
          estimatedDurationHours: 1 + Math.floor(Math.random() * 6),
          scopeOfWork: 'Ausführung wie in der Anfrage beschrieben, inklusive Aufräumen und kurzer Abnahme vor Ort.',
          personalMessage: 'Ich habe Zeit in den nächsten Tagen und kann kurzfristig starten.',
          validHours: 168,
        })
        records.push({ offerId: offer.id, requestId: r.id, providerUserId: provider.userId, price })
      } catch {
        // e.g. OFFER_ALREADY_SUBMITTED if the same provider got picked twice — skip
      }
    }
    offersByRequest.set(r.id, records)
  }
  const totalOffers = [...offersByRequest.values()].reduce((sum, arr) => sum + arr.length, 0)
  console.log(`Submitted ${totalOffers} offers across ${requestIds.length} requests.`)

  console.log('── Closing orders (accept → pay → complete → release) ──')
  const requestIdToCustomer = new Map<string, string>()
  {
    const reqs = await prisma.serviceRequest.findMany({
      where: { id: { in: requestIds.map((r) => r.id) } },
      include: { customer: true },
    })
    for (const req of reqs) requestIdToCustomer.set(req.id, req.customer.userId)
  }

  let acceptedCount = 0
  let inProgressCount = 0
  let awaitingReleaseCount = 0
  let releasedCount = 0
  let cancelledCount = 0
  const releasedOrders: { orderId: string; customerUserId: string; providerUserId: string }[] = []

  let idx = 0
  for (const [requestId, records] of offersByRequest) {
    if (records.length === 0) continue
    idx++
    const customerUserId = requestIdToCustomer.get(requestId)
    if (!customerUserId) continue

    // Leave ~20% of requests with pending offers only (no decision yet).
    if (idx % 5 === 0) continue

    const winner = pick(records)
    let order
    try {
      order = await orderService.acceptOffer(winner.offerId, customerUserId)
      acceptedCount++
    } catch {
      continue
    }

    // Simulate payment capture (same as the dev-only /orders/:id/pay/simulate route).
    const releaseDeadline = futureDate(3)
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order!.id },
        data: { status: 'IN_PROGRESS', paymentStatus: 'CAPTURED', releaseDeadline, mangopayEscrowWalletId: 'simulated' },
      })
      await tx.serviceRequest.update({ where: { id: requestId }, data: { status: 'IN_PROGRESS' } })
      await tx.orderStatusHistory.create({ data: { orderId: order!.id, status: 'IN_PROGRESS', triggeredBy: 'demo_seed' } })
    })
    inProgressCount++

    // A couple of orders get cancelled instead of progressing further.
    if (idx % 11 === 0) {
      try {
        await orderService.cancelOrder(order!.id, customerUserId)
        cancelledCount++
        inProgressCount--
      } catch {
        // ignore
      }
      continue
    }

    // Leave ~15% sitting at IN_PROGRESS (job not finished yet).
    if (idx % 7 === 0) continue

    await orderService.markComplete(order!.id, winner.providerUserId, [], 'Arbeit wie vereinbart abgeschlossen.')
    inProgressCount--
    awaitingReleaseCount++

    // Leave ~15% sitting at AWAITING_RELEASE (customer hasn't released yet).
    if (idx % 6 === 0) continue

    await orderService.releasePayment(order!.id, customerUserId)
    awaitingReleaseCount--
    releasedCount++
    releasedOrders.push({ orderId: order!.id, customerUserId, providerUserId: winner.providerUserId })
  }

  console.log(
    `Orders — accepted: ${acceptedCount}, in progress: ${inProgressCount}, awaiting release: ${awaitingReleaseCount}, released: ${releasedCount}, cancelled: ${cancelledCount}`
  )

  console.log('── Rating released orders (mix of excellent / good / bad) ──')
  const RATING_COMMENTS: Record<number, string[]> = {
    5: ['Absolut top, jederzeit wieder!', 'Schnell, sauber, freundlich — perfekt.', 'Beste Erfahrung bisher.'],
    4: ['Sehr gute Arbeit, kleine Verzögerung beim Start.', 'Zufrieden, gerne wieder.'],
    3: ['In Ordnung, nichts Besonderes.', 'Ergebnis okay, Kommunikation ausbaufähig.'],
    2: ['Leider nicht wie besprochen, musste nachbessern.', 'Verspätet und wenig Rückmeldung.'],
    1: ['Sehr enttäuschend, nicht zu empfehlen.', 'Arbeit war mangelhaft.'],
  }
  // Weighted distribution: excellent-heavy overall, but skewed per provider below
  // so some providers end up clearly "best" and a couple end up clearly worst.
  let ratingCount = 0
  const providerBias = new Map<string, number>() // -1..1, shifts that provider's typical score
  for (const p of providers) providerBias.set(p.userId, Math.random() * 2 - 1)

  for (const { orderId, customerUserId, providerUserId } of releasedOrders) {
    const bias = providerBias.get(providerUserId) ?? 0
    const roll = Math.random() + bias * 0.6
    const score = roll > 0.75 ? 5 : roll > 0.45 ? 4 : roll > 0.15 ? 3 : roll > -0.15 ? 2 : 1
    try {
      await ratingService.submitRating({
        orderId,
        raterUserId: customerUserId,
        score,
        comment: pick(RATING_COMMENTS[score]),
      })
      ratingCount++
    } catch {
      // ALREADY_RATED etc — skip
    }
  }
  console.log(`Submitted ${ratingCount} ratings.`)

  console.log('── Recomputing provider leaderboard preview ──')
  const topProviders = await prisma.providerProfile.findMany({
    where: { totalReviews: { gt: 0 } },
    orderBy: [{ averageRating: 'desc' }, { totalReviews: 'desc' }],
    take: 10,
    include: { user: { select: { displayName: true } } },
  })
  for (const p of topProviders) {
    const completedJobs = await prisma.order.count({
      where: { status: 'RELEASED', offer: { providerId: p.id } },
    })
    console.log(
      `  ${p.user.displayName.padEnd(20)} avg=${p.averageRating.toFixed(2)} reviews=${p.totalReviews} completedJobs=${completedJobs}`
    )
  }

  console.log('\nDone. All demo accounts use the password: ' + DEMO_PASSWORD)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

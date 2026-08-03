import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma.js'

const MVP_CATEGORIES = [
  { name: 'Sanitär & Klempner', slug: 'plumbing', description: 'Leitungen, Armaturen, Badezimmer', sortOrder: 1 },
  { name: 'Malerarbeiten', slug: 'painting', description: 'Wände, Decken, Holzwerk', sortOrder: 2 },
  { name: 'Reinigung', slug: 'cleaning', description: 'Wohnung, Büro, Fenster, Baureinigung', sortOrder: 3 },
  { name: 'Umzugshilfe', slug: 'moving', description: 'Packen, Tragen, Möbelaufbau', sortOrder: 4 },
  { name: 'Schreinerarbeiten', slug: 'carpentry', description: 'Möbelreparatur, Regale, Holzarbeiten', sortOrder: 5 },
  { name: 'Elektroarbeiten', slug: 'electrical', description: 'Steckdosen, Beleuchtung, kleine Reparaturen', sortOrder: 6 },
  { name: 'Gartenarbeit', slug: 'gardening', description: 'Mähen, Beschneiden, Landschaftsgestaltung', sortOrder: 7 },
  { name: 'Haushaltsreparaturen', slug: 'home-maintenance', description: 'Handwerkeraufgaben, kleine Reparaturen', sortOrder: 8 },
  { name: 'Nachhilfe & Bildung', slug: 'tutoring', description: 'Schulfächer, Sprachen, Musik', sortOrder: 9 },
  { name: 'Besorgungen & Botengänge', slug: 'errands', description: 'Einkaufen, Lieferungen, Warteschlange', sortOrder: 10 },
]

const SUBCATEGORIES: Record<string, Array<{ name: string; slug: string; description: string }>> = {
  cleaning: [
    { name: 'Wohnungsreinigung', slug: 'cleaning-home', description: 'Regelmäßige oder einmalige Reinigung' },
    { name: 'Büroreinigung', slug: 'cleaning-office', description: 'Gewerbliche Reinigungsdienste' },
    { name: 'Fensterreinigung', slug: 'cleaning-windows', description: 'Innen und außen' },
    { name: 'Baureinigung', slug: 'cleaning-construction', description: 'Nach Renovierung oder Bau' },
  ],
  moving: [
    { name: 'Möbeltransport', slug: 'moving-furniture', description: 'Schwere Möbel bewegen' },
    { name: 'Packhilfe', slug: 'moving-packing', description: 'Einpacken und vorbereiten' },
    { name: 'Möbelaufbau', slug: 'moving-assembly', description: 'IKEA und andere Möbel aufbauen' },
  ],
  tutoring: [
    { name: 'Schulnachhilfe', slug: 'tutoring-school', description: 'Mathe, Deutsch, Englisch und mehr' },
    { name: 'Sprachkurse', slug: 'tutoring-languages', description: 'Deutsch, Englisch und andere Sprachen' },
    { name: 'Musikunterricht', slug: 'tutoring-music', description: 'Instrumente und Gesang' },
  ],
}

async function seed() {
  console.log('Seeding database...')

  // Seed global commission rule (15%)
  await prisma.commissionRule.upsert({
    where: { id: 'global-default' },
    update: {},
    create: {
      id: 'global-default',
      isGlobal: true,
      rate: 0.15,
      minimumAmount: 1.5,
      isActive: true,
      createdById: 'system',
    },
  })

  for (const cat of MVP_CATEGORIES) {
    const parent = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, description: cat.description, sortOrder: cat.sortOrder },
      create: { ...cat, isActive: true },
    })

    const subs = SUBCATEGORIES[cat.slug] ?? []
    for (const sub of subs) {
      await prisma.category.upsert({
        where: { slug: sub.slug },
        update: { name: sub.name, description: sub.description },
        create: { ...sub, parentId: parent.id, isActive: true },
      })
    }
  }

  console.log(`Seeded ${MVP_CATEGORIES.length} main categories.`)

  // Seed default legal document placeholders
  const legalDocs = [
    { type: 'agb', title: 'Allgemeine Geschäftsbedingungen', version: '1.0' },
    { type: 'impressum', title: 'Impressum', version: '1.0' },
    { type: 'privacy_policy', title: 'Datenschutzerklärung', version: '1.0' },
    { type: 'cancellation', title: 'Widerrufsbelehrung', version: '1.0' },
  ]

  for (const doc of legalDocs) {
    const existing = await prisma.legalDocument.findFirst({ where: { type: doc.type, isActive: true } })
    if (!existing) {
      await prisma.legalDocument.create({
        data: { ...doc, content: `[${doc.title} — Inhalt wird vom Rechtsteam bereitgestellt]`, isActive: true, createdById: 'system' },
      })
    }
  }

  // Seed admin user
  const adminEmail = 'admin@ichhabezeit.de'
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (!existing) {
    const passwordHash = await bcrypt.hash('Admin1234!', 12)
    await prisma.user.create({
      data: {
        email: adminEmail,
        phone: '+491700000000',
        displayName: 'Admin',
        passwordHash,
        role: 'ADMIN',
        emailVerified: true,
        phoneVerified: true,
        verificationStatus: 'KYC_VERIFIED',
        isActive: true,
      },
    })
    console.log('Admin user created: admin@ichhabezeit.de / Admin1234!')
  } else {
    console.log('Admin user already exists.')
  }

  console.log('Seeding complete.')
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

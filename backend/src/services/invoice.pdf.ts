import PDFDocument from 'pdfkit'
import { prisma } from '../config/prisma.js'

const eur = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

const de = (d: Date | string) =>
  new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

const PLATFORM_NAME = 'Ich habe Zeit GmbH'
const PLATFORM_ADDRESS = 'Musterstraße 1\n10115 Berlin\nDeutschland'
const PLATFORM_EMAIL = 'rechnung@ichhabezeit.de'
const PLATFORM_TAX = 'USt-IdNr.: DE123456789'

// ─────────────────────────────────────────────────────────────────────────────

export async function buildInvoicePdf(invoiceId: string, userId: string): Promise<Buffer> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      order: {
        include: {
          request: { include: { category: true } },
          offer: {
            include: {
              provider: {
                include: {
                  user: {
                    include: { addresses: { where: { isDefault: true }, take: 1 } },
                  },
                },
              },
            },
          },
          customer: {
            include: { addresses: { where: { isDefault: true }, take: 1 } },
          },
        },
      },
    },
  })

  if (!invoice) throw new Error('INVOICE_NOT_FOUND')

  const isPlatformIssued = invoice.issuerId === 'platform'
  const hasAccess =
    isPlatformIssued
      ? invoice.receiverId === userId
      : invoice.issuerId === userId || invoice.receiverId === userId
  if (!hasAccess) throw new Error('FORBIDDEN')

  const { order } = invoice
  const provider = order.offer.provider
  const providerUser = provider.user
  const customerUser = order.customer
  const providerAddr = providerUser.addresses[0]
  const customerAddr = customerUser.addresses[0]

  // Issuer block
  const issuerName = isPlatformIssued
    ? PLATFORM_NAME
    : (provider.legalName ?? providerUser.displayName)
  const issuerAddress = isPlatformIssued
    ? PLATFORM_ADDRESS
    : providerAddr
      ? `${providerAddr.street}\n${providerAddr.plz} ${providerAddr.city}\nDeutschland`
      : 'Adresse nicht hinterlegt'
  const issuerTax = isPlatformIssued
    ? PLATFORM_TAX
    : provider.vatNumber
      ? `USt-IdNr.: ${provider.vatNumber}`
      : provider.taxId
        ? `St.-Nr.: ${provider.taxId}`
        : ''

  // Receiver block
  const isReceiverCustomer = invoice.receiverId === customerUser.id
  const receiverName = isReceiverCustomer ? customerUser.displayName : providerUser.displayName
  const receiverAddr = isReceiverCustomer ? customerAddr : providerAddr
  const receiverAddress = receiverAddr
    ? `${receiverAddr.street}\n${receiverAddr.plz} ${receiverAddr.city}\nDeutschland`
    : 'Adresse nicht hinterlegt'

  // Service description
  const serviceDesc =
    invoice.invoiceType === 'SERVICE_INVOICE'
      ? `${order.request.title} (${order.request.category?.name ?? 'Dienstleistung'})`
      : `Vermittlungsgebühr für Auftrag #${order.id.slice(-8).toUpperCase()}`

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: 'A4', bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const W = doc.page.width - 120 // usable width
    const PL = 60 // page left margin

    // ── Header bar ─────────────────────────────────────────────────────────────
    doc
      .rect(PL, 40, W, 48)
      .fill('#1A56DB')
    doc
      .fillColor('white')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text('Ich habe Zeit', PL + 14, 54, { continued: true })
      .font('Helvetica')
      .fontSize(11)
      .fillColor('rgba(255,255,255,0.75)')
      .text('  — Rechnungsportal')
    doc.fillColor('#0F172A')

    // ── Invoice title + number ──────────────────────────────────────────────────
    doc
      .moveDown(2)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text('RECHNUNG', PL)
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#64748B')
      .text(`Nr. ${invoice.invoiceNumber}`, PL)
      .fillColor('#0F172A')
      .moveDown(1.2)

    // ── Issuer / Receiver two-column ────────────────────────────────────────────
    const col2 = PL + W / 2 + 10
    const yParties = doc.y

    doc
      .font('Helvetica-Bold').fontSize(9).fillColor('#64748B')
      .text('VON', PL, yParties)
      .fillColor('#0F172A').font('Helvetica-Bold').fontSize(11)
      .text(issuerName, PL, yParties + 14)
      .font('Helvetica').fontSize(10).fillColor('#64748B')
      .text(issuerAddress, PL, doc.y + 2, { lineGap: 2 })
    if (issuerTax) {
      doc.text(issuerTax, PL, doc.y + 6)
    }
    if (isPlatformIssued) {
      doc.text(PLATFORM_EMAIL, PL, doc.y + 2)
    }

    const yAfterIssuer = doc.y

    doc
      .font('Helvetica-Bold').fontSize(9).fillColor('#64748B')
      .text('AN', col2, yParties)
      .fillColor('#0F172A').font('Helvetica-Bold').fontSize(11)
      .text(receiverName, col2, yParties + 14)
      .font('Helvetica').fontSize(10).fillColor('#64748B')
      .text(receiverAddress, col2, doc.y + 2, { lineGap: 2 })

    doc.y = Math.max(yAfterIssuer, doc.y) + 20

    // ── Meta table (dates) ──────────────────────────────────────────────────────
    doc.moveTo(PL, doc.y).lineTo(PL + W, doc.y).stroke('#E2E8F0')
    doc.moveDown(0.8)

    const metaY = doc.y
    doc
      .font('Helvetica-Bold').fontSize(9).fillColor('#64748B')
      .text('RECHNUNGSDATUM', PL, metaY)
      .fillColor('#0F172A').font('Helvetica').fontSize(10)
      .text(de(invoice.issueDate), PL, metaY + 12)

    doc
      .font('Helvetica-Bold').fontSize(9).fillColor('#64748B')
      .text('LEISTUNGSDATUM', col2, metaY)
      .fillColor('#0F172A').font('Helvetica').fontSize(10)
      .text(de(invoice.serviceDate), col2, metaY + 12)

    doc.y = metaY + 32
    doc.moveTo(PL, doc.y).lineTo(PL + W, doc.y).stroke('#E2E8F0')
    doc.moveDown(1.2)

    // ── Line items table ────────────────────────────────────────────────────────
    const col = { pos: PL, desc: PL + 30, net: PL + W - 200, vat: PL + W - 120, gross: PL + W - 50 }

    // Header row
    const thY = doc.y
    doc
      .rect(PL, thY, W, 22).fill('#F8FAFC')
      .font('Helvetica-Bold').fontSize(9).fillColor('#64748B')
      .text('#',            col.pos  + 2, thY + 7)
      .text('Beschreibung',  col.desc + 2, thY + 7)
      .text('Netto',          col.net,  thY + 7, { width: 70, align: 'right' })
      .text('MwSt',           col.vat,  thY + 7, { width: 50, align: 'right' })
      .text('Gesamt',         col.gross - 50, thY + 7, { width: 80, align: 'right' })

    doc.y = thY + 28
    doc.fillColor('#0F172A')

    // Data row
    const rowY = doc.y
    const vatLabel = invoice.vatRate === 0
      ? '0 % *'
      : `${(invoice.vatRate * 100).toFixed(0)} %`

    doc
      .font('Helvetica').fontSize(10)
      .text('1',               col.pos  + 2, rowY)
      .text(serviceDesc,        col.desc + 2, rowY, { width: col.net - col.desc - 10 })
      .text(eur(invoice.subtotalAmount), col.net, rowY, { width: 70, align: 'right' })
      .text(vatLabel,           col.vat,  rowY, { width: 50, align: 'right' })
      .text(eur(invoice.totalAmount),    col.gross - 50, rowY, { width: 80, align: 'right' })

    doc.moveDown(0.5)
    doc.moveTo(PL, doc.y).lineTo(PL + W, doc.y).stroke('#E2E8F0')
    doc.moveDown(0.8)

    // ── Totals ──────────────────────────────────────────────────────────────────
    const totX = PL + W - 230
    const totLabelW = 130
    const totValW = 90

    const addTotal = (label: string, value: string, bold = false) => {
      const y = doc.y
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 11 : 10)
        .fillColor(bold ? '#0F172A' : '#64748B')
        .text(label, totX, y, { width: totLabelW })
        .text(value, totX + totLabelW, y, { width: totValW, align: 'right' })
      doc.moveDown(0.4)
    }

    addTotal('Nettobetrag', eur(invoice.subtotalAmount))
    if (invoice.vatRate === 0) {
      addTotal('Umsatzsteuer (0 %)', '0,00 €')
    } else {
      addTotal(`Umsatzsteuer (${(invoice.vatRate * 100).toFixed(0)} %)`, eur(invoice.vatAmount))
    }

    doc.moveDown(0.3)
    doc.moveTo(totX, doc.y).lineTo(PL + W, doc.y).stroke('#1A56DB')
    doc.moveDown(0.4)
    addTotal('Gesamtbetrag', eur(invoice.totalAmount), true)

    // ── Legal notes ─────────────────────────────────────────────────────────────
    doc.moveDown(2)

    if (invoice.vatRate === 0 && invoice.invoiceType === 'SERVICE_INVOICE') {
      doc
        .font('Helvetica').fontSize(8.5).fillColor('#64748B')
        .text(
          '* Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).',
          PL, doc.y,
        )
      doc.moveDown(0.6)
    }

    if (invoice.legalNotes) {
      doc.font('Helvetica').fontSize(9).fillColor('#64748B').text(invoice.legalNotes, PL)
      doc.moveDown(0.6)
    }

    doc
      .font('Helvetica').fontSize(8.5).fillColor('#94A3B8')
      .text(
        `Erstellt durch die Ich habe Zeit Plattform · ${PLATFORM_EMAIL}`,
        PL, doc.y,
      )

    // ── Footer ──────────────────────────────────────────────────────────────────
    const pageH = doc.page.height
    doc
      .rect(PL, pageH - 50, W, 1).fill('#E2E8F0')
      .font('Helvetica').fontSize(8).fillColor('#94A3B8')
      .text(
        `Rechnungsnummer: ${invoice.invoiceNumber}  ·  Dokument erstellt am ${de(new Date())}`,
        PL,
        pageH - 38,
        { width: W, align: 'center' },
      )

    doc.end()
  })
}

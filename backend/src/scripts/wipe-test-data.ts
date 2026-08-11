import 'dotenv/config'
import { prisma } from '../config/prisma.js'

// One-time (or reusable) dev utility: clears every user-generated row so you
// can start testing with fresh accounts, while keeping reference/config data
// intact (Category, LegalDocument, CommissionRule, PlatformSetting) and
// keeping any ADMIN/HELP_DESK accounts so the admin panel stays accessible.
//
// Run with: npx tsx src/scripts/wipe-test-data.ts
// (from the backend/ directory, against whatever DATABASE_URL is in .env)

async function main() {
  const testUserWhere = { role: { notIn: ['ADMIN' as const, 'HELP_DESK' as const] } }

  const result = await prisma.$transaction(async (tx) => {
    await tx.chatAttachment.deleteMany({})
    await tx.chatMessage.deleteMany({})
    await tx.chat.deleteMany({})

    await tx.disputeEvidence.deleteMany({})
    await tx.dispute.deleteMany({})

    await tx.invoice.deleteMany({})
    await tx.orderStatusHistory.deleteMany({})
    await tx.rating.deleteMany({})

    await tx.supportMessage.deleteMany({})
    await tx.supportTicket.deleteMany({})

    await tx.order.deleteMany({})
    await tx.offer.deleteMany({})
    await tx.serviceListing.deleteMany({})
    await tx.serviceRequest.deleteMany({})

    await tx.providerCategory.deleteMany({})
    await tx.serviceArea.deleteMany({})

    await tx.kycDocument.deleteMany({})
    await tx.pushToken.deleteMany({})
    await tx.session.deleteMany({})
    await tx.passwordResetToken.deleteMany({})
    await tx.otpCode.deleteMany({})
    await tx.notificationSettings.deleteMany({})
    await tx.consentRecord.deleteMany({})
    await tx.address.deleteMany({})
    await tx.auditLog.deleteMany({})
    await tx.flaggedContent.deleteMany({})
    await tx.providerBlacklist.deleteMany({})
    await tx.bannedEntity.deleteMany({})

    await tx.providerProfile.deleteMany({})
    await tx.customerProfile.deleteMany({})

    const deletedUsers = await tx.user.deleteMany({ where: testUserWhere })

    return { deletedUsers: deletedUsers.count }
  })

  const remainingUsers = await prisma.user.findMany({
    select: { email: true, role: true },
  })

  console.log(`Deleted ${result.deletedUsers} test user(s) and all their data.`)
  console.log('Kept (reference data untouched: Category, LegalDocument, CommissionRule, PlatformSetting).')
  console.log('Remaining accounts:', remainingUsers.length === 0 ? '(none)' : remainingUsers)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

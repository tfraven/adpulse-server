/**
 * Plan Lifecycle & Quota Helper
 * Handles plan expiration, lifetime quota enforcement, and daily quota reset
 */

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolves the user's active plan atomically.
 * Automatically checks:
 * 1. Has the validity period expired (expiresAt < now)?
 * 2. Has the total lifetime quota been exhausted (totalAdsWatched >= totalAdsQuota)?
 * 3. Has the date rolled over to reset adsWatchedToday?
 *
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
async function resolveActivePlan(prismaClient, userId) {
  const activePlan = await prismaClient.userPlan.findFirst({
    where: { userId, status: 'Active' },
    orderBy: { id: 'desc' }
  });

  if (!activePlan) {
    return null;
  }

  const now = new Date();
  const todayStr = getTodayString();

  // 1. Check validity expiration
  const isTimeExpired = now > new Date(activePlan.expiresAt);

  // 2. Check total ads quota exhaustion
  const isQuotaExhausted = activePlan.totalAdsQuota > 0 && activePlan.totalAdsWatched >= activePlan.totalAdsQuota;

  if (isTimeExpired || isQuotaExhausted) {
    const expiredReason = isTimeExpired ? 'Validity period ended' : 'Total quota exhausted';
    const updated = await prismaClient.userPlan.update({
      where: { id: activePlan.id },
      data: { status: 'Expired' }
    });
    return null;
  }

  // 3. Check daily midnight reset
  if (activePlan.lastWatchDate !== todayStr) {
    const resetPlan = await prismaClient.userPlan.update({
      where: { id: activePlan.id },
      data: {
        adsWatchedToday: 0,
        lastWatchDate: todayStr
      }
    });
    return resetPlan;
  }

  return activePlan;
}

module.exports = {
  getTodayString,
  resolveActivePlan
};

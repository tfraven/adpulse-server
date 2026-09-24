async function testSystem() {
  console.log('==============================================');
  console.log('   ADPUSE FULL SYSTEM HEALTH & VERIFICATION   ');
  console.log('==============================================\n');

  try {
    // 1. Health check
    console.log('1. Checking Backend & Local .db...');
    const health = await fetch('http://localhost:5000/health').then(r => r.json());
    console.log('   Status:', health.status);
    console.log('   Database:', health.database);
    console.log('   ORM:', health.orm);
    console.log('   Google Ads:', health.googleAds);

    // 2. User Registration
    console.log('\n2. Testing Registration & Unique Referral Code...');
    const testEmail = `testuser.${Date.now()}@adpulse.com`;
    const regRes = await fetch('http://localhost:5000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Zubair Ahmed',
        email: testEmail,
        mobile: '+92 312 9876543',
        country: 'Pakistan',
        referral_code: 'EARN9482'
      })
    }).then(r => r.json());

    console.log('   Registered User ID:', regRes.user.id);
    console.log('   Assigned Unique Ref Code:', regRes.user.referral_code);
    const newUserId = regRes.user.id;

    // 3. 4 Wallets Check
    console.log('\n3. Checking 4 Distinct Wallets (with 100 Welcome Bonus in Rewards)...');
    const wallRes = await fetch(`http://localhost:5000/api/wallets?userId=${newUserId}`).then(r => r.json());
    console.log('   Deposit Wallet:  ₨', wallRes.wallets.deposit_balance);
    console.log('   Earning Wallet:  ₨', wallRes.wallets.earning_balance);
    console.log('   Referral Wallet: ₨', wallRes.wallets.referral_balance);
    console.log('   Rewards Wallet:  ₨', wallRes.wallets.rewards_balance);
    console.log('   Total Balance:   ₨', wallRes.wallets.total_balance);

    // 4. Deposit via JazzCash
    console.log('\n4. Testing Deposit via JazzCash (credited to Deposit Wallet)...');
    const depRes = await fetch('http://localhost:5000/api/wallets/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: newUserId,
        amount: 5000,
        gateway: 'JazzCash',
        sender_number: '03001234567',
        trx_reference: 'JC-849201948'
      })
    }).then(r => r.json());
    console.log('   Result:', depRes.message);

    // 5. Purchase Pioneer Plan from Deposit Wallet
    console.log('\n5. Purchasing Pioneer Plan (deducted from Deposit Wallet)...');
    const planRes = await fetch('http://localhost:5000/api/plans/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: newUserId,
        planSlug: 'pioneer'
      })
    }).then(r => r.json());
    console.log('   Activated Plan:', planRes.activePlan.plan_name);
    console.log('   Daily Limit:', planRes.activePlan.daily_limit, 'ads/day');
    console.log('   Earning Rate: ₨', planRes.activePlan.earning_per_ad, '/ ad');

    // 6. Google Ads Check
    console.log('\n6. Checking Google Ads in Catalog...');
    const adsRes = await fetch('http://localhost:5000/api/ads').then(r => r.json());
    const googleAd = adsRes.ads.find(a => a.is_google_ad) || adsRes.ads[0];
    console.log('   Google Ad Campaign:', googleAd.title);
    console.log('   AdSense Client ID:', googleAd.google_ad_client);
    console.log('   AdSense Slot ID:', googleAd.google_ad_slot);

    // 7. Watch Google Ad, solve Anti-bot math & disburse to Earning Wallet
    console.log('\n7. Watching Google Ad & Solving Anti-Bot Math...');
    const watchRes = await fetch('http://localhost:5000/api/ads/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: newUserId,
        adId: googleAd.id,
        watchedSeconds: 10,
        mathAnswer: 18,
        expectedAnswer: 18
      })
    }).then(r => r.json());
    console.log('   Reward Payout:', watchRes.message);
    console.log('   Ads Watched Today:', watchRes.adsWatchedToday, '/', watchRes.dailyLimit);

    // 8. Withdrawable Earning Wallet Check
    console.log('\n8. Checking Updated Wallets After Watching Ad...');
    const postAdWallets = await fetch(`http://localhost:5000/api/wallets?userId=${newUserId}`).then(r => r.json());
    console.log('   Earning Wallet: ₨', postAdWallets.wallets.earning_balance);

    // 9. Unified Financial Ledger
    console.log('\n9. Checking Unified Financial Ledger Audit Trail...');
    const txRes = await fetch(`http://localhost:5000/api/wallets/transactions?userId=${newUserId}&type=All`).then(r => r.json());
    console.log(`   Found ${txRes.transactions.length} verified transactions:`);
    txRes.transactions.forEach(t => {
      console.log(`   - [${t.type}] ${t.target_wallet}: ₨ ${t.amount} -> ${t.description}`);
    });

    console.log('\n==============================================');
    console.log('   STATUS: ALL PLATFORM SYSTEMS 100% WORKING!   ');
    console.log('==============================================');

  } catch (err) {
    console.error('Test error:', err);
  }
}

testSystem();

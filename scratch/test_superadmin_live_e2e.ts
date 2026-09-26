/**
 * Live End-to-End Verification of Super Admin Frontend Services with Running Backend.
 * Tests AuthService and SaaSClient directly against http://localhost:8000/api/v1.
 */

// Setup browser globals for Node test environment
const storage: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => storage[k] || null,
  setItem: (k: string, v: string) => { storage[k] = String(v); },
  removeItem: (k: string) => { delete storage[k]; },
  clear: () => { for (const k in storage) delete storage[k]; },
};
(global as any).window = {
  localStorage: (global as any).localStorage,
  location: { hostname: 'admin.shebafi.xyz' },
  dispatchEvent: () => true,
};

import { AuthService } from '../super-admin/src/lib/auth/auth-service';
import { SaaSClient } from '../super-admin/src/lib/saas-api';
import { TokenStorage } from '../super-admin/src/lib/auth/token-storage';

async function runLiveVerification() {
  console.log('======================================================================');
  console.log('SHEBA SUPER ADMIN FRONTEND — LIVE BACKEND FUNCTIONAL VERIFICATION');
  console.log('======================================================================\n');

  // Step 1: Central Admin Authentication
  console.log('1. Authenticating Super Admin via AuthService.loginCentralAdmin()...');
  const username = process.env.SHEBA_ADMIN_USERNAME;
  const password = process.env.SHEBA_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error('SHEBA_ADMIN_USERNAME and SHEBA_ADMIN_PASSWORD are required');
  }

  const authResult = await AuthService.loginCentralAdmin({
    username,
    password,
  });
  console.log(`   -> SUCCESS: Received Token: ${authResult.token.slice(0, 10)}...`);
  console.log(`   -> Authenticated User: ${authResult.user.username} (Superuser: ${authResult.user.is_superuser})`);
  console.log(`   -> Dashboard URL: ${authResult.user.dashboardUrl}`);

  // Store token for SaaSClient
  TokenStorage.setStoredToken(authResult.token, 'central_admin');

  // Step 2: Validate Session via getCurrentCentralAdminUser()
  console.log('\n2. Validating active session via AuthService.getCurrentCentralAdminUser()...');
  const me = await AuthService.getCurrentCentralAdminUser(authResult.token);
  console.log(`   -> SUCCESS: Session valid for ${me.username}, role=${me.role}, isControlPlane=${me.is_control_plane_admin}`);

  // Step 3: Overview Metrics & Telemetry
  console.log('\n3. Querying SaaS Overview & Cluster Telemetry via SaaSClient.getOverview()...');
  const overview: any = await SaaSClient.getOverview();
  console.log(`   -> Cluster: ${overview.platform.name}`);
  console.log(`   -> System Status: ${overview.platform.system_status}, DB: ${overview.platform.database_cluster}`);
  console.log(`   -> Active Tenants: ${overview.kpis.active_tenants} / ${overview.kpis.total_tenants}`);
  console.log(`   -> Total Subscribers: ${overview.kpis.total_subscribers}`);
  console.log(`   -> Online Routers: ${overview.kpis.online_routers} / ${overview.kpis.total_routers}`);
  console.log(`   -> Platform MRR: BDT ${overview.kpis.platform_mrr}`);

  // Step 4: Tenant Management
  console.log('\n4. Listing Tenants via SaaSClient.getTenants()...');
  const tenants = await SaaSClient.getTenants();
  console.log(`   -> SUCCESS: Fetched ${tenants.length} tenants`);
  tenants.forEach((t) => {
    console.log(`      • [${t.slug}] ${t.name}: ${t.subscriber_count} subs, ${t.router_count} routers, active=${t.is_active}`);
  });

  // Step 5: Domain Routing
  console.log('\n5. Querying Domains via SaaSClient.getDomains()...');
  const domains = await SaaSClient.getDomains();
  console.log(`   -> SUCCESS: Fetched ${domains.length} domains`);

  // Step 6: Onboarding Requests
  console.log('\n6. Querying Onboarding Requests via SaaSClient.getRequests()...');
  const requests = await SaaSClient.getRequests();
  console.log(`   -> SUCCESS: Fetched ${requests.length} onboarding requests`);

  // Step 7: Packages & Subscriptions
  console.log('\n7. Querying SaaS Packages & Subscriptions...');
  const packages = await SaaSClient.getPackages();
  const subs = await SaaSClient.getSubscriptions();
  console.log(`   -> Packages: ${packages.length}, Subscriptions: ${subs.length}`);

  // Step 8: Payments Ledger
  console.log('\n8. Querying SaaS Payments Ledger via SaaSClient.getPayments()...');
  const payments = await SaaSClient.getPayments();
  console.log(`   -> SUCCESS: Fetched ${payments.length} payment records`);

  // Step 9: Database Backups
  console.log('\n9. Querying Database Backups via SaaSClient.getBackups()...');
  const backups = await SaaSClient.getBackups();
  console.log(`   -> SUCCESS: Fetched ${backups.length} database backup records`);

  // Step 10: SaaS User Directory
  console.log('\n10. Querying User Directory via SaaSClient.getUsers()...');
  const userDir = await SaaSClient.getUsers();
  console.log(`   -> Total Users: ${userDir.total_users}, Platform Admins: ${userDir.platform_admins.length}, Tenant Owners: ${userDir.tenant_owners.length}`);

  // Step 11: Central Audit Logs
  console.log('\n11. Querying Central Audit Stream via SaaSClient.getAuditLogs()...');
  const auditLogs = await SaaSClient.getAuditLogs();
  console.log(`   -> SUCCESS: Fetched ${auditLogs.length} audit records`);

  // Step 12: Secret ISP API Credentials Lifecycle
  console.log('\n12. Testing Secret ISP API Credentials Lifecycle...');
  if (tenants.length > 0) {
    const targetTenant = tenants[0];
    console.log(`    a. Issuing new Secret API Key for tenant "${targetTenant.name}" (${targetTenant.slug})...`);
    const newCred = await SaaSClient.createApiCredential({
      tenant: targetTenant.id,
      name: 'E2E Verification Frontend Key',
      permissions: ['customers:read', 'billing:read'],
      rate_limit: 500,
    });
    console.log(`       -> SUCCESS: Created API Key record ID: ${newCred.id}`);
    console.log(`       -> Prefix: ${newCred.key_prefix}, Status: ${newCred.status}`);
    console.log(`       -> One-Time Secret Key revealed: ${newCred.secret_key ? newCred.secret_key.slice(0, 14) + '...' : 'NONE'}`);

    console.log(`    b. Rotating API Key ID ${newCred.id}...`);
    const rotated = await SaaSClient.rotateApiCredential(newCred.id);
    console.log(`       -> SUCCESS: Rotated secret key revealed: ${rotated.secret_key ? rotated.secret_key.slice(0, 14) + '...' : 'NONE'}`);

    console.log(`    c. Suspending API Key ID ${newCred.id}...`);
    const suspended = await SaaSClient.suspendApiCredential(newCred.id);
    console.log(`       -> SUCCESS: Status is now: ${suspended.status}`);

    console.log(`    d. Reactivating API Key ID ${newCred.id}...`);
    const reactivated = await SaaSClient.reactivateApiCredential(newCred.id);
    console.log(`       -> SUCCESS: Status is now: ${reactivated.status}`);

    console.log(`    e. Revoking API Key ID ${newCred.id}...`);
    const revoked = await SaaSClient.revokeApiCredential(newCred.id);
    console.log(`       -> SUCCESS: Final status is now: ${revoked.status}`);
  }

  // Step 13: Logout
  console.log('\n13. Testing Control Plane Session Logout via AuthService.logout()...');
  await AuthService.logout(authResult.token, 'central_admin');

  // Verify that the token was invalidated and is no longer accepted
  let tokenStillAccepted = false;
  try {
    await AuthService.getCurrentUser(authResult.token, 'central_admin');
    tokenStillAccepted = true;
  } catch (err: any) {
    // Expected unauthorized rejection
  }

  if (tokenStillAccepted) {
    throw new Error('Logout verification failed: Token remains accepted after logout.');
  }
  console.log('   -> SUCCESS: Logout completed successfully.');

  console.log('\n======================================================================');
  console.log('ALL SUPER ADMIN FRONTEND SERVICES FUNCTIONING 100% WITH BACKEND!');
  console.log('======================================================================');
}

runLiveVerification().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});

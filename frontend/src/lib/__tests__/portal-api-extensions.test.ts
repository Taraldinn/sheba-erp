import { test, describe, after, mock } from 'node:test';
import assert from 'node:assert';
import { PortalApiClient } from '../portal-api';

describe('PortalApiClient Extended Endpoints', () => {
  const originalFetch = global.fetch;

  after(() => {
    global.fetch = originalFetch;
  });

  test('loginWithPassword sends credentials and stores token', async () => {
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ token: 'mock_jwt_token', customer: { username: 'test_user' } }),
    })) as any;

    const res = await PortalApiClient.loginWithPassword('test_user', 'secret123');
    assert.strictEqual(res.token, 'mock_jwt_token');
    assert.strictEqual(PortalApiClient.getToken(), 'mock_jwt_token');
  });

  test('getSettings retrieves tenant public settings', async () => {
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ company_name: 'SpeedNet Fiber', payment_tutorial_video: 'https://youtube.com' }),
    })) as any;

    const settings = await PortalApiClient.getSettings();
    assert.strictEqual(settings.company_name, 'SpeedNet Fiber');
    assert.strictEqual(settings.payment_tutorial_video, 'https://youtube.com');
  });

  test('getFunbox retrieves entertainment links', async () => {
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ([{ name: 'Movie FTP', url: 'http://ftp.local', category: 'FTP' }]),
    })) as any;

    const links = await PortalApiClient.getFunbox();
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].name, 'Movie FTP');
  });

  test('getLiveTraffic retrieves current bandwidth throughput', async () => {
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ is_online: true, download_mbps: 25.4, upload_mbps: 24.8 }),
    })) as any;

    const traffic = await PortalApiClient.getLiveTraffic();
    assert.strictEqual(traffic.is_online, true);
    assert.strictEqual(traffic.download_mbps, 25.4);
  });

  test('getSessions retrieves PPPoE session history', async () => {
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ([{ id: 'sess-1', ip_address: '10.0.0.1', is_active: true }]),
    })) as any;

    const sessions = await PortalApiClient.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].ip_address, '10.0.0.1');
  });

  test('getInvoiceReceipt retrieves printable invoice format', async () => {
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        company: { name: 'SpeedNet' },
        customer: { username: 'test_user' },
        invoice: { invoice_number: 'INV-1001' }
      }),
    })) as any;

    const receipt = await PortalApiClient.getInvoiceReceipt('inv-1001');
    assert.strictEqual(receipt.company.name, 'SpeedNet');
    assert.strictEqual(receipt.invoice.invoice_number, 'INV-1001');
  });

  test('getTicketThread retrieves ticket with replies list', async () => {
    global.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'tck-1',
        subject: 'Fiber line issue',
        replies: [{ sender_name: 'Lineman', message: 'Checked' }]
      }),
    })) as any;

    const ticket = await PortalApiClient.getTicketThread('tck-1');
    assert.strictEqual(ticket.id, 'tck-1');
    assert.strictEqual(ticket.replies.length, 1);
    assert.strictEqual(ticket.replies[0].sender_name, 'Lineman');
  });
});

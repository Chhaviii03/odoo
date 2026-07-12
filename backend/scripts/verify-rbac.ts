/**
 * Smoke-test RBAC / allocation fixes against local API.
 * Usage: npx tsx scripts/verify-rbac.ts
 */
const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';

async function login(email: string, password = 'password123') {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Login ${email} failed: ${res.status} ${JSON.stringify(body)}`);
  return body.accessToken as string;
}

async function api(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function assert(name: string, cond: boolean, detail?: string) {
  if (!cond) throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  console.log(`✓ ${name}`);
}

async function main() {
  const managerTok = await login('manager@assetflow.dev');
  const priyaTok = await login('priya@assetflow.dev');
  const rajTok = await login('raj@assetflow.dev');
  const headTok = await login('head@assetflow.dev');

  // Employee sees held assets in allocation context
  const priyaAssets = await api(priyaTok, '/assets?context=allocation');
  assert('Priya allocation context returns assets', priyaAssets.status === 200 && Array.isArray(priyaAssets.body) && priyaAssets.body.length > 0);

  const rajAssets = await api(rajTok, '/assets?context=allocation');
  assert('Raj allocation context returns assets', rajAssets.status === 200 && Array.isArray(rajAssets.body) && rajAssets.body.length > 0);

  const laptop = (rajAssets.body as any[]).find((a) => a.assetTag === 'AF-0001' || a.qrCode === 'AF-0001');
  assert('Raj can see Priya-held laptop for transfer', !!laptop, JSON.stringify((rajAssets.body as any[]).map((a) => a.assetTag)));

  // Employee transfer to self (ensure laptop is held by someone else first)
  if (laptop) {
    const mgrEmployees = (await api(managerTok, '/employees')).body as any[];
    const priyaEmp = mgrEmployees.find((e) => e.email === 'priya@assetflow.dev');
    const rajEmp = mgrEmployees.find((e) => e.email === 'raj@assetflow.dev');
    const laptopAllocs = await api(managerTok, `/assets/${laptop.id}/allocations`);
    const activeAlloc = (laptopAllocs.body as any[])?.find((a) => a.status === 'ACTIVE' || a.status === 'OVERDUE');

    if (activeAlloc?.employeeId === rajEmp?.id && priyaEmp) {
      // Reset holder to Priya so Raj can request transfer
      await api(managerTok, `/allocations/${activeAlloc.id}/return`, { method: 'POST', body: JSON.stringify({ returnConditionNote: 'Test reset' }) });
      await api(managerTok, '/allocations', { method: 'POST', body: JSON.stringify({ assetId: laptop.id, employeeId: priyaEmp.id }) });
    } else if (!activeAlloc && priyaEmp) {
      await api(managerTok, '/allocations', { method: 'POST', body: JSON.stringify({ assetId: laptop.id, employeeId: priyaEmp.id }) });
    } else if (activeAlloc?.employeeId !== priyaEmp?.id && priyaEmp) {
      await api(managerTok, `/allocations/${activeAlloc.id}/return`, { method: 'POST', body: JSON.stringify({}) });
      await api(managerTok, '/allocations', { method: 'POST', body: JSON.stringify({ assetId: laptop.id, employeeId: priyaEmp.id }) });
    }

    const transfer = await api(rajTok, '/transfers', {
      method: 'POST',
      body: JSON.stringify({ assetId: laptop.id, reason: 'Need laptop for project' }),
    });
    assert('Raj can request transfer to self', transfer.status === 201, `${transfer.status} ${JSON.stringify(transfer.body)}`);
    const transferId = transfer.body?.id;

    // Dept head sees scoped transfers
    const headTransfers = await api(headTok, '/transfers');
    assert('Dept head lists transfers', headTransfers.status === 200);
    const headSees = (headTransfers.body as any[])?.some((t) => t.id === transferId);
    assert('Dept head sees engineering transfer', headSees);

    // Employee cannot approve
    const rajApprove = await api(rajTok, `/transfers/${transferId}/approve`, { method: 'PATCH' });
    assert('Employee cannot approve transfer', rajApprove.status === 403, String(rajApprove.status));

    // Manager approves
    const mgrApprove = await api(managerTok, `/transfers/${transferId}/approve`, { method: 'PATCH' });
    assert('Manager approves transfer', mgrApprove.status === 200, `${mgrApprove.status} ${JSON.stringify(mgrApprove.body)}`);
    assert('Transfer completes after approval', mgrApprove.body?.status === 'COMPLETED');
  }

  // Return with condition note
  const allAssets = await api(managerTok, '/assets');
  const laptop2 = (allAssets.body as any[])?.find((a) => a.qrCode === 'AF-0001' || a.assetTag === 'AF-0001');
  const priyaEmp = (await api(managerTok, '/employees')).body?.find((e: any) => e.email === 'priya@assetflow.dev');
  if (laptop2 && priyaEmp) {
    const laptopAllocs = await api(managerTok, `/assets/${laptop2.id}/allocations`);
    const activeHolder = (laptopAllocs.body as any[])?.find((a) => a.status === 'ACTIVE' || a.status === 'OVERDUE');
    if (activeHolder && activeHolder.employeeId !== priyaEmp.id) {
      await api(managerTok, `/allocations/${activeHolder.id}/return`, { method: 'POST', body: JSON.stringify({}) });
    }
    const freshAllocs = await api(managerTok, `/assets/${laptop2.id}/allocations`);
    const priyaActive = (freshAllocs.body as any[])?.find((a) => (a.status === 'ACTIVE' || a.status === 'OVERDUE') && a.employeeId === priyaEmp.id);
    if (!priyaActive) {
      const reAlloc = await api(managerTok, '/allocations', {
        method: 'POST',
        body: JSON.stringify({ assetId: laptop2.id, employeeId: priyaEmp.id }),
      });
      assert('Manager allocates laptop to Priya for return test', reAlloc.status === 201, `${reAlloc.status}`);
    }
    const priyaAllocs = await api(priyaTok, `/assets/${laptop2.id}/allocations`);
    const active = (priyaAllocs.body as any[])?.find((a) => a.status === 'ACTIVE' || a.status === 'OVERDUE');
    assert('Priya has active allocation on laptop', !!active);
    if (active) {
      const ret = await api(priyaTok, `/allocations/${active.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ returnConditionNote: 'Minor wear on keyboard' }),
      });
      assert('Employee returns with condition note', ret.status === 200, `${ret.status} ${JSON.stringify(ret.body)}`);
      assert('Return note persisted', ret.body?.returnConditionNote === 'Minor wear on keyboard');
    }
  }

  // Department allocation
  const chair = (allAssets.body as any[])?.find((a) => a.qrCode === 'AF-0003');
  const depts = await api(managerTok, '/departments');
  const engDept = (depts.body as any[])?.find((d) => d.name === 'Engineering');
  if (chair && engDept) {
    if (chair.status !== 'AVAILABLE') {
      const holderAllocs = await api(managerTok, `/assets/${chair.id}/allocations`);
      const activeChair = (holderAllocs.body as any[])?.find((a) => a.status === 'ACTIVE' || a.status === 'OVERDUE');
      if (activeChair) {
        await api(managerTok, `/allocations/${activeChair.id}/return`, { method: 'POST', body: JSON.stringify({}) });
      }
    }
    const deptAlloc = await api(managerTok, '/allocations', {
      method: 'POST',
      body: JSON.stringify({ assetId: chair.id, departmentId: engDept.id }),
    });
    assert('Manager can allocate to department', deptAlloc.status === 201, `${deptAlloc.status} ${JSON.stringify(deptAlloc.body)}`);
  }

  // Dept head books on behalf
  const bookables = await api(headTok, '/assets?isBookable=true');
  const room = (bookables.body as any[])?.[0];
  if (room && engDept) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
    const date = tomorrow.toISOString().slice(0, 10);
    const start = new Date(`${date}T14:30:00`);
    const end = new Date(`${date}T15:45:00`);
    const booking = await api(headTok, '/bookings', {
      method: 'POST',
      body: JSON.stringify({ assetId: room.id, departmentId: engDept.id, startTime: start.toISOString(), endTime: end.toISOString() }),
    });
    assert('Dept head books for department', booking.status === 201, `${booking.status} ${JSON.stringify(booking.body)}`);

    const badBooking = await api(rajTok, '/bookings', {
      method: 'POST',
      body: JSON.stringify({ assetId: room.id, departmentId: engDept.id, startTime: start.toISOString(), endTime: end.toISOString() }),
    });
    assert('Employee cannot book for department', badBooking.status === 403, String(badBooking.status));
  }

  // Employees for allocation endpoint
  const empList = await api(rajTok, '/employees/for-allocation');
  assert('Employee blocked from for-allocation', empList.status === 403, String(empList.status));
  const headEmp = await api(headTok, '/employees/for-allocation');
  assert('Dept head can list for-allocation', headEmp.status === 200 && Array.isArray(headEmp.body));

  console.log('\nAll verification checks passed.');
}

main().catch((err) => {
  console.error('\nVerification failed:', err.message ?? err);
  process.exit(1);
});

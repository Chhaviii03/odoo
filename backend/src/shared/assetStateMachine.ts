import type { Prisma, AssetStatus } from '@prisma/client';
import { ApiError } from '../lib/errors.js';

/**
 * Central asset lifecycle state machine.
 *
 * Available ──allocate──▶ Allocated ──return──▶ Available
 * Available ──book───────▶ Reserved ──slot ends──▶ Available
 * Available ──approve maintenance──▶ UnderMaintenance ──resolve──▶ Available
 * Any state ──audit confirms missing──▶ Lost
 * Any state ──admin action──▶ Retired ──▶ Disposed
 *
 * Every module MUST call `transitionAsset` instead of mutating `asset.status`
 * directly, so illegal transitions (e.g. allocating a RETIRED asset) are impossible.
 */
const ALLOWED: Record<AssetStatus, AssetStatus[]> = {
  AVAILABLE: ['ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED'],
  ALLOCATED: ['AVAILABLE', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED'],
  RESERVED: ['AVAILABLE', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED'],
  UNDER_MAINTENANCE: ['AVAILABLE', 'LOST', 'RETIRED'],
  LOST: ['AVAILABLE', 'RETIRED'],
  RETIRED: ['DISPOSED'],
  DISPOSED: [],
};

export function canTransition(from: AssetStatus, to: AssetStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

interface TransitionInput {
  assetId: string;
  to: AssetStatus;
  changedById?: string | null;
  reason?: string;
}

/**
 * Transition an asset to a new status inside a transaction, recording the change
 * in asset_status_history (append-only). Throws 409 on an illegal transition.
 */
export async function transitionAsset(tx: Prisma.TransactionClient, input: TransitionInput) {
  const asset = await tx.asset.findUnique({ where: { id: input.assetId } });
  if (!asset) throw ApiError.notFound('Asset not found');

  if (!canTransition(asset.status, input.to)) {
    throw ApiError.conflict(
      `Illegal asset transition: ${asset.status} → ${input.to}`,
      { from: asset.status, to: input.to },
    );
  }

  if (asset.status === input.to) return asset;

  const updated = await tx.asset.update({
    where: { id: asset.id },
    data: { status: input.to },
  });

  await tx.assetStatusHistory.create({
    data: {
      assetId: asset.id,
      fromStatus: asset.status,
      toStatus: input.to,
      changedById: input.changedById ?? null,
      reason: input.reason,
    },
  });

  return updated;
}

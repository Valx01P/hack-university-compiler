// Soft delete as a plugin. A document is never removed; it gets a deletedAt timestamp, and
// query and aggregate middleware hide deleted documents from every read. The hooks cover find
// and its relatives, countDocuments, and aggregate, so list totals, stats, and edits all skip
// deleted documents. A caller that genuinely needs them opts in with the withDeleted option.
import type { Aggregate, Query, Schema } from "mongoose";
import { now } from "../../clock.ts";

type WithDeletedOptions = { withDeleted?: boolean };

export interface SoftDeleteFields {
  deletedAt: Date | null;
}

export interface SoftDeleteMethods {
  softDelete(): Promise<unknown>;
}

function hideDeleted(this: Query<unknown, unknown>): void {
  const options = this.getOptions() as WithDeletedOptions;
  if (options.withDeleted) return;
  const filter = this.getFilter();
  // Respect an explicit deletedAt in the caller's filter (for example, listing the trash).
  if (!("deletedAt" in filter)) this.where({ deletedAt: null });
}

export function softDeletePlugin(schema: Schema): void {
  schema.add({ deletedAt: { type: Date, default: null } });

  schema.methods.softDelete = function softDelete(this: { deletedAt: Date | null; save(): Promise<unknown> }) {
    this.deletedAt = now();
    return this.save();
  };

  schema.pre(/^find/, hideDeleted);
  schema.pre("countDocuments", hideDeleted);

  schema.pre("aggregate", function hideDeletedFromPipeline(this: Aggregate<unknown>) {
    const options = this.options as WithDeletedOptions;
    if (options.withDeleted) return;
    this.pipeline().unshift({ $match: { deletedAt: null } });
  });
}

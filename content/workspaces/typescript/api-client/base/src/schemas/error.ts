// Parcelly's error envelope: every 4xx and 5xx body looks like this, so the SDK can read the
// code and the request id from any failed call.
import * as z from "zod";

export const ErrorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }),
});

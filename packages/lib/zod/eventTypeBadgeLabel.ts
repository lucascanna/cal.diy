import { z } from "zod";
import { MAX_EVENT_TYPE_BADGE_LABEL_LENGTH } from "../constants";

// An empty or whitespace-only label means "no badge", so it is stored as null rather than "".
export const eventTypeBadgeLabel = z
  .string()
  .trim()
  .max(MAX_EVENT_TYPE_BADGE_LABEL_LENGTH, {
    message: `Badge label must be at most ${MAX_EVENT_TYPE_BADGE_LABEL_LENGTH} characters`,
  })
  .transform((label) => label || null);

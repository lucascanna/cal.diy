import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { Prisma } from "@calcom/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZUpdateInputSchema } from "../types";
import { updateHandler } from "./update.handler";

vi.mock("@calcom/features/hashedLink/lib/repository/HashedLinkRepository", () => ({
  HashedLinkRepository: {
    create: () => ({ findLinksByEventTypeId: vi.fn().mockResolvedValue([]) }),
  },
}));

vi.mock("@calcom/features/hashedLink/lib/service/HashedLinkService", () => ({
  HashedLinkService: class {
    handleMultiplePrivateLinks = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("@calcom/features/calVideoSettings/repositories/CalVideoSettingsRepository", () => ({
  CalVideoSettingsRepository: {
    createOrUpdateCalVideoSettings: vi.fn(),
    deleteCalVideoSettings: vi.fn(),
  },
}));

describe("update.handler", () => {
  describe("bookingFields null to Prisma.DbNull transformation", () => {
    function transformBookingFields(
      bookingFields: null | undefined | Prisma.InputJsonValue
    ): typeof Prisma.DbNull | Prisma.InputJsonValue | undefined {
      return bookingFields === null ? Prisma.DbNull : (bookingFields as Prisma.InputJsonValue | undefined);
    }

    it("should convert null to Prisma.DbNull", () => {
      const result = transformBookingFields(null);
      expect(result).toBe(Prisma.DbNull);
    });

    it("should pass through undefined as-is", () => {
      const result = transformBookingFields(undefined);
      expect(result).toBeUndefined();
    });

    it("should pass through an array of booking fields as-is", () => {
      const bookingFieldsArray = [
        {
          name: "email",
          type: "email",
          label: "Email",
          required: true,
          hidden: false,
        },
        {
          name: "name",
          type: "name",
          label: "Name",
          required: true,
          hidden: false,
        },
      ];

      const result = transformBookingFields(bookingFieldsArray);
      expect(result).toEqual(bookingFieldsArray);
    });

    it("should pass through an empty array as-is", () => {
      const result = transformBookingFields([]);
      expect(result).toEqual([]);
    });

    it("should distinguish between null and empty array", () => {
      const nullResult = transformBookingFields(null);
      const emptyArrayResult = transformBookingFields([]);

      expect(nullResult).toBe(Prisma.DbNull);
      expect(emptyArrayResult).toEqual([]);
      expect(nullResult).not.toEqual(emptyArrayResult);
    });
  });

  describe("badgeLabel", () => {
    type HandlerCtx = Parameters<typeof updateHandler>[0]["ctx"];

    const ctx: HandlerCtx = {
      user: {
        id: 1,
        username: "owner",
        profile: { id: null },
        userLevelSelectedCalendars: [],
        organizationId: null,
        email: "owner@example.com",
        locale: "en",
      },
      prisma: prismaMock,
    };

    const existingEventType = {
      title: "30 min",
      locations: [],
      description: null,
      seatsPerTimeSlot: null,
      recurringEvent: null,
      maxActiveBookingsPerBooker: null,
      fieldTranslations: [],
      isRRWeightsEnabled: false,
      hosts: [],
      calVideoSettings: null,
      children: [],
      hostGroups: [],
      team: null,
    };

    const runUpdate = async (rawInput: Record<string, unknown>) => {
      const input = ZUpdateInputSchema.parse({ id: 10, ...rawInput });
      await updateHandler({ ctx, input });
      return prismaMock.eventType.update.mock.calls[0]?.[0]?.data;
    };

    beforeEach(() => {
      prismaMock.eventType.findUniqueOrThrow.mockResolvedValue(
        existingEventType as unknown as Awaited<ReturnType<typeof prismaMock.eventType.findUniqueOrThrow>>
      );
      prismaMock.eventType.update.mockResolvedValue({
        slug: "30min",
        schedulingType: null,
      } as unknown as Awaited<ReturnType<typeof prismaMock.eventType.update>>);
    });

    it("saves a trimmed badge label", async () => {
      const data = await runUpdate({ badgeLabel: "  Popular  " });
      expect(data?.badgeLabel).toBe("Popular");
    });

    it("clears the badge when an empty label is submitted", async () => {
      const data = await runUpdate({ badgeLabel: "   " });
      expect(data?.badgeLabel).toBeNull();
    });

    it("clears the badge when null is submitted", async () => {
      const data = await runUpdate({ badgeLabel: null });
      expect(data?.badgeLabel).toBeNull();
    });

    it("leaves the badge untouched when the field is not submitted", async () => {
      const data = await runUpdate({ title: "New title" });
      expect(data).not.toHaveProperty("badgeLabel");
    });

    it("rejects a label longer than 25 characters", () => {
      expect(() => ZUpdateInputSchema.parse({ id: 10, badgeLabel: "a".repeat(26) })).toThrow();
    });

    it("rejects a badge label on a team event type", async () => {
      prismaMock.eventType.findUniqueOrThrow.mockResolvedValue({
        ...existingEventType,
        team: {
          id: 5,
          name: "Team",
          slug: "team",
          parentId: null,
          rrTimestampBasis: "CREATED_AT",
          parent: null,
          members: [],
        },
      } as unknown as Awaited<ReturnType<typeof prismaMock.eventType.findUniqueOrThrow>>);

      await expect(runUpdate({ badgeLabel: "Popular" })).rejects.toThrow(
        "Badge labels are only available on personal event types."
      );
      expect(prismaMock.eventType.update).not.toHaveBeenCalled();
    });
  });
});

import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { Prisma } from "@calcom/prisma/client";
import { describe, expect, it } from "vitest";
import { updateHandler } from "./update.handler";

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

  describe("isPinned", () => {
    const ctx = {
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

    it("rejects pinning a team event type", async () => {
      prismaMock.eventType.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        team: { id: 5 },
        hostGroups: [],
      } as unknown as Awaited<ReturnType<typeof prismaMock.eventType.findUniqueOrThrow>>);

      await expect(updateHandler({ ctx, input: { id: 10, isPinned: true } })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Only personal event types can be pinned.",
      });
      expect(prismaMock.eventType.update).not.toHaveBeenCalled();
    });
  });
});

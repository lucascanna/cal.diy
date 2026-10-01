import prisma from "@calcom/prisma";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";
import { describe, expect, it } from "vitest";
import { getEventTypesFromGroup } from "./getEventTypesFromGroup.handler";

describe("getEventTypesFromGroup", async () => {
  const proUser = await prisma.user.findFirstOrThrow({ where: { email: "pro@example.com" } });
  const proUserEventTypes = await prisma.eventType.findMany({ where: { userId: proUser.id } });

  const proUserCtx = {
    user: {
      id: proUser.id,
      name: proUser.name,
      profile: {
        name: proUser.name,
        organizationId: null,
        organization: null,
        username: proUser.username,
        id: null,
        upId: "usr-4",
      },
    } as NonNullable<TrpcSessionUser>,
    prisma,
  };

  it("should return personal event types for a user", async () => {
    const ctx = proUserCtx;

    const res = await getEventTypesFromGroup({
      ctx,
      input: {
        group: {
          teamId: null,
          parentId: null,
        },
        limit: 10,
        cursor: null,
      },
    });

    const resEventTypeIds = res.eventTypes.map((et) => et.id);
    const proUserEventTypeIds = proUserEventTypes.map((et) => et.id);

    expect(res.eventTypes).toBeDefined();
    expect(res.eventTypes.length).toBeGreaterThan(0);
    expect(resEventTypeIds).toEqual(expect.arrayContaining(proUserEventTypeIds));
    expect(resEventTypeIds.length).toBe(proUserEventTypeIds.length);
  });

  it("should list pinned personal event types first and keep the existing order within each section", async () => {
    const byExistingOrder = (a: { position: number; id: number }, b: { position: number; id: number }) =>
      b.position - a.position || b.id - a.id;
    // Pin the two event types that would otherwise be listed last
    const pinnedIds = [...proUserEventTypes]
      .sort(byExistingOrder)
      .slice(-2)
      .map((et) => et.id);
    const expectedPinnedIds = proUserEventTypes
      .filter((et) => pinnedIds.includes(et.id))
      .sort(byExistingOrder)
      .map((et) => et.id);
    const expectedUnpinnedIds = proUserEventTypes
      .filter((et) => !pinnedIds.includes(et.id))
      .sort(byExistingOrder)
      .map((et) => et.id);

    await prisma.eventType.updateMany({ where: { id: { in: pinnedIds } }, data: { isPinned: true } });

    try {
      const allRes = await getEventTypesFromGroup({
        ctx: proUserCtx,
        input: { group: { teamId: null, parentId: null }, limit: 100, cursor: null },
      });
      expect(allRes.eventTypes.map((et) => et.id)).toEqual([...expectedPinnedIds, ...expectedUnpinnedIds]);
      expect(allRes.eventTypes.filter((et) => et.isPinned).map((et) => et.id)).toEqual(expectedPinnedIds);

      const firstPage = await getEventTypesFromGroup({
        ctx: proUserCtx,
        input: { group: { teamId: null, parentId: null }, limit: 3, cursor: null },
      });
      expect(firstPage.eventTypes.map((et) => et.id)).toEqual([...expectedPinnedIds, expectedUnpinnedIds[0]]);
    } finally {
      await prisma.eventType.updateMany({ where: { id: { in: pinnedIds } }, data: { isPinned: false } });
    }
  });
});

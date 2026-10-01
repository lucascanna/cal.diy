import { useRouterQuery } from "@calcom/lib/hooks/useRouterQuery";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import UserPage from "./users-public-view";

vi.mock("@calcom/lib/constants", async () => {
  return await vi.importActual("@calcom/lib/constants");
});

vi.mock("@calcom/lib/hooks/useRouterQuery", () => ({
  useRouterQuery: vi.fn(),
}));

function mockedUserPageComponentProps(props: Partial<React.ComponentProps<typeof UserPage>>) {
  return {
    themeBasis: "dark",
    safeBio: "My Bio",
    profile: {
      name: "John Doe",
      image: "john-profile-url",
      theme: "dark",
      brandColor: "red",
      darkBrandColor: "black",
      organization: {
        requestedSlug: "slug",
        slug: "slug",
        id: 1,
        brandColor: null,
        darkBrandColor: null,
        theme: null,
      },
      allowSEOIndexing: true,
      username: "john",
    },
    users: [
      {
        name: "John Doe",
        username: "john",
        avatarUrl: "john-user-url",
        bio: "",
        verified: false,
        profile: {
          upId: "1",
          id: 1,
          username: "john",
          organizationId: null,
          organization: null,
        },
      },
    ],
    markdownStrippedBio: "My Bio",
    entity: {
      considerUnpublished: false,
      ...(props.entity ?? null),
    },
    eventTypes: props.eventTypes ?? [],
    isOrgSEOIndexable: false,
  } satisfies React.ComponentProps<typeof UserPage>;
}

function mockedEventType(
  overrides: Partial<React.ComponentProps<typeof UserPage>["eventTypes"][number]>
): React.ComponentProps<typeof UserPage>["eventTypes"][number] {
  return {
    id: 1,
    title: "Intro call",
    badgeLabel: null,
    slug: "intro-call",
    length: 30,
    hidden: false,
    lockTimeZoneToggleOnBookingPage: false,
    lockedTimeZone: null,
    requiresConfirmation: false,
    canSendCalVideoTranscriptionEmails: true,
    requiresBookerEmailVerification: false,
    price: 0,
    currency: "usd",
    recurringEvent: null,
    seatsPerTimeSlot: null,
    schedulingType: null,
    metadata: {},
    descriptionAsSafeHTML: "",
    ...overrides,
  };
}

describe("UserPage Component", () => {
  it("should render with no throw", async () => {
    const mockData = {
      props: mockedUserPageComponentProps({
        entity: {
          considerUnpublished: false,
          orgSlug: "org1",
        },
      }),
    };

    vi.mocked(useRouterQuery).mockReturnValue({
      uid: "uid",
    });

    expect(() => render(<UserPage {...mockData.props} />)).not.toThrow();
  });

  it("shows the badge beside the title only for event types that have one", () => {
    vi.mocked(useRouterQuery).mockReturnValue({});

    const { getAllByTestId } = render(
      <UserPage
        {...mockedUserPageComponentProps({
          eventTypes: [
            mockedEventType({ id: 1, title: "Intro call", badgeLabel: "Free consultation" }),
            mockedEventType({ id: 2, title: "Deep dive", slug: "deep-dive", badgeLabel: null }),
          ],
        })}
      />
    );

    const badges = getAllByTestId("event-type-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0].textContent).toBe("Free consultation");

    const [badgedCard, plainCard] = getAllByTestId("event-type-link");
    expect(badgedCard.textContent).toContain("Free consultation");
    expect(plainCard.querySelector('[data-testid="event-type-badge"]')).toBeNull();
  });
});

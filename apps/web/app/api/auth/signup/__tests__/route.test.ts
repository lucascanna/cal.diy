import { HttpError } from "@calcom/lib/http-error";
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaptureException, mockSelfHostedSignupHandler, mockLoggerError } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockSelfHostedSignupHandler: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
    })),
  },
}));
vi.mock("@sentry/nextjs", () => ({
  captureException: mockCaptureException,
}));
vi.mock("app/api/defaultResponderForAppDir", () => ({
  defaultResponderForAppDir: vi.fn((handler) => handler),
}));
vi.mock("app/api/parseRequestData", () => ({
  parseRequestData: vi.fn().mockResolvedValue({ email: "user@example.com" }),
}));
vi.mock("../handlers/selfHostedHandler", () => ({
  default: mockSelfHostedSignupHandler,
}));
vi.mock("../handlers/calcomSignupHandler", () => ({
  default: vi.fn(),
}));
vi.mock("@calcom/features/flags/features.repository", () => ({
  FeaturesRepository: class {
    checkIfFeatureIsEnabledGlobally = vi.fn().mockResolvedValue(false);
  },
}));
vi.mock("@calcom/lib/checkRateLimitAndThrowError", () => ({
  checkRateLimitAndThrowError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@calcom/lib/constants", () => ({ IS_PREMIUM_USERNAME_ENABLED: false }));
vi.mock("@calcom/lib/getIP", () => ({ default: vi.fn(() => "127.0.0.1") }));
vi.mock("@calcom/lib/logger", () => ({ default: { error: mockLoggerError } }));
vi.mock("@calcom/lib/server/PiiHasher", () => ({ piiHasher: { hash: vi.fn((value: string) => value) } }));
vi.mock("@calcom/lib/server/checkCfTurnstileToken", () => ({
  checkCfTurnstileToken: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@calcom/prisma", () => ({ prisma: {} }));
vi.mock("@calcom/prisma/zod-utils", () => ({
  signupSchema: { pick: () => ({ parse: () => ({ token: undefined }) }) },
}));

import { POST } from "../route";

type RouteResponse = { body: unknown; status: number };

async function callSignup(): Promise<RouteResponse> {
  const req = {
    headers: new Headers(),
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as NextRequest;
  const response = await POST(req, { params: Promise.resolve({}) });
  return response as unknown as RouteResponse;
}

describe("POST /api/auth/signup error reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports an unexpected error to Sentry and still returns the generic 500", async () => {
    const error = new Error("Database connection lost");
    mockSelfHostedSignupHandler.mockRejectedValueOnce(error);

    const response = await callSignup();

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(error);
    expect(mockLoggerError).toHaveBeenCalledWith(error);
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: "Internal server error" });
  });

  it.each([
    [409, "A user with this email already exists"],
    [422, "Invalid input"],
  ])("does not report an HttpError with status %i to Sentry", async (statusCode, message) => {
    mockSelfHostedSignupHandler.mockRejectedValueOnce(new HttpError({ statusCode, message }));

    const response = await callSignup();

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(response.status).toBe(statusCode);
    expect(response.body).toEqual({ message });
  });

  it("does not report a successful signup to Sentry", async () => {
    mockSelfHostedSignupHandler.mockResolvedValueOnce({ body: { message: "Created user" }, status: 201 });

    const response = await callSignup();

    expect(mockCaptureException).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
  });
});

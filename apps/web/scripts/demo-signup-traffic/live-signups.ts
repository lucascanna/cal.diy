import type { Browser } from "@playwright/test";
import { chromium } from "@playwright/test";
import type { LiveOptions } from "./options";
import type { FakeUser, LocaleProfile } from "./traffic-model";
import { createFakeUser, createRng, LOCALES, pickUtmSource, pickWeighted } from "./traffic-model";

type LiveOutcome = "signed-up" | "app-error" | "no-result";

type LiveResult = {
  locale: string;
  utmSource: string | null;
  email: string;
  outcome: LiveOutcome;
  detail: string;
  posthogRequests: number;
};

// `next dev` compiles a route on its first hit, which can take a minute on a cold preview.
const STEP_TIMEOUT_MS = 90_000;

function desktopChromeUserAgent(browserVersion: string): string {
  const major = browserVersion.split(".")[0];
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

async function signUpOnce(
  browser: Browser,
  {
    url,
    locale,
    utmSource,
    user,
    userAgent,
    lingerMs,
    ignoreHttpsErrors,
  }: {
    url: URL;
    locale: LocaleProfile;
    utmSource: string | null;
    user: FakeUser;
    userAgent: string;
    lingerMs: number;
    ignoreHttpsErrors: boolean;
  }
): Promise<Omit<LiveResult, "locale" | "utmSource" | "email">> {
  // posthog-js drops events from user agents that say HeadlessChrome, so the context sends a desktop one.
  const context = await browser.newContext({
    locale: locale.locale,
    timezoneId: locale.timeZone,
    userAgent,
    ignoreHTTPSErrors: ignoreHttpsErrors,
  });
  let posthogRequests = 0;
  context.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).hostname.includes("posthog")) posthogRequests++;
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    const signupUrl = new URL("/signup", url);
    if (utmSource) signupUrl.searchParams.set("utm_source", utmSource);

    await page.goto(signupUrl.toString());
    await page.getByTestId("continue-with-email-button").click();
    await page.getByTestId("signup-usernamefield").fill(user.username);
    await page.getByTestId("signup-emailfield").fill(user.email);
    await page.getByTestId("signup-passwordfield").fill(user.password);
    await page.getByTestId("signup-submit-button").click();

    // The Alert component replaces the form's own test id with "alert".
    const errorAlert = page.locator("form").getByTestId("alert");
    let outcome = await Promise.race([
      page
        .waitForURL((current) => !current.pathname.startsWith("/signup"))
        .then(
          () => "signed-up" as LiveOutcome,
          () => "no-result" as LiveOutcome
        ),
      errorAlert.waitFor({ state: "visible" }).then(
        () => "app-error" as LiveOutcome,
        () => "no-result" as LiveOutcome
      ),
    ]);
    let detail = `no redirect and no error after ${STEP_TIMEOUT_MS / 1000}s`;
    if (outcome === "app-error") detail = ((await errorAlert.textContent()) ?? "").trim();
    if (outcome === "signed-up") detail = new URL(page.url()).pathname;
    // The app sends an existing account to the login page instead of showing an error.
    if (detail.startsWith("/auth/login")) {
      outcome = "app-error";
      detail = "account already exists, sent to /auth/login";
    }

    if (lingerMs > 0) await page.waitForTimeout(lingerMs);
    return { outcome, detail, posthogRequests };
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { outcome: "no-result", detail: message, posthogRequests };
  } finally {
    await context.close();
  }
}

async function runLiveSignups(options: LiveOptions, log: (line: string) => void): Promise<LiveResult[]> {
  const rng = createRng(options.seed);
  const browser = await chromium.launch({
    headless: !options.headed,
    executablePath: options.executablePath,
    args: [
      // posthog-js also drops every event while navigator.webdriver is true.
      "--disable-blink-features=AutomationControlled",
      // A TLS-intercepting proxy cannot answer Encrypted Client Hello, and Chrome then refuses the page.
      ...(options.ignoreHttpsErrors ? ["--disable-features=EncryptedClientHello,UseDnsHttpsSvcb"] : []),
    ],
  });
  const userAgent = desktopChromeUserAgent(browser.version());
  const results: LiveResult[] = [];

  try {
    for (let index = 0; index < options.count; index++) {
      const locale = pickWeighted(LOCALES, rng);
      const utmSource = pickUtmSource(locale.language, options.failingLanguages, rng);
      const user = createFakeUser(locale.language, options.emailDomain, rng);
      const result = await signUpOnce(browser, {
        url: options.url,
        locale,
        utmSource,
        user,
        userAgent,
        lingerMs: options.lingerMs,
        ignoreHttpsErrors: options.ignoreHttpsErrors,
      });
      results.push({ locale: locale.locale, utmSource, email: user.email, ...result });
      log(
        `[${index + 1}/${options.count}] ${locale.locale} utm_source=${utmSource ?? "(none)"} ${user.email}: ${result.outcome} (${result.detail}), ${result.posthogRequests} PostHog requests`
      );
      if (index < options.count - 1 && options.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

export { runLiveSignups };
export type { LiveOutcome, LiveResult };

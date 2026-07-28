import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { TopNav } from "../components/TopNav";
import NotificationEngine from "../components/NotificationEngine";
import { loadSettingsCache } from "../lib/settings-storage";
import { isLoggedIn } from "../lib/auth-storage";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Try refreshing or head back home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Dashboard — Navana Rest House" },
      { name: "description", content: "Daily operations overview for Navana Rest House." },
      { property: "og:title", content: "Dashboard — Navana Rest House" },
      { name: "twitter:title", content: "Dashboard — Navana Rest House" },
      { property: "og:description", content: "Daily operations overview for Navana Rest House." },
      { name: "twitter:description", content: "Daily operations overview for Navana Rest House." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cbd08350-3839-404b-8573-b3db7b965c3d/id-preview-f801d6b8--042f5736-c1d4-4b73-809f-ba2b6f025f70.lovable.app-1783246426410.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/cbd08350-3839-404b-8573-b3db7b965c3d/id-preview-f801d6b8--042f5736-c1d4-4b73-809f-ba2b6f025f70.lovable.app-1783246426410.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    loadSettingsCache();
  }, []);

  // Login guard: bounce signed-out visitors to /login, and signed-in visitors
  // away from /login. Re-runs on every navigation and whenever login()/logout()
  // fire the "authUpdated" event, so it reacts immediately (no full reload needed).
  useEffect(() => {
    function checkAuth() {
      const loggedIn = isLoggedIn();
      if (!loggedIn && pathname !== "/login") {
        navigate({ to: "/login" });
      } else if (loggedIn && pathname === "/login") {
        navigate({ to: "/" });
      }
      setChecked(true);
    }

    checkAuth();
    window.addEventListener("authUpdated", checkAuth);
    return () => window.removeEventListener("authUpdated", checkAuth);
  }, [pathname]);

  const isLoginRoute = pathname === "/login";
  const loggedIn = isLoggedIn();
  const showChrome = checked && loggedIn && !isLoginRoute;
  // Only mount the page itself once we're sure it's safe to (either it's the
  // Login page, or we've confirmed the visitor is signed in) — this keeps
  // protected pages from ever briefly mounting for a signed-out visitor.
  const showOutlet = isLoginRoute || (checked && loggedIn);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        {showChrome && <NotificationEngine />}
        {showChrome && <TopNav className="print:hidden" />}
        {showOutlet &&
          (showChrome ? (
            <main className="mx-auto max-w-[1400px] px-6 py-8">
              <Outlet />
            </main>
          ) : (
            <Outlet />
          ))}
      </div>
    </QueryClientProvider>
  );
}

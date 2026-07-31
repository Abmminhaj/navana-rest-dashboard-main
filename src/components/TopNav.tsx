import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Search,
  Hotel,
  ChevronDown,
  X,
  BedDouble,
  UserRound,
  History,
  LogOut,
} from "lucide-react";
import {
  getNotificationLog,
  markAllRead,
  markRead,
  type NotificationLogEntry,
} from "@/lib/notification-log-storage";
import {
  searchAll,
  searchResultTypeLabel,
  type SearchResult,
  type SearchResultType,
} from "@/lib/global-search";
import { getCurrentUser, logout, canAccess } from "@/lib/auth-storage";
import { getActiveStays } from "@/lib/stay-storage";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/booking", label: "Booking" },
  { to: "/checkout", label: "Check Out" },
  { to: "/customers", label: "Customer Information" },
  { to: "/rooms", label: "Rooms" },
  { to: "/expenses", label: "Expenses" },
  { to: "/reports", label: "Reports" },
  { to: "/inventory", label: "Inventory" },
] as const;

const settingsItem = { to: "/settings", label: "Settings" } as const;

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<NotificationLogEntry[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    setLog(await getNotificationLog());
  }

  useEffect(() => {
    load();
    window.addEventListener("notificationLogUpdated", load);
    return () => window.removeEventListener("notificationLogUpdated", load);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = log.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-accent"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {log.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                কোনো Notification নেই
              </div>
            ) : (
              log.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`block w-full border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/40 ${
                    n.read ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-foreground">{n.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{n.body}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {timeAgo(n.time)}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CheckoutPendingBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const stays = await getActiveStays();
      if (!cancelled) setCount(stays.length);
    }
    load();
    const interval = window.setInterval(load, 30000);
    window.addEventListener("activeStaysUpdated", load);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("activeStaysUpdated", load);
    };
  }, []);

  if (count === 0) return null;
  return (
    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const RESULT_ICON: Record<SearchResultType, typeof UserRound> = {
  guest: UserRound,
  customer: History,
  room: BedDouble,
};

function NavSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      return;
    }
    searchAll(q)
      .then((res) => {
        if (!cancelled) setResults(res);
      })
      .catch((error) => {
        console.error("Global search failed:", error);
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goTo(result: SearchResult) {
    navigate({ to: result.route, search: { highlight: result.highlightKey } } as any);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    setQuery("");
    setOpen(false);
  }

  const grouped: Record<SearchResultType, SearchResult[]> = {
    guest: results.filter((r) => r.type === "guest"),
    customer: results.filter((r) => r.type === "customer"),
    room: results.filter((r) => r.type === "room"),
  };

  return (
    <div className="relative w-56 sm:w-72" ref={ref}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search customer, phone, room, NID…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) goTo(results[0]);
        }}
        onFocus={() => setOpen(true)}
        className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      {query && (
        <button
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && query.trim().length > 0 && (
        <div className="absolute left-0 top-12 z-50 w-full rounded-xl border border-border bg-card shadow-2xl">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              কোনো ফলাফল পাওয়া যায়নি
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto py-1">
              {(["guest", "customer", "room"] as SearchResultType[]).map((type) =>
                grouped[type].length === 0 ? null : (
                  <div key={type} className="py-1">
                    <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {searchResultTypeLabel(type)}
                    </div>
                    {grouped[type].map((r) => {
                      const Icon = RESULT_ICON[r.type];
                      return (
                        <button
                          key={r.id}
                          onClick={() => goTo(r)}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/40"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {r.title}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {r.subtitle}
                            </div>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TopNav({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(getCurrentUser());
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function loadUser() {
      setUser(getCurrentUser());
    }
    loadUser();
    window.addEventListener("authUpdated", loadUser);
    return () => window.removeEventListener("authUpdated", loadUser);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLogout() {
    logout();
    navigate({ to: "/login" });
  }

  const displayName = user?.name || "Staff";
  const displayRole = user?.role || "";

  return (
    <header
      className={"sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur " + className}
    >
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="flex h-16 items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Hotel className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight text-foreground">
                NAVANA REST HOUSE
              </div>
              <div className="text-[11px] font-medium text-muted-foreground">
                Hotel Management System
              </div>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-end gap-3">
            <NavSearch />
            <NotificationBell />
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background pl-1 pr-3 hover:bg-accent"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                  {displayName
                    .split(" ")
                    .map((p) => p[0])
                    .join("")}
                </div>
                <div className="text-left leading-tight">
                  <div className="text-xs font-semibold text-foreground">{displayName}</div>
                  <div className="text-[10px] text-muted-foreground">{displayRole}</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-accent"
                  >
                    <LogOut className="h-4 w-4" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto pb-px">
          {navItems
            .filter((item) => canAccess(user, item.to))
            .map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                className="relative whitespace-nowrap px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-primary"
                activeProps={{
                  className:
                    "relative whitespace-nowrap px-4 py-3 text-sm font-semibold text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
                }}
              >
                {item.label}
                {item.to === "/checkout" && <CheckoutPendingBadge />}
              </Link>
            ))}

          {/* Settings pushed to the far right, separate from the main tabs */}
          {canAccess(user, settingsItem.to) && (
            <Link
              to={settingsItem.to}
              className="relative ml-auto my-2 inline-flex whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
              activeProps={{
                className:
                  "relative ml-auto my-2 inline-flex whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm ring-2 ring-primary/30",
              }}
            >
              {settingsItem.label}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

import { brands } from "@mgc/brands";
import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { authClient, finishSignIn } from "./authClient";

const PrivyButton = lazy(() => import("./PrivyButton"));

interface Config {
  google: boolean;
  apple: boolean;
  privyAppId: string | null;
}

function useConfig() {
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    fetch("/api/config").then((r) => r.json() as Promise<Config>).then(setConfig).catch(() => setConfig({ google: false, apple: false, privyAppId: null }));
  }, []);
  return config;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header>
        <a href="https://martingawlakcompany.com/" className="logo">Martin Gawlak <span>Company</span></a>
      </header>
      <main>{children}</main>
      <footer>One account for {brands.map((b) => b.name).join(", ")}.</footer>
    </div>
  );
}

function SignIn() {
  const config = useConfig();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    if (error) return setError(error.message ?? "Couldn't send a code. Check the address and try again.");
    setStep("code");
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.signIn.emailOtp({ email, otp: code.trim() });
    setBusy(false);
    if (error) return setError(error.message ?? "That code didn't work. Try again or send a new one.");
    finishSignIn(data);
  }

  async function social(provider: "google" | "apple") {
    setError(null);
    const { data, error } = await authClient.signIn.social({ provider, callbackURL: "/account" });
    if (error) return setError(error.message ?? "Sign-in failed.");
    if (data?.url) window.location.assign(data.url);
  }

  return (
    <Shell>
      <h1>Sign in</h1>
      <p className="muted">One account for every Martin Gawlak Company brand. New here? Signing in creates your account.</p>
      {error && <p className="error" role="alert">{error}</p>}

      {step === "email" ? (
        <form onSubmit={sendCode}>
          <label>
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button disabled={busy}>{busy ? "Sending…" : "Email me a sign-in code"}</button>
        </form>
      ) : (
        <form onSubmit={verifyCode}>
          <p>We sent a 6-digit code to <strong>{email}</strong>.</p>
          <label>
            Code
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" className="link" onClick={() => setStep("email")}>Use a different email</button>
        </form>
      )}

      {config && (config.google || config.apple || config.privyAppId) && (
        <>
          <p className="divider"><span>or</span></p>
          <div className="providers">
            {config.privyAppId && (
              <Suspense fallback={<button disabled>Privy</button>}>
                <PrivyButton appId={config.privyAppId} onError={setError} />
              </Suspense>
            )}
            {config.google && <button className="secondary" onClick={() => social("google")}>Continue with Google</button>}
            {config.apple && <button className="secondary" onClick={() => social("apple")}>Continue with Apple</button>}
          </div>
        </>
      )}
    </Shell>
  );
}

function Account() {
  const { data: session, isPending } = authClient.useSession();
  const [accounts, setAccounts] = useState<{ providerId: string }[]>([]);
  useEffect(() => {
    if (session) authClient.listAccounts().then(({ data }) => setAccounts(data ?? []));
  }, [session]);

  if (isPending) return <Shell><p>Loading…</p></Shell>;
  if (!session) {
    window.location.replace("/sign-in");
    return null;
  }
  const labels: Record<string, string> = { credential: "Email code", google: "Google", apple: "Apple", privy: "Privy" };
  const methods = [...new Set(accounts.map((a) => labels[a.providerId] ?? a.providerId))];
  return (
    <Shell>
      <h1>Your account</h1>
      <dl>
        <dt>Name</dt><dd>{session.user.name}</dd>
        <dt>Email</dt><dd>{session.user.email}</dd>
        <dt>Sign-in methods</dt><dd>{methods.length ? methods.join(", ") : "Email code"}</dd>
      </dl>
      <h2>Your brands</h2>
      <ul className="brands">
        {brands.map((b) => <li key={b.id}><a href={b.url}>{b.name}</a></li>)}
      </ul>
      <p className="row">
        {(session.user as { role?: string }).role === "admin" && <a className="button" href="/admin">Admin</a>}
        <button className="secondary" onClick={() => authClient.signOut().then(() => window.location.assign("/sign-in"))}>Sign out</button>
      </p>
    </Shell>
  );
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  createdAt: string | Date;
  banned?: boolean | null;
}

function Admin() {
  const { data: session, isPending } = authClient.useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<{ name: string; origin: string; client_id: string; client_secret?: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    authClient.admin
      .listUsers({ query: { limit: 100, sortBy: "createdAt", sortDirection: "desc", ...(search ? { searchField: "email", searchOperator: "contains", searchValue: search } : {}) } })
      .then(({ data }) => {
        setUsers((data?.users ?? []) as AdminUser[]);
        setTotal(data?.total ?? 0);
      });
  }, [isAdmin, search]);

  async function registerBrands() {
    if (!confirm("Create new sign-in credentials for every brand site? Existing sites keep working until you replace their keys.")) return;
    const res = await fetch("/api/admin/brand-clients", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = (await res.json()) as { error?: string; created: typeof clients };
    if (!res.ok) return setMessage(body.error ?? "Failed");
    setClients(body.created);
    setMessage("Copy each site's client ID and secret into its Cloudflare settings now. Secrets are only shown once.");
  }

  if (isPending) return <Shell><p>Loading…</p></Shell>;
  if (!isAdmin) return <Shell><h1>Admins only</h1><p><a href="/sign-in">Sign in</a> with an admin account.</p></Shell>;
  return (
    <Shell>
      <h1>Admin</h1>
      <h2>Members ({total})</h2>
      <input type="search" placeholder="Search by email" value={search} onChange={(e) => setSearch(e.target.value)} />
      <table>
        <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Joined</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}><td>{u.email}</td><td>{u.name}</td><td>{u.role ?? "user"}</td><td>{new Date(u.createdAt).toLocaleDateString()}</td></tr>
          ))}
        </tbody>
      </table>
      <h2>Brand sites</h2>
      <p className="muted">Each brand site needs its own sign-in credentials from here.</p>
      <button className="secondary" onClick={registerBrands}>Create sign-in credentials for brand sites</button>
      {message && <p className="notice">{message}</p>}
      {clients.length > 0 && (
        <table>
          <thead><tr><th>Site</th><th>SSO_CLIENT_ID</th><th>SSO_CLIENT_SECRET</th></tr></thead>
          <tbody>{clients.map((c) => <tr key={c.client_id}><td>{c.origin}</td><td><code>{c.client_id}</code></td><td><code>{c.client_secret}</code></td></tr>)}</tbody>
        </table>
      )}
    </Shell>
  );
}

function Consent() {
  // Brand sites skip consent; this only appears for third-party apps.
  const params = new URLSearchParams(window.location.search);
  async function answer(accept: boolean) {
    const { data } = await authClient.$fetch<{ url?: string }>("/oauth2/consent", { method: "POST", body: { accept, scope: params.get("scope") ?? undefined } });
    if (data?.url) window.location.assign(data.url);
  }
  return (
    <Shell>
      <h1>Allow access?</h1>
      <p>An app wants to use your Martin Gawlak Company account ({params.get("scope")}).</p>
      <p className="row"><button onClick={() => answer(true)}>Allow</button><button className="secondary" onClick={() => answer(false)}>Deny</button></p>
    </Shell>
  );
}

export function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/sign-in" || path === "/") return path === "/" ? <Redirect to="/account" /> : <SignIn />;
  if (path === "/account") return <Account />;
  if (path === "/admin") return <Admin />;
  if (path === "/consent") return <Consent />;
  return <Shell><h1>Not found</h1><p><a href="/account">Go to your account</a></p></Shell>;
}

function Redirect({ to }: { to: string }) {
  useEffect(() => window.location.replace(to), [to]);
  return null;
}

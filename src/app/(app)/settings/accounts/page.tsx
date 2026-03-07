'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Info, Mail, Shield, Trash2, Star, X, Pencil } from 'lucide-react';

const AI_MODEL_PLACEHOLDERS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-pro',
  ollama: 'llama3',
};

/* ── Setup Guide Dialog ── */

function SetupGuideDialog({ provider, open, onClose }: { provider: string; open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Info className="size-5" />
            Setup Guide
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {provider === 'imap' && (
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              <h4 className="font-medium text-foreground mb-2">Gmail — IMAP with App Password</h4>
              <ol className="list-decimal list-inside space-y-1.5 ml-1">
                <li>Go to your Google Account &rarr; Security (myaccount.google.com/security)</li>
                <li>Enable 2-Step Verification if not already enabled</li>
                <li>Go to &quot;App passwords&quot; (search &quot;App passwords&quot; in account settings)</li>
                <li>Select app: &quot;Mail&quot; and device: &quot;Other (Custom name)&quot; &rarr; enter &quot;emai client&quot;</li>
                <li>Click Generate &mdash; Google will show a 16-character password</li>
                <li>Copy that password &mdash; you&apos;ll use it as your password below</li>
              </ol>
            </div>
            <div className="rounded-md bg-muted/50 p-3 space-y-1">
              <p className="font-medium text-foreground">Gmail settings:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs font-mono">
                <span>IMAP Host:</span><span>imap.gmail.com</span>
                <span>IMAP Port:</span><span>993</span>
                <span>SMTP Host:</span><span>smtp.gmail.com</span>
                <span>SMTP Port:</span><span>587</span>
              </div>
            </div>
            <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Open Google App Passwords <ExternalLink className="size-3" />
            </a>
            <hr className="border-border" />
            <div>
              <h4 className="font-medium text-foreground mb-2">Outlook / Microsoft 365</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs font-mono">
                <span>IMAP Host:</span><span>outlook.office365.com</span>
                <span>SMTP Host:</span><span>smtp.office365.com</span>
                <span>Ports:</span><span>993 (IMAP) / 587 (SMTP)</span>
              </div>
            </div>
            <hr className="border-border" />
            <div>
              <h4 className="font-medium text-foreground mb-2">Other Providers</h4>
              <div className="space-y-2">
                <p className="text-xs"><strong className="text-foreground">Yahoo:</strong> imap.mail.yahoo.com &middot; App Password via Account Info &rarr; Security</p>
                <p className="text-xs"><strong className="text-foreground">iCloud:</strong> imap.mail.me.com &middot; App Password via appleid.apple.com</p>
                <p className="text-xs"><strong className="text-foreground">Fastmail:</strong> imap.fastmail.com &middot; App Password via Settings &rarr; Privacy</p>
              </div>
              <p className="text-xs mt-2">All use Port 993 (IMAP) and Port 587 (SMTP) with SSL/TLS.</p>
            </div>
          </div>
        )}

        {provider === 'gmail' && (
          <div className="space-y-4 text-sm text-muted-foreground">
            <h4 className="font-medium text-foreground mb-2">Gmail API (OAuth2)</h4>
            <ol className="list-decimal list-inside space-y-1.5 ml-1">
              <li>Go to Google Cloud Console &rarr; APIs &amp; Services &rarr; Credentials</li>
              <li>Create a project and enable the Gmail API</li>
              <li>Create OAuth 2.0 credentials (Web application)</li>
              <li>Add redirect URI: http://localhost:3004/api/auth/callback/google</li>
              <li>Copy Client ID and Client Secret</li>
            </ol>
            <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 p-3 text-yellow-600 dark:text-yellow-400">
              <Shield className="size-4 mt-0.5 shrink-0" />
              <p className="text-xs">For development, IMAP with App Passwords is simpler and fully functional.</p>
            </div>
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Open Google Cloud Console <ExternalLink className="size-3" />
            </a>
          </div>
        )}

        {provider === 'outlook' && (
          <div className="space-y-4 text-sm text-muted-foreground">
            <h4 className="font-medium text-foreground mb-2">Outlook / Microsoft Graph</h4>
            <ol className="list-decimal list-inside space-y-1.5 ml-1">
              <li>Go to Azure Portal &rarr; App Registrations</li>
              <li>New registration &rarr; name &quot;emai client&quot;</li>
              <li>Redirect URI: http://localhost:3004/api/auth/callback/azure-ad</li>
              <li>Create client secret under Certificates &amp; Secrets</li>
              <li>Add API permissions: Mail.Read, Mail.Send, Mail.ReadWrite</li>
              <li>Copy Application (client) ID from Overview</li>
            </ol>
            <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Open Azure Portal <ExternalLink className="size-3" />
            </a>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Edit Account Dialog ── */

function EditAccountDialog({ account, open, onClose, onSaved }: {
  account: Account | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('993');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [editAiAdapter, setEditAiAdapter] = useState('');
  const [editAiApiKey, setEditAiApiKey] = useState('');
  const [editAiModel, setEditAiModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (account && open) {
      setName(account.name);
      setHost(account.host ? String(account.host) : '');
      setPort(account.port ? String(account.port) : '993');
      setUser(account.user ? String(account.user) : '');
      setPass(''); // Never pre-fill passwords
      setSmtpHost(account.smtpHost ? String(account.smtpHost) : '');
      setSmtpPort(account.smtpPort ? String(account.smtpPort) : '587');
      setClientId(account.clientId ? String(account.clientId) : '');
      setClientSecret(''); // Never pre-fill secrets
      setEditAiAdapter(account.aiAdapter ? String(account.aiAdapter) : '');
      setEditAiApiKey(''); // Never pre-fill API keys
      setEditAiModel(account.aiModel ? String(account.aiModel) : '');
      setError('');
    }
  }, [account, open]);

  if (!open || !account) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body: Record<string, unknown> = { id: account!.id, name };

      // Only send credentials if user provided a new password (otherwise keep existing)
      if (account!.providerType === 'imap' && pass) {
        body.credentials = {
          host: host || account!.host || undefined,
          port: port ? Number(port) : undefined,
          secure: port ? Number(port) === 993 : true,
          auth: { user, pass },
          smtp: {
            host: smtpHost || (host ? host.replace('imap', 'smtp') : undefined),
            port: smtpPort ? Number(smtpPort) : undefined,
            secure: smtpPort ? Number(smtpPort) === 465 : false,
            auth: { user, pass },
          },
        };
      } else if ((account!.providerType === 'gmail' || account!.providerType === 'outlook') && clientId && clientSecret) {
        body.credentials = { clientId, clientSecret };
      }

      // AI configuration — send adapter even if empty (to allow clearing)
      body.aiAdapter = editAiAdapter || null;
      if (editAiAdapter) {
        if (editAiApiKey) body.aiApiKey = editAiApiKey;
        body.aiModel = editAiModel || undefined;
      } else {
        body.aiModel = null;
      }

      const res = await fetch('/api/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        onSaved();
        onClose();
      }
    } catch {
      setError('Failed to update account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Edit Account</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-4">{error}</div>}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Account Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>

          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Provider: <strong>{account.providerType.toUpperCase()}</strong></p>
            <p className="text-xs text-muted-foreground mt-1">Leave credential fields blank to keep existing values. Fill them in to update.</p>
          </div>

          {account.providerType === 'imap' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">IMAP Host</label>
                  <input value={host} onChange={(e) => setHost(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="imap.gmail.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">IMAP Port</label>
                  <input value={port} onChange={(e) => setPort(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email / Username</label>
                <input value={user} onChange={(e) => setUser(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="you@gmail.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password / App Password</label>
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Leave blank to keep current" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">SMTP Host</label>
                  <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="smtp.gmail.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">SMTP Port</label>
                  <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                </div>
              </div>
            </>
          )}

          {(account.providerType === 'gmail' || account.providerType === 'outlook') && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Client ID</label>
                <input value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Leave blank to keep current" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Client Secret</label>
                <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Leave blank to keep current" />
              </div>
            </>
          )}

          {/* AI Configuration */}
          <div className="border-t border-border pt-4 mt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">AI Configuration (Optional)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">AI Adapter</label>
                <select
                  value={editAiAdapter}
                  onChange={(e) => setEditAiAdapter(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="ollama">Ollama (local)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">Select an AI provider to enable email analysis, priority scoring, and smart features.</p>
              </div>
              {editAiAdapter && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">AI API Key</label>
                    <input
                      type="password"
                      value={editAiApiKey}
                      onChange={(e) => setEditAiApiKey(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder={account?.hasAiKey ? '••••••••  (key saved — leave blank to keep)' : 'Enter API key'}
                    />
                    {account?.hasAiKey && !editAiApiKey && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                        <Shield className="size-3" /> API key is saved securely. Leave blank to keep it.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">AI Model</label>
                    <input
                      value={editAiModel}
                      onChange={(e) => setEditAiModel(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder={AI_MODEL_PLACEHOLDERS[editAiAdapter] || ''}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave blank to use the default model ({AI_MODEL_PLACEHOLDERS[editAiAdapter]})</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Connected Accounts List ── */

interface Account {
  id: string;
  name: string;
  providerType: string;
  isDefault: boolean;
  aiAdapter: string | null;
  aiModel?: string | null;
  hasAiKey?: boolean;
  // Non-sensitive credential fields returned by GET /api/accounts
  host?: string;
  port?: number;
  user?: string;
  smtpHost?: string;
  smtpPort?: number;
  clientId?: string;
}

function ConnectedAccounts({ accounts, onRefresh }: { accounts: Account[]; onRefresh: () => void }) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to disconnect this account?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' });
      onRefresh();
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await fetch('/api/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isDefault: true }),
      });
      onRefresh();
    } catch {
      // ignore
    }
  }

  if (accounts.length === 0) return null;

  return (
    <>
      <div className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Connected Accounts</h2>
        <div className="space-y-2">
          {accounts.map((account) => (
            <div key={account.id} className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <Mail className="size-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    {account.name}
                    {account.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        <Star className="size-3" /> Default
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {account.providerType.toUpperCase()}
                    {account.user && ` · ${account.user}`}
                    {account.host && ` · ${account.host}`}
                  </p>
                  {account.aiAdapter && (
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded mt-1 inline-flex items-center gap-1">
                      AI: {account.aiAdapter}
                      {account.hasAiKey ? (
                        <Shield className="size-3 text-green-600 dark:text-green-400" />
                      ) : (
                        <span className="text-destructive">!</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!account.isDefault && (
                  <button
                    onClick={() => handleSetDefault(account.id)}
                    className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    Set as default
                  </button>
                )}
                <button
                  onClick={() => setEditingAccount(account)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Edit account"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  disabled={deleting === account.id}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                  title="Delete account"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <EditAccountDialog
        account={editingAccount}
        open={!!editingAccount}
        onClose={() => setEditingAccount(null)}
        onSaved={onRefresh}
      />
    </>
  );
}

/* ── Main Page ── */

export default function AccountsSettingsPage() {
  const router = useRouter();
  const [providerType, setProviderType] = useState('imap');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('993');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [aiAdapter, setAiAdapter] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [guideOpen, setGuideOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.accounts) setAccounts(data.accounts);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || `${providerType} account`,
          providerType,
          credentials: providerType === 'imap' ? {
            host, port: Number(port), secure: Number(port) === 993,
            auth: { user, pass },
            smtp: { host: smtpHost || host.replace('imap', 'smtp'), port: Number(smtpPort), secure: Number(smtpPort) === 465, auth: { user, pass } },
          } : providerType === 'gmail' ? {
            clientId: user,
            clientSecret: pass,
          } : {
            clientId: user,
            clientSecret: pass,
          },
          ...(aiAdapter && { aiAdapter, aiApiKey, aiModel: aiModel || undefined }),
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSuccess('Account connected successfully!');
        setName('');
        setHost('');
        setUser('');
        setPass('');
        setSmtpHost('');
        setAiAdapter('');
        setAiApiKey('');
        setAiModel('');
        fetchAccounts();
        router.refresh();
      }
    } catch {
      setError('Failed to connect account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Email Accounts</h1>
      <p className="text-sm text-muted-foreground mb-6">Connect your email account to start using the client.</p>

      <ConnectedAccounts accounts={accounts} onRefresh={fetchAccounts} />

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="size-5" />
            Connect a New Account
          </h2>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Info className="size-3.5" />
            Setup Guide
          </button>
        </div>

        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {success && <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-600">{success}</div>}

        <div>
          <label className="block text-sm font-medium mb-1">Provider</label>
          <select
            value={providerType}
            onChange={(e) => setProviderType(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="imap">IMAP/SMTP</option>
            <option value="gmail">Gmail API</option>
            <option value="outlook">Outlook / Microsoft Graph</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Account Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="e.g. Work Email"
          />
        </div>

        {providerType === 'imap' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">IMAP Host</label>
                <input value={host} onChange={(e) => setHost(e.target.value)} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="imap.gmail.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">IMAP Port</label>
                <input value={port} onChange={(e) => setPort(e.target.value)} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email / Username</label>
              <input value={user} onChange={(e) => setUser(e.target.value)} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="you@gmail.com" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password / App Password</label>
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <p className="text-xs text-muted-foreground mt-1">For Gmail, use an App Password. Click &quot;Setup Guide&quot; for instructions.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">SMTP Host</label>
                <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="smtp.gmail.com" />
                <p className="text-xs text-muted-foreground mt-1">Leave blank to auto-detect</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">SMTP Port</label>
                <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
            </div>
          </>
        )}

        {(providerType === 'gmail' || providerType === 'outlook') && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Client ID</label>
              <input value={user} onChange={(e) => setUser(e.target.value)} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={providerType === 'gmail' ? 'xxxxxx.apps.googleusercontent.com' : 'Application (client) ID'} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Client Secret</label>
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </>
        )}

        {/* AI Configuration */}
        <div className="border-t border-border pt-4 mt-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">AI Configuration (Optional)</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">AI Adapter</label>
              <select
                value={aiAdapter}
                onChange={(e) => setAiAdapter(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">None</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google</option>
                <option value="ollama">Ollama (local)</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">Select an AI provider to enable email analysis, priority scoring, and smart features.</p>
            </div>
            {aiAdapter && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">AI API Key</label>
                  <input
                    type="password"
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder={aiAdapter === 'ollama' ? 'Not required for Ollama' : 'sk-...'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">AI Model</label>
                  <input
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder={AI_MODEL_PLACEHOLDERS[aiAdapter] || ''}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to use the default model ({AI_MODEL_PLACEHOLDERS[aiAdapter]})</p>
                </div>
              </>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Connect Account'}
        </button>
      </form>

      <SetupGuideDialog provider={providerType} open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

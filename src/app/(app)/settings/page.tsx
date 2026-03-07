import Link from 'next/link';
import { Settings, User, Brain, Workflow } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="flex-1 p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="space-y-4">
        <Link
          href="/settings/accounts"
          className="flex items-center gap-4 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
        >
          <User className="size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Email Accounts</p>
            <p className="text-sm text-muted-foreground">Connect and manage your email accounts</p>
          </div>
        </Link>
        <Link
          href="/settings/ai"
          className="flex items-center gap-4 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
        >
          <Brain className="size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">AI Features</p>
            <p className="text-sm text-muted-foreground">Configure AI providers and toggle features</p>
          </div>
        </Link>
        <Link
          href="/settings/workflows"
          className="flex items-center gap-4 rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
        >
          <Workflow className="size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Workflow Rules</p>
            <p className="text-sm text-muted-foreground">Automate actions based on AI analysis of your emails</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

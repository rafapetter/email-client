'use client';

import { use } from 'react';
import { EmailPaneLayout } from '@/components/layout/email-pane-layout';

export default function InboxEmailPage({ params }: { params: Promise<{ emailId: string }> }) {
  const { emailId } = use(params);
  return <EmailPaneLayout folder="INBOX" initialEmailId={emailId} />;
}

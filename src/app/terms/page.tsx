'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default function TermsPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 md:px-6 py-12 bg-gradient-to-br from-white via-yellow-50/30 to-amber-50/40">
      <div className="w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Terms and Conditions</CardTitle>
            <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </CardHeader>
          <CardContent className="space-y-6 text-sm leading-relaxed text-gray-700">
            <p>
              This is placeholder text for CONNEXT&apos;s Terms and Conditions. Replace this
              page with your finalized terms before launch.
            </p>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900">1. Acceptance of Terms</h2>
              <p>
                By creating an account and using CONNEXT, you agree to be bound by these
                Terms and Conditions and our Privacy Policy.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900">2. Use of the Platform</h2>
              <p>
                CONNEXT connects mentees with mentors for scheduled meetings. Users are
                responsible for the accuracy of the information they provide and for
                conducting themselves respectfully during interactions with other users.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900">3. Account Data</h2>
              <p>
                Information submitted during signup (including profile details and any
                uploaded documents) is used to operate the platform, including mentor
                verification and meeting scheduling.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-semibold text-gray-900">4. Changes to These Terms</h2>
              <p>
                These terms may be updated from time to time. Continued use of CONNEXT
                after changes are posted constitutes acceptance of the updated terms.
              </p>
            </section>

            <div className="pt-4 border-t">
              <Link href="/" className="text-sm text-amber-700 hover:text-amber-800 underline">
                ← Back to home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

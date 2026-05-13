import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How LinkSyllabus collects, uses, and shares information when you use our service."
};

const CONTACT_EMAIL = "info@linksyllabus.com";

export default function PrivacyPage() {
  return (
    <main className="container-page py-10 pb-16">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <Link
          href="/"
          className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          Back to home
        </Link>
      </div>

      <article className="card mx-auto max-w-3xl p-6 sm:p-8">
        <h1 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Last updated: May 12, 2026 · LinkSyllabus (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;)
        </p>

        <p className="mt-6 text-sm leading-relaxed text-zinc-700">
          This policy describes how we handle personal information when you visit our website or use
          LinkSyllabus. By using the service, you agree to this policy. If you do not agree, please
          do not use LinkSyllabus.
        </p>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">1. Information we collect</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-700">
            <li>
              <strong className="font-medium text-zinc-800">Account and profile data.</strong> When
              you create an account, we collect information you provide (such as email address and
              password credentials handled by our authentication provider).
            </li>
            <li>
              <strong className="font-medium text-zinc-800">Content you submit.</strong> Tutorial
              inputs, generated steps, media, and related metadata you upload or create through the
              product.
            </li>
            <li>
              <strong className="font-medium text-zinc-800">Usage and technical data.</strong> Log
              and device information typical of web applications (for example IP address, browser
              type, timestamps, and pages or features used) to operate, secure, and improve the
              service.
            </li>
            <li>
              <strong className="font-medium text-zinc-800">Billing-related data.</strong> When you
              purchase paid features, payment processing is handled by Stripe; we receive limited
              billing identifiers needed to fulfill your subscription (we do not store full card
              numbers on our servers).
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">2. Cookies and similar technologies</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-700">
            We use cookies and similar technologies for essential functions (for example keeping you
            signed in and protecting the service) and, where enabled, for analytics. You can control
            cookies through your browser settings; blocking certain cookies may limit parts of the
            experience.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">3. Third-party services</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-700">
            We rely on vendors that process data on our behalf. Their use of information is governed
            by their own policies:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-700">
            <li>
              <strong className="font-medium text-zinc-800">Supabase</strong> — authentication,
              database, storage, and related infrastructure. See{" "}
              <a
                className="text-brand-700 underline-offset-2 hover:underline"
                href="https://supabase.com/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Supabase Privacy Policy
              </a>
              .
            </li>
            <li>
              <strong className="font-medium text-zinc-800">Stripe</strong> — payment processing and
              subscription management. See{" "}
              <a
                className="text-brand-700 underline-offset-2 hover:underline"
                href="https://stripe.com/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Stripe Privacy Policy
              </a>
              .
            </li>
            <li>
              <strong className="font-medium text-zinc-800">Google Analytics</strong> — aggregated
              usage and traffic insights. See{" "}
              <a
                className="text-brand-700 underline-offset-2 hover:underline"
                href="https://policies.google.com/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Google Privacy Policy
              </a>{" "}
              and{" "}
              <a
                className="text-brand-700 underline-offset-2 hover:underline"
                href="https://policies.google.com/technologies/partner-sites"
                rel="noopener noreferrer"
                target="_blank"
              >
                How Google uses data from sites that use their services
              </a>
              .
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">4. How we use information</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-700">
            We use the information above to provide and improve LinkSyllabus, authenticate users,
            process payments, communicate about the service, detect abuse and security issues, and
            comply with legal obligations.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">5. Retention and security</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-700">
            We retain information for as long as your account is active or as needed to operate the
            service and meet legal requirements. We use commercially reasonable safeguards; no method
            of transmission or storage is completely secure.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">6. Your choices and rights</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-700">
            Depending on where you live, you may have rights to access, correct, delete, or restrict
            certain processing of your personal information, or to object or port data. Contact us
            using the email below and we will respond in line with applicable law.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">7. Changes</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-700">
            We may update this policy from time to time. The &quot;Last updated&quot; date at the top
            will change when we post revisions. Continued use of LinkSyllabus after changes means
            you accept the updated policy.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-base font-semibold text-zinc-900">8. Contact</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-700">
            Questions about this policy or your data:{" "}
            <a
              className="font-medium text-brand-700 underline-offset-2 hover:underline"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}

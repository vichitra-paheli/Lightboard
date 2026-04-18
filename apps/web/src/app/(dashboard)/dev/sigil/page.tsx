import { notFound } from 'next/navigation';
import { LightboardSigil, SigilLoader } from '@/components/brand';

/**
 * Internal preview page for the animated LIGHTBOARD sigil.
 *
 * Renders the wordmark at a range of sizes and the looping loader variant on a
 * true-black surface so a designer/engineer can eyeball the stroke weights,
 * stagger, and reduced-motion behavior without booting Storybook.
 *
 * This page is **development-only**. It is hidden behind `notFound()` in
 * production builds and is intentionally not linked from any navigation. It is
 * not translated; all copy is English-only internal labelling.
 */
export default function SigilPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <div
      className="min-h-[calc(100vh-56px)] p-10 flex flex-col gap-10"
      style={{ backgroundColor: 'var(--bg-0)' }}
    >
      <header className="flex flex-col gap-2">
        <span className="lb-eyebrow">INTERNAL PREVIEW</span>
        <h1 className="lb-h-page">Sigil preview</h1>
        <p className="lb-body max-w-prose">
          Dev-only route for eyeballing the animated LIGHTBOARD sigil. Toggle{' '}
          <code>prefers-reduced-motion</code> in DevTools to verify the instant-reveal fallback.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <span className="lb-mono-tag">SIGIL · SIZE 16 / 20 / 40 / 80</span>
        <div className="flex flex-col gap-8 items-start">
          <LightboardSigil size={16} />
          <LightboardSigil size={20} />
          <LightboardSigil size={40} />
          <LightboardSigil size={80} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <span className="lb-mono-tag">LOADER · SIZE 40 · 2000ms INTERVAL</span>
        <SigilLoader size={40} />
      </section>
    </div>
  );
}

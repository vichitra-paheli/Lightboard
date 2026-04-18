'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { LightboardSigil } from '@/components/brand/lightboard-sigil';
import { GridBackdrop } from './grid-backdrop';
import styles from './auth-shell.module.css';

/** Props for {@link AuthShell}. */
export interface AuthShellProps {
  /** The form / card rendered in the center stack below the sigil. */
  children: ReactNode;
  /**
   * Optional tagline override. Defaults to the `auth.tagline` i18n key; pass a
   * pre-translated string when the caller needs a page-specific variant.
   */
  tagline?: string;
}

/**
 * Full-viewport chrome for the /login and /register routes.
 *
 * Layers:
 *   1. {@link GridBackdrop} — animated 48px grid + streaking traces, fades in
 *      at 0ms.
 *   2. Center stack — {@link LightboardSigil} (draws at 400ms), tagline
 *      (fades at 1900ms), and `children` (drops in at 2200ms).
 *   3. Top-left build tag + bottom-right fine print — fade in at 2600/2800ms.
 *
 * The auth layout is a passthrough so this component owns the viewport via
 * `position: fixed; inset: 0`. All timing lives in the companion CSS module
 * except the two React-state flags that toggle `data-visible` on the tagline
 * and card-wrap elements — those let us swap a CSS transition on/off without
 * reaching for animation-delay trickery.
 */
export function AuthShell({ children, tagline }: AuthShellProps) {
  const t = useTranslations('auth');
  const [showTagline, setShowTagline] = useState(false);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    const taglineTimer = window.setTimeout(() => setShowTagline(true), 1900);
    const cardTimer = window.setTimeout(() => setShowCard(true), 2200);
    return () => {
      window.clearTimeout(taglineTimer);
      window.clearTimeout(cardTimer);
    };
  }, []);

  return (
    <div className={styles.root}>
      <div className={styles.backdrop}>
        <GridBackdrop />
      </div>

      <div className={`${styles.buildTag} lb-mono-tag`}>{t('buildTag')}</div>

      <div className={`${styles.finePrint} lb-mono-tag`}>
        <a href="#" className={styles.finePrintLink}>
          {t('privacy')}
        </a>
        <a href="#" className={styles.finePrintLink}>
          {t('terms')}
        </a>
        <span>{t('copyright')}</span>
      </div>

      <div className={styles.centerStack}>
        <div className={styles.brand}>
          <LightboardSigil size={64} delay={400} />
          <p className={styles.tagline} data-visible={showTagline}>
            {tagline ?? t('tagline')}
          </p>
        </div>
        <div className={styles.cardWrap} data-visible={showCard}>
          {children}
        </div>
      </div>
    </div>
  );
}

import { getRequestConfig } from 'next-intl/server';

/**
 * next-intl request configuration.
 * Loads the English locale messages for every request.
 * Adding a new language requires only a new JSON file in /messages/.
 */
export default getRequestConfig(async () => {
  const locale = 'en';

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

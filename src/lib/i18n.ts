import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import fr from '../locales/fr.json';
import es from '../locales/es.json';
import ar from '../locales/ar.json';
import it from '../locales/it.json';
import de from '../locales/de.json';
import pt from '../locales/pt.json';
import ru from '../locales/ru.json';
import tr from '../locales/tr.json';
import el from '../locales/el.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      es: { translation: es },
      ar: { translation: ar },
      it: { translation: it },
      de: { translation: de },
      pt: { translation: pt },
      ru: { translation: ru },
      tr: { translation: tr },
      el: { translation: el }
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

// Handle RTL for Arabic
i18n.on('languageChanged', (lng) => {
  document.dir = lng === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
});

export default i18n;

import './globals.css';
import { Playfair_Display, Inter, JetBrains_Mono } from 'next/font/google';
import Providers from './providers';
import FondReseau from '@/components/FondReseau';

const serif = Playfair_Display({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  title: 'TANJAKAI — Notation des pôles',
  description: "Suivi et notation trimestrielle pondérée des pôles d'activité du groupe TANJAKAI",
};

// Applique le thème mémorisé avant l'affichage (évite le clignotement). Sombre par défaut.
const THEME_INIT = "try{var t=localStorage.getItem('tanjakai-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}";

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${serif.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT }} /></head>
      <body suppressHydrationWarning>
        <FondReseau />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

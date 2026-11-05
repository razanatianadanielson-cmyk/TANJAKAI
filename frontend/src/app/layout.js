import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/source-sans-3';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ui';

export const metadata = {
  title: 'Tanjakai — Notation des pôles',
  description: 'Suivi et notation pondérée trimestrielle des pôles d\'activité du groupe TANJAKAI',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

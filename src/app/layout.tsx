import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'ICE BREAKING - ProtocolX Challenge',
    description: 'An interactive live challenge platform. Connect, compete in logo challenges, and solve real-time puzzles.',
    icons: {
        icon: '/favicon.ico',
    }
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            </head>
            <body>
                {children}
            </body>
        </html>
    );
}


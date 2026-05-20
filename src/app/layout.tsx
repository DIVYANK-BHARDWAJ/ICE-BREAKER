import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Ice Breaker Live Quiz',
    description: 'An interactive live quiz platform for breaking the ice. Connect with your friends, guess logos, and solve emoji puzzles in real-time!',
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
            <body>
                {children}
            </body>
        </html>
    );
}

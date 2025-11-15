import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Rimalweb',
  description: 'Rimalweb - Digital Marketing Services',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}


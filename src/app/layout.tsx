import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Allure Digital - Complete Replica',
  description: 'Exact 1:1 replica',
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


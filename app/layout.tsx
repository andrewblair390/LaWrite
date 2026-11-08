import '../styles/globals.css'

export const metadata = {
  title: 'ink. — Math workspace',
  description: 'A connected workspace for handwritten mathematics',
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
